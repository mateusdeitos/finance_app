#!/usr/bin/env tsx
/**
 * Deterministic 100-row CSV fixture generator for the import flow.
 *
 * Usage:
 *   npx tsx frontend/scripts/genImportFixture.ts > fixture-100.csv
 *
 * Output is byte-identical across runs because:
 *   - SEED is a fixed constant
 *   - mulberry32 is a deterministic 32-bit PRNG
 *   - Row dates are derived from a fixed BASE_DATE + row index (no `new Date()`)
 *   - No nondeterministic randomness source (the standard library RNG) is used
 *
 * Format: matches CSV_COLUMNS in
 * frontend/src/components/transactions/import/importPayload.ts
 *   Data;Descrição;Valor;Categoria
 *   DD/MM/AAAA;<text>;<-?N,NN>;<text or empty>
 *
 * The 100-row count matches the import flow's hard limit (REQUIREMENTS.md).
 */

import { buildCsvContent, CSV_HEADER_WITH_CATEGORY, formatDateBR } from '../e2e/helpers/csv'

const SEED = 0x16ba5e1e // "16-baseline" mnemonic; any fixed 32-bit int works
const ROW_COUNT = 100
const BASE_DATE = new Date(Date.UTC(2026, 0, 1)) // 2026-01-01 UTC — deterministic anchor

// mulberry32 — deterministic 32-bit PRNG (public domain). Returns a float in [0,1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DESCRIPTIONS = [
  'Mercado',
  'Padaria',
  'Farmácia',
  'Posto Combustível',
  'Restaurante',
  'Cinema',
  'Conta de luz',
  'Conta de água',
  'Internet',
  'Streaming',
] as const

const CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Saúde',
  'Lazer',
  'Casa',
  '', // exercise the optional-category path
] as const

/** Format an integer-cents amount as BR string with comma decimal: 12345 -> "123,45". */
function formatBR(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const reais = Math.floor(abs / 100)
  const centavos = abs % 100
  return `${sign}${reais},${String(centavos).padStart(2, '0')}`
}

/** Add `days` days to BASE_DATE in UTC; return a new Date. */
function addDaysUTC(base: Date, days: number): Date {
  const d = new Date(base.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function generateRows(): string[][] {
  const rng = mulberry32(SEED)
  const rows: string[][] = []
  for (let i = 0; i < ROW_COUNT; i += 1) {
    const date = addDaysUTC(BASE_DATE, i % 90) // spread across ~3 months
    const descIdx = Math.floor(rng() * DESCRIPTIONS.length)
    const description = `${DESCRIPTIONS[descIdx]} #${String(i + 1).padStart(3, '0')}`
    // Amounts: 90% expenses (negative), 10% income (positive). Range 1,00 .. 999,99 (cents 100..99999).
    const isExpense = rng() < 0.9
    const cents = 100 + Math.floor(rng() * 99900)
    const amount = formatBR(isExpense ? -cents : cents)
    const catIdx = Math.floor(rng() * CATEGORIES.length)
    const category = CATEGORIES[catIdx]
    rows.push([formatDateBR(date), description, amount, category])
  }
  return rows
}

function main(): void {
  const rows = generateRows()
  const csv = buildCsvContent(rows, CSV_HEADER_WITH_CATEGORY)
  process.stdout.write(csv)
  process.stdout.write('\n') // trailing newline so `wc -l` reports 101
}

main()
