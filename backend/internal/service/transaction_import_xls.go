package service

import (
	"bytes"
	"encoding/csv"
	"math"
	"reflect"
	"strconv"
	"strings"
	"time"
	"unsafe"

	"github.com/extrame/xls"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

// OLE2 Compound File header — legacy .xls (BIFF) files are stored inside this
// container.
var xlsMagicBytes = []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1}

// IsXLS detects whether the upload should be treated as a legacy .xls
// workbook, based on the filename extension and the OLE2 compound file magic
// bytes.
func IsXLS(filename string, data []byte) bool {
	hasMagic := len(data) >= 8 && bytes.Equal(data[:8], xlsMagicBytes)
	if strings.HasSuffix(strings.ToLower(filename), ".xls") {
		return hasMagic
	}
	return false
}

// ConvertXLSToCSV reads the first sheet of a legacy .xls workbook and
// serializes its rows as CSV bytes, mirroring ConvertXLSXToCSV so that the
// existing CSV parser handles both formats unchanged. Numeric cells that
// reference a date-formatted XF are converted from their Excel serial to a
// dd/mm/yyyy string so the downstream parser recognizes them.
func ConvertXLSToCSV(data []byte) ([]byte, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}

	wb, err := xls.OpenReader(bytes.NewReader(data), "utf-8")
	if err != nil || wb == nil {
		return nil, pkgErrors.ErrImportInvalidFile
	}

	if wb.NumSheets() == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}

	sheet := wb.GetSheet(0)
	if sheet == nil || sheet.MaxRow == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}

	dateXfs := buildDateXfSet(wb)
	date1904 := readWorkbookDate1904(wb)

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	for i := 0; i <= int(sheet.MaxRow); i++ {
		row := readXLSRow(sheet, i, wb, dateXfs, date1904)
		if isBlankRow(row) {
			continue
		}
		if err := writer.Write(row); err != nil {
			return nil, pkgErrors.ErrImportInvalidFile
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, pkgErrors.ErrImportInvalidFile
	}

	if buf.Len() == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}
	return buf.Bytes(), nil
}

// readXLSRow extracts the cells of a row at index i. The underlying library
// stores rows in an unexported map and its `Row(i)` accessor panics on sparse
// rows; we walk the map via reflection so we can also inspect each cell's
// XF index and rewrite Excel-serial dates as readable strings.
func readXLSRow(sheet *xls.WorkSheet, i int, wb *xls.WorkBook, dateXfs map[uint16]bool, date1904 bool) []string {
	rowVal := reflectFieldUnsafe(reflect.ValueOf(sheet).Elem(), "rows")
	if !rowVal.IsValid() || rowVal.Kind() != reflect.Map {
		return readXLSRowFallback(sheet, i)
	}
	rowPtr := rowVal.MapIndex(reflect.ValueOf(uint16(i)))
	if !rowPtr.IsValid() || rowPtr.IsNil() {
		return nil
	}

	colsVal := reflectFieldUnsafe(rowPtr.Elem(), "cols")
	if !colsVal.IsValid() || colsVal.Kind() != reflect.Map {
		return readXLSRowFallback(sheet, i)
	}

	type cell struct {
		col uint16
		val string
	}
	var cells []cell
	maxCol := uint16(0)
	iter := colsVal.MapRange()
	for iter.Next() {
		col := uint16(iter.Key().Uint())
		handler := iter.Value()
		strs := stringifyCell(handler, wb, dateXfs, date1904)
		for off, s := range strs {
			c := col + uint16(off)
			cells = append(cells, cell{col: c, val: s})
			if c > maxCol {
				maxCol = c
			}
		}
	}
	if len(cells) == 0 {
		return nil
	}
	out := make([]string, maxCol+1)
	for _, c := range cells {
		out[c.col] = c.val
	}
	return out
}

// readXLSRowFallback uses the public Row/Col accessor as a last-resort path
// when reflection cannot reach the underlying maps (e.g. if the upstream
// library changes its field names).
func readXLSRowFallback(sheet *xls.WorkSheet, i int) []string {
	var row *xls.Row
	func() {
		defer func() { _ = recover() }()
		row = sheet.Row(i)
	}()
	if row == nil {
		return nil
	}
	first, last := row.FirstCol(), row.LastCol()
	if last < first {
		return nil
	}
	cells := make([]string, 0, last-first+1)
	for c := first; c <= last; c++ {
		cells = append(cells, row.Col(c))
	}
	return cells
}

