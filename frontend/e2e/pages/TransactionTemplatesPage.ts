import { type Page, type Locator, expect } from "@playwright/test";
import { TransactionsTestIds, type TransactionType } from "@/testIds";
import { SegmentedField, SelectField, TagsField, TextField } from "../helpers/formFields";

export interface TemplateFormFillOptions {
  name?: string;
  type?: TransactionType;
  accountId?: number;
  categoryId?: number;
  description?: string;
  tags?: string[];
}

/**
 * Drives the transaction-templates UI surfaces: the management drawer
 * (list/new/edit/delete), the template form drawer (create/edit), the
 * quick-apply chips on the create-transaction form, and the "save as
 * template" mini-drawer. Every field lookup is scoped to the drawer it
 * belongs to and goes through a `formFields.ts` class — template drawers
 * reuse the transaction form's field testids, so scoping avoids matching a
 * stale duplicate from a different drawer.
 */
export class TransactionTemplatesPage {
  readonly page: Page;
  readonly managementDrawer: Locator;
  readonly formDrawer: Locator;
  readonly saveAsDrawer: Locator;
  readonly createDrawer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.managementDrawer = page.getByTestId(TransactionsTestIds.TemplatesManagementDrawer);
    this.formDrawer = page.getByTestId(TransactionsTestIds.TemplateFormDrawer);
    this.saveAsDrawer = page.getByTestId(TransactionsTestIds.SaveAsTemplateDrawer);
    this.createDrawer = page.getByTestId(TransactionsTestIds.DrawerCreate);
  }

  /** Open the templates management drawer from the transactions toolbar "more options" menu. */
  async openManagementDrawer() {
    await this.page.getByTestId(TransactionsTestIds.BtnMoreOptions).click();
    await this.page.getByTestId(TransactionsTestIds.MenuItemManageTemplates).click();
    await expect(this.managementDrawer).toBeVisible();
  }

  /** Click "Novo" inside the management drawer and wait for the template form drawer. */
  async openNewTemplateForm() {
    await this.managementDrawer.getByTestId(TransactionsTestIds.TemplateBtnNew).click();
    await expect(this.formDrawer).toBeVisible();
  }

  /** Click the edit action on a template row and wait for the template form drawer. */
  async openEditTemplateForm(id: number) {
    await this.managementDrawer.getByTestId(TransactionsTestIds.TemplateBtnEdit(id)).click();
    await expect(this.formDrawer).toBeVisible();
  }

  /** Fill only the fields provided, scoped to the template form drawer. */
  async fillTemplateForm(opts: TemplateFormFillOptions) {
    if (opts.name !== undefined) {
      await new TextField(this.formDrawer, TransactionsTestIds.TemplateInputName).fill(opts.name);
    }
    if (opts.type !== undefined) {
      await new SegmentedField(this.formDrawer, TransactionsTestIds.SegmentedTransactionType).pick(
        TransactionsTestIds.SegmentTransactionType(opts.type),
      );
    }
    if (opts.accountId !== undefined) {
      await new SelectField(this.formDrawer, TransactionsTestIds.SelectAccount).pick(
        TransactionsTestIds.OptionAccount(opts.accountId),
      );
    }
    if (opts.categoryId !== undefined) {
      await new SelectField(this.formDrawer, TransactionsTestIds.SelectCategory).pick(
        TransactionsTestIds.OptionCategory(opts.categoryId),
      );
    }
    if (opts.description !== undefined) {
      await new TextField(this.formDrawer, TransactionsTestIds.InputDescription).fill(opts.description);
    }
    if (opts.tags !== undefined && opts.tags.length > 0) {
      await new TagsField(this.formDrawer, TransactionsTestIds.TagsInput).add(opts.tags);
    }
  }

  /** Submit the template form drawer and assert it closes without a form error. */
  async saveTemplateForm() {
    await this.formDrawer.getByTestId(TransactionsTestIds.TemplateBtnSave).click();
    await expect(this.formDrawer.getByTestId(TransactionsTestIds.TemplateFormError)).not.toBeVisible();
    await expect(this.formDrawer).not.toBeVisible({ timeout: 8000 });
  }

  /** Delete a template row (inline confirm) and wait for the row to disappear. */
  async deleteTemplate(id: number) {
    await this.managementDrawer.getByTestId(TransactionsTestIds.TemplateBtnDelete(id)).click();
    await this.managementDrawer.getByTestId(TransactionsTestIds.TemplateBtnConfirmDelete(id)).click();
    await expect(this.managementDrawer.getByTestId(TransactionsTestIds.TemplateRow(id))).not.toBeVisible();
  }

  /** Assert a template row is visible in the management drawer, optionally checking its name text. */
  async expectTemplateRow(id: number, opts: { name?: string } = {}) {
    const row = this.managementDrawer.getByTestId(TransactionsTestIds.TemplateRow(id));
    await expect(row).toBeVisible();
    if (opts.name !== undefined) {
      await expect(row).toContainText(opts.name);
    }
  }

  /** Locator for a template's quick-apply chip in the create-transaction form. */
  chip(id: number): Locator {
    return this.createDrawer.getByTestId(TransactionsTestIds.TemplateChip(id));
  }

  /** Click a template's quick-apply chip. Assumes the create form is open. */
  async applyChip(id: number) {
    const chip = this.chip(id);
    await expect(chip).toBeVisible();
    await chip.click();
  }

  /** Locator for the "Novo" button in the management drawer (enabled/disabled assertions). */
  newTemplateButton(): Locator {
    return this.managementDrawer.getByTestId(TransactionsTestIds.TemplateBtnNew);
  }

  /** Locator for the "Salvar como modelo" button in the create-transaction form footer. */
  saveAsTemplateButton(): Locator {
    return this.createDrawer.getByTestId(TransactionsTestIds.BtnSaveAsTemplate);
  }

  /**
   * Click "Salvar como modelo" on the open create form, optionally overwrite
   * the suggested name, confirm, and assert the mini-drawer closes cleanly.
   */
  async saveCurrentFormAsTemplate(name?: string) {
    await this.saveAsTemplateButton().click();
    await expect(this.saveAsDrawer).toBeVisible();
    if (name !== undefined) {
      await new TextField(this.saveAsDrawer, TransactionsTestIds.SaveAsTemplateInputName).fill(name);
    }
    await this.saveAsDrawer.getByTestId(TransactionsTestIds.TemplateBtnConfirmSaveAsTemplate).click();
    await expect(this.saveAsDrawer.getByTestId(TransactionsTestIds.SaveAsTemplateError)).not.toBeVisible();
    await expect(this.saveAsDrawer).not.toBeVisible({ timeout: 8000 });
  }
}
