package service

import (
	"bytes"
	"encoding/csv"
	"strings"

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
// existing CSV parser handles both formats unchanged.
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

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	for i := 0; i <= int(sheet.MaxRow); i++ {
		row := readXLSRow(sheet, i)
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
// panics when the row is sparse (not present in its internal map), so we wrap
// the access in a recover and return an empty slice for missing rows.
func readXLSRow(sheet *xls.WorkSheet, i int) []string {
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