// stringifyCell renders a single cell. For NumberCol cells whose XF references
// a date format, we convert the raw Excel serial into a dd/mm/yyyy (or
// dd/mm/yyyy HH:MM:SS) string. All other cells fall back to the library's own
// String method, which already handles RK-encoded date cells correctly.
func stringifyCell(handler reflect.Value, wb *xls.WorkBook, dateXfs map[uint16]bool, date1904 bool) []string {
	if !handler.IsValid() {
		return nil
	}
	concrete := handler
	if concrete.Kind() == reflect.Interface {
		concrete = concrete.Elem()
	}
	if !concrete.IsValid() {
		return nil
	}

	switch concrete.Type().String() {
	case "*xls.NumberCol":
		s := concrete.Elem()
		xf := uint16(s.FieldByName("Index").Uint())
		f := s.FieldByName("Float").Float()
		return []string{renderNumeric(f, xf, dateXfs, date1904)}
	case "*xls.RkCol":
		xfrk := concrete.Elem().FieldByName("Xfrk")
		return []string{renderXfRk(xfrk, dateXfs, date1904)}
	case "*xls.MulrkCol":
		xfrks := concrete.Elem().FieldByName("Xfrks")
		out := make([]string, xfrks.Len())
		for i := 0; i < xfrks.Len(); i++ {
			out[i] = renderXfRk(xfrks.Index(i), dateXfs, date1904)
		}
		return out
	}

	// Default: use the library's String(*WorkBook) method via reflection so we
	// don't lose its handling of SST-backed strings, blank cells, etc.
	return callStringMethod(handler, wb)
}

