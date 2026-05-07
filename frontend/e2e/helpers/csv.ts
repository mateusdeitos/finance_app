// Single source of truth for CSV building used by Playwright e2e tests
// and by frontend/scripts/genImportFixture.ts. Mirrors CSV_COLUMNS in
// frontend/src/components/transactions/import/importPayload.ts.

export const CSV_HEADER = 'Data;Descrição;Valor'
export const CSV_HEADER_WITH_CATEGORY = 'Data;Descrição;Valor;Categoria'

/**
 * Build CSV body from a list of rows.
 * - rows: array of string columns; the helper joins each row with `;` and
 *   the rows with `\n` (no trailing newline — matches existing inline copies).
 * - header: defaults to the 3-column header (existing e2e spec behavior).
 *   Pass `CSV_HEADER_WITH_CATEGORY` for fixtures that include the optional
 *   Categoria column.
 */
export function buildCsvContent(rows: string[][], header: string = CSV_HEADER): string {
  return [header, ...rows.map((r) => r.join(';'))].join('\n')
}

/** Format a Date as DD/MM/YYYY (BR import format). */
export function formatDateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}
