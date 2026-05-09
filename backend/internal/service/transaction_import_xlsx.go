package service

import (
	"bytes"
	"encoding/csv"
	"strings"

	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/xuri/excelize/v2"
)

var xlsxMagicBytes = []byte{0x50, 0x4B, 0x03, 0x04}

// IsXLSX detects whether the upload should be treated as a .xlsx workbook,
// based on the filename extension and the ZIP container magic bytes.
func IsXLSX(filename string, data []byte) bool {
	hasMagic := len(data) >= 4 && bytes.Equal(data[:4], xlsxMagicBytes)
	if strings.HasSuffix(strings.ToLower(filename), ".xlsx") {
		return hasMagic
	}
	return false
}

// ConvertXLSXToCSV reads the first sheet of an .xlsx workbook and serializes
// its rows as CSV bytes. Cell values are taken as displayed in Excel
// (formatted), so dates and locale-aware numbers preserve user intent and
// the existing CSV parser can handle them unchanged.
func ConvertXLSXToCSV(data []byte) ([]byte, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}

	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, pkgErrors.ErrImportInvalidFile
	}
	defer func() { _ = f.Close() }()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, pkgErrors.ErrImportInvalidFile
	}

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	for _, row := range rows {
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

func isBlankRow(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}