// renderNumeric formats a raw double cell value, honoring date-format XFs.
func renderNumeric(f float64, xf uint16, dateXfs map[uint16]bool, date1904 bool) string {
	if dateXfs[xf] {
		return formatExcelSerial(f, date1904)
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// renderXfRk decodes an XfRk struct (XF index + RK-encoded value) and formats
// it, honoring date-format XFs. We reimplement RK decoding because the
// upstream library's renderer formats any user-defined-format XF as a date
// regardless of whether the format is actually a date — which would otherwise
// rewrite plain amounts as dates.
func renderXfRk(xfrk reflect.Value, dateXfs map[uint16]bool, date1904 bool) string {
	xf := uint16(xfrk.FieldByName("Index").Uint())
	rk := uint32(xfrk.FieldByName("Rk").Uint())
	i, f, isFloat := decodeRK(rk)
	val := float64(i)
	if isFloat {
		val = f
	}
	if dateXfs[xf] {
		return formatExcelSerial(val, date1904)
	}
	if isFloat {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	return strconv.FormatInt(i, 10)
}

// decodeRK unpacks Excel's RK number encoding: 30-bit signed integer or
// 30 high bits of an IEEE-754 double, optionally multiplied by 100.
func decodeRK(rk uint32) (intNum int64, floatNum float64, isFloat bool) {
	multiplied := rk & 1
	isInt := rk & 2
	val := rk >> 2
	if isInt == 0 {
		floatNum = math.Float64frombits(uint64(val) << 34)
		if multiplied != 0 {
			floatNum /= 100
		}
		return 0, floatNum, true
	}
	// Sign-extend the 30-bit value to int32.
	signed := int32(val)
	if val&(1<<29) != 0 {
		signed = int32(val | 0xC0000000)
	}
	if multiplied != 0 {
		return 0, float64(signed) / 100, true
	}
	return int64(signed), 0, false
}

// callStringMethod invokes the contentHandler.String(*WorkBook) method on a
// reflected interface value. Because the interface type is unexported in the
// library we cannot type-assert it directly; we look up the method by name and
// invoke it with the real workbook so SST/format lookups resolve correctly.
func callStringMethod(handler reflect.Value, wb *xls.WorkBook) []string {
	m := handler.MethodByName("String")
	if !m.IsValid() {
		return nil
	}
	results := m.Call([]reflect.Value{reflect.ValueOf(wb)})
	if len(results) == 0 {
		return nil
	}
	if v, ok := results[0].Interface().([]string); ok {
		return v
	}
	return nil
}

// buildDateXfSet inspects the workbook's XF table and returns the set of XF
// indices whose number format is a date-or-time format. Recognizes Excel's
// built-in date format codes (matching the upstream library's own list) and
// user-defined formats whose pattern contains date tokens.
func buildDateXfSet(wb *xls.WorkBook) map[uint16]bool {
	out := map[uint16]bool{}
	xfsVal := reflect.ValueOf(wb).Elem().FieldByName("Xfs")
	if !xfsVal.IsValid() || xfsVal.Kind() != reflect.Slice {
		return out
	}
	formatsVal := reflect.ValueOf(wb).Elem().FieldByName("Formats")
	for i := 0; i < xfsVal.Len(); i++ {
		xfVal := xfsVal.Index(i)
		if xfVal.Kind() == reflect.Interface {
			xfVal = xfVal.Elem()
		}
		if !xfVal.IsValid() {
			continue
		}
		if xfVal.Kind() == reflect.Ptr {
			xfVal = xfVal.Elem()
		}
		fNoField := xfVal.FieldByName("Format")
		if !fNoField.IsValid() {
			continue
		}
		fNo := uint16(fNoField.Uint())
		if isBuiltinDateFormat(fNo) {
			out[uint16(i)] = true
			continue
		}
		if fNo >= 164 && formatsVal.IsValid() && formatsVal.Kind() == reflect.Map {
			entry := formatsVal.MapIndex(reflect.ValueOf(fNo))
			if entry.IsValid() && !entry.IsNil() {
				strField := reflectFieldUnsafe(entry.Elem(), "str")
				if strField.IsValid() && strField.Kind() == reflect.String {
					if looksLikeDateFormat(strField.String()) {
						out[uint16(i)] = true
					}
				}
			}
		}
	}
	return out
}

// isBuiltinDateFormat mirrors the upstream library's check for Excel built-in
// number formats that represent dates and/or times.
func isBuiltinDateFormat(fNo uint16) bool {
	switch {
	case fNo >= 14 && fNo <= 17:
		return true
	case fNo == 22:
		return true
	case fNo >= 27 && fNo <= 36:
		return true
	case fNo >= 45 && fNo <= 47:
		return true
	case fNo >= 50 && fNo <= 58:
		return true
	}
	return false
}

// looksLikeDateFormat returns true if the format string contains tokens that
// only appear in date / time number formats. It strips quoted literals and
// escaped characters first so an amount format like `"R$"# ##0,00` is not
// classified as a date.
func looksLikeDateFormat(fmtStr string) bool {
	stripped := stripFormatLiterals(fmtStr)
	stripped = strings.ToLower(stripped)
	tokens := []string{"yyyy", "yy", "mmmm", "mmm", "mm", "dd", "hh", "ss", "am/pm", "a/p"}
	for _, tok := range tokens {
		if strings.Contains(stripped, tok) {
			return true
		}
	}
	// Single `m`, `d`, `h`, `s`, `y` after stripping is also a strong signal,
	// but only when not adjacent to digits or other letters.
	for _, r := range "ymdhs" {
		if strings.ContainsRune(stripped, r) {
			return true
		}
	}
	return false
}

func stripFormatLiterals(s string) string {
	var b strings.Builder
	inQuote := false
	skipNext := false
	for _, r := range s {
		if skipNext {
			skipNext = false
			continue
		}
		switch {
		case r == '"':
			inQuote = !inQuote
		case r == '\\':
			skipNext = true
		case inQuote:
			// drop quoted literal contents
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// readWorkbookDate1904 returns true when the workbook uses the 1904 date
// system (rare; mostly older Mac files).
func readWorkbookDate1904(wb *xls.WorkBook) bool {
	v := reflectFieldUnsafe(reflect.ValueOf(wb).Elem(), "dateMode")
	if !v.IsValid() {
		return false
	}
	return v.Uint() == 1
}

// formatExcelSerial converts an Excel date serial number to a readable string.
// Whole-number serials render as `dd/mm/yyyy`; serials with a fractional part
// (representing a time of day) render as `dd/mm/yyyy HH:MM:SS`.
func formatExcelSerial(serial float64, date1904 bool) string {
	t := excelSerialToTime(serial, date1904)
	_, frac := splitFloat(serial)
	if frac == 0 {
		return t.Format("02/01/2006")
	}
	return t.Format("02/01/2006 15:04:05")
}

func splitFloat(f float64) (int64, float64) {
	i := int64(f)
	return i, f - float64(i)
}

// excelSerialToTime mirrors github.com/extrame/xls's unexported helper for
// serials beyond the Excel pre-1900 Julian boundary, which covers every real
// date a bank export would carry.
func excelSerialToTime(serial float64, date1904 bool) time.Time {
	var epoch time.Time
	if date1904 {
		epoch = time.Date(1904, 1, 1, 0, 0, 0, 0, time.UTC)
	} else {
		// Excel's well-known phantom-leap-day epoch.
		epoch = time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
	}
	intPart, frac := splitFloat(serial)
	const dayNs = 24 * 60 * 60 * 1_000_000_000
	return epoch.Add(time.Duration(intPart) * 24 * time.Hour).
		Add(time.Duration(frac * dayNs))
}

// reflectFieldUnsafe returns a Value for an unexported struct field that is
// safe to read via .Interface() / .Uint() / .String() / .MapIndex(). The
// upstream xls library keeps row/cell maps in unexported fields; without this
// helper we cannot inspect a cell's XF index to detect date-formatted values.
//
//nolint:gosec // G103: deliberate use of unsafe to access unexported fields of a third-party type.
func reflectFieldUnsafe(parent reflect.Value, name string) reflect.Value {
	if !parent.IsValid() || parent.Kind() != reflect.Struct {
		return reflect.Value{}
	}
	f := parent.FieldByName(name)
	if !f.IsValid() || !f.CanAddr() {
		return f
	}
	return reflect.NewAt(f.Type(), unsafe.Pointer(f.UnsafeAddr())).Elem()
}
