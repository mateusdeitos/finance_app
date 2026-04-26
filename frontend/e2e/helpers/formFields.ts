/**
 * Form-field interaction helpers for Playwright e2e tests.
 *
 * Encapsulate the Mantine-specific quirks (CurrencyInput keydown loop,
 * combobox option portals, SegmentedControl item targeting) so Page Objects
 * stay short and tests don't drift back to fragile `getByRole('option')` /
 * `getByText(label)` patterns.
 *
 * Conventions:
 * - All helpers take `root: Page | Locator` first to scope inside drawers/forms.
 * - Helpers that resolve portalled content (Select dropdown options) extract
 *   the `Page` from `root` internally.
 * - Selects and Segmented controls take an option `testid` — never a label —
 *   per `frontend/CLAUDE.md` selectors policy.
 */

import { type Page, type Locator } from '@playwright/test'

export type FieldRoot = Page | Locator

function resolvePage(root: FieldRoot): Page {
  return 'page' in root ? root.page() : root
}

// ─── Plain text / textarea / number ───────────────────────────────────────────

export async function fillText(root: FieldRoot, testid: string, value: string): Promise<void> {
  await root.getByTestId(testid).fill(value)
}

export async function clearText(root: FieldRoot, testid: string): Promise<void> {
  await root.getByTestId(testid).fill('')
}

export async function fillTextarea(root: FieldRoot, testid: string, value: string): Promise<void> {
  await root.getByTestId(testid).fill(value)
}

export async function fillNumber(
  root: FieldRoot,
  testid: string,
  value: number | string,
): Promise<void> {
  await root.getByTestId(testid).fill(String(value))
}

// ─── CurrencyInput (custom keydown handler — only per-key presses work) ──────

export async function fillCurrencyCents(
  root: FieldRoot,
  testid: string,
  cents: number,
): Promise<void> {
  const input = root.getByTestId(testid)
  await input.click()
  for (const digit of String(cents)) {
    await input.press(digit)
  }
}

export async function clearAndFillCurrencyCents(
  root: FieldRoot,
  testid: string,
  cents: number,
): Promise<void> {
  const input = root.getByTestId(testid)
  await input.click()
  await input.press('Control+a')
  for (const digit of String(cents)) {
    await input.press(digit)
  }
}

// ─── Date / Month picker ──────────────────────────────────────────────────────

/**
 * Type a date directly into a Mantine `DateInput`.
 * Pass it in the format the input expects (component default is DD/MM/YYYY).
 * Tabs out to commit the value and close the popover.
 */
export async function fillDateInput(
  root: FieldRoot,
  testid: string,
  formattedDate: string,
): Promise<void> {
  const input = root.getByTestId(testid)
  await input.click()
  await input.fill(formattedDate)
  await input.press('Tab')
}

// ─── Select (Mantine combobox) ────────────────────────────────────────────────

interface SelectOptionParams {
  /**
   * Optional text to type into the search-enabled combobox before clicking
   * the option. Use when the option list is virtualised or long; otherwise
   * leave undefined and the helper just clicks the testid.
   */
  search?: string
}

/**
 * Pick an option from a Mantine `Select` by clicking its `optionTestId`.
 *
 * The component must instrument its option via `renderOption` with the
 * matching `data-testid`. Helpers do not fall back to `getByRole('option', { name })`
 * — that path is forbidden by the testid-only selector policy.
 */
export async function selectOption(
  root: FieldRoot,
  triggerTestId: string,
  optionTestId: string,
  params: SelectOptionParams = {},
): Promise<void> {
  const trigger = root.getByTestId(triggerTestId)
  await trigger.click()
  if (params.search) {
    await trigger.fill(params.search)
  }
  // Mantine renders Select options in a portal attached to <body>, so resolve
  // the option locator from the Page rather than from `root`.
  await resolvePage(root).getByTestId(optionTestId).click()
}

// ─── TagsInput (multi) ────────────────────────────────────────────────────────

/**
 * Add multiple tags to a Mantine `TagsInput`. Presses `Enter` after each tag,
 * which both creates new tags and confirms suggestions.
 */
export async function fillTagsInput(
  root: FieldRoot,
  testid: string,
  values: string[],
): Promise<void> {
  const input = root.getByTestId(testid)
  await input.click()
  for (const tag of values) {
    await input.fill(tag)
    await input.press('Enter')
  }
}

// ─── Radio / Checkbox / Switch ────────────────────────────────────────────────

export async function pickRadio(root: FieldRoot, testid: string): Promise<void> {
  await root.getByTestId(testid).check()
}

export async function setCheckbox(
  root: FieldRoot,
  testid: string,
  checked: boolean,
): Promise<void> {
  await root.getByTestId(testid).setChecked(checked)
}

export async function setSwitch(root: FieldRoot, testid: string, on: boolean): Promise<void> {
  await root.getByTestId(testid).setChecked(on)
}

// ─── SegmentedControl ─────────────────────────────────────────────────────────

/**
 * Click an option inside a Mantine `SegmentedControl`.
 *
 * The component must render each item's `label` as JSX carrying the
 * `optionTestId`, e.g.
 *   `{ value: 'expense', label: <span data-testid={...}>Despesa</span> }`.
 */
export async function pickSegmented(
  root: FieldRoot,
  segmentedTestId: string,
  optionTestId: string,
): Promise<void> {
  await root.getByTestId(segmentedTestId).getByTestId(optionTestId).click()
}

// ─── FileInput ────────────────────────────────────────────────────────────────

export interface FilePayload {
  name: string
  mimeType: string
  buffer: Buffer
}

export type FileInputContent = string | string[] | FilePayload | FilePayload[]

export async function setFileInput(
  root: FieldRoot,
  testid: string,
  files: FileInputContent,
): Promise<void> {
  await root.getByTestId(testid).setInputFiles(files)
}
