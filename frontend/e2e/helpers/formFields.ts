/**
 * Form-field interaction helpers for Playwright e2e tests — one class per
 * field kind. Each class wraps a `(root, testid)` pair and exposes only the
 * methods that make sense for that kind, so the type system stops you from
 * calling `.pickCents()` on a text input or `.pick()` on a checkbox.
 *
 * Classes encapsulate the Mantine-specific quirks (CurrencyInput keydown
 * digit-loop, combobox option portals, SegmentedControl item targeting) so
 * Page Objects stay short and tests don't drift back to fragile
 * `getByRole('option')` / `getByText(label)` patterns.
 *
 * Conventions:
 * - Constructor: `(root: Page | Locator, testid: string)`. Always scope `root`
 *   to a drawer/form locator when the field lives inside one — defaulting to
 *   `page` lets stale duplicates match silently.
 * - Selects and SegmentedControls require an option testid (no label
 *   fallback), per the testid-only selector policy in `frontend/CLAUDE.md`.
 * - Classes that resolve portalled content (Select dropdowns) extract `Page`
 *   from `root` internally.
 */

import { type Page, type Locator } from '@playwright/test'

export type FieldRoot = Page | Locator

abstract class FieldBase {
  constructor(
    protected readonly root: FieldRoot,
    protected readonly testid: string,
  ) {}

  protected locator(): Locator {
    return this.root.getByTestId(this.testid)
  }

  protected page(): Page {
    return 'page' in this.root ? this.root.page() : this.root
  }
}

// ─── Plain text / textarea / number ───────────────────────────────────────────

export class TextField extends FieldBase {
  async fill(value: string): Promise<void> {
    await this.locator().fill(value)
  }

  async clear(): Promise<void> {
    await this.locator().fill('')
  }
}

export class TextareaField extends FieldBase {
  async fill(value: string): Promise<void> {
    await this.locator().fill(value)
  }
}

export class NumberField extends FieldBase {
  async fill(value: number | string): Promise<void> {
    await this.locator().fill(String(value))
  }
}

// ─── CurrencyInput (custom keydown handler — only per-key presses work) ──────

export class CurrencyField extends FieldBase {
  async fillCents(cents: number): Promise<void> {
    const input = this.locator()
    await input.click()
    for (const digit of String(cents)) {
      await input.press(digit)
    }
  }

  async clearAndFillCents(cents: number): Promise<void> {
    const input = this.locator()
    await input.click()
    // CurrencyInput's keydown handler treats each Backspace as `floor(value/10)`,
    // so we need one Backspace per digit currently displayed to drain the value
    // to 0 — Control+a + digit doesn't reliably trigger the "all selected"
    // branch because React re-renders reset the selection between presses.
    const display = await input.inputValue()
    const digitCount = display.replace(/\D/g, '').length
    for (let i = 0; i < digitCount; i++) {
      await input.press('Backspace')
    }
    for (const digit of String(cents)) {
      await input.press(digit)
    }
  }
}

// ─── Date / Month picker ──────────────────────────────────────────────────────

/**
 * Wraps a Mantine `DateInput`. Pass the date in the format the input expects
 * (component default is DD/MM/YYYY). Tabs out to commit and close the popover.
 */
export class DateField extends FieldBase {
  async fill(formattedDate: string): Promise<void> {
    const input = this.locator()
    await input.click()
    await input.fill(formattedDate)
    await input.press('Tab')
  }
}

// ─── Select (Mantine combobox) ────────────────────────────────────────────────

interface SelectPickOptions {
  /**
   * Optional text to type into the search-enabled combobox before clicking
   * the option. Use when the option list is virtualised or long; otherwise
   * leave undefined and the helper just clicks the testid.
   */
  search?: string
}

/**
 * Wraps a Mantine `Select`. The component must instrument its option via
 * `renderOption` with the matching `data-testid` — this class does not fall
 * back to `getByRole('option', { name })` (forbidden by the testid-only
 * selector policy).
 */
export class SelectField extends FieldBase {
  /** Click the trigger, then click the option whose testid matches. */
  async pick(optionTestId: string, opts: SelectPickOptions = {}): Promise<void> {
    const trigger = this.locator()
    await trigger.click()
    if (opts.search) {
      await trigger.fill(opts.search)
    }
    // Mantine renders Select options in a portal attached to <body>, so resolve
    // the option locator from the Page rather than from `root`.
    await this.page().getByTestId(optionTestId).click()
  }
}

// ─── TagsInput (multi) ────────────────────────────────────────────────────────

/**
 * Wraps a Mantine `TagsInput`. Presses `Enter` after each tag, which both
 * creates new tags and confirms suggestions.
 */
export class TagsField extends FieldBase {
  async add(values: string[]): Promise<void> {
    const input = this.locator()
    await input.click()
    for (const tag of values) {
      await input.fill(tag)
      await input.press('Enter')
    }
  }
}

// ─── Radio / Checkbox / Switch ────────────────────────────────────────────────

/** A single Mantine `Radio` already scoped to its own testid. */
export class RadioField extends FieldBase {
  async pick(): Promise<void> {
    await this.locator().check()
  }
}

export class CheckboxField extends FieldBase {
  async set(checked: boolean): Promise<void> {
    await this.locator().setChecked(checked)
  }
}

export class SwitchField extends FieldBase {
  async set(on: boolean): Promise<void> {
    await this.locator().setChecked(on)
  }
}

// ─── SegmentedControl ─────────────────────────────────────────────────────────

/**
 * Wraps a Mantine `SegmentedControl`. The component must render each item's
 * `label` as JSX carrying the `optionTestId`, e.g.
 *   `{ value: 'expense', label: <span data-testid={...}>Despesa</span> }`.
 */
export class SegmentedField extends FieldBase {
  async pick(optionTestId: string): Promise<void> {
    await this.locator().getByTestId(optionTestId).click()
  }
}

// ─── FileInput ────────────────────────────────────────────────────────────────

export interface FilePayload {
  name: string
  mimeType: string
  buffer: Buffer
}

export type FileInputContent = string | string[] | FilePayload | FilePayload[]

export class FileField extends FieldBase {
  async set(files: FileInputContent): Promise<void> {
    await this.locator().setInputFiles(files)
  }
}
