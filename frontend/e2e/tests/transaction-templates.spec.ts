import { test, expect } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import { TransactionTemplatesPage } from "../pages/TransactionTemplatesPage";
import { TransactionsTestIds } from "@/testIds";
import { createUserAndPartner } from "../helpers/createUserAndPartner";
import { apiFetchAs, getAuthTokenForUser, openAuthedPage } from "../helpers/api";

interface ApiTemplate {
  id: number;
  name: string;
  payload: {
    type: string;
    account_id?: number | null;
    category_id?: number | null;
    description: string;
    split_settings?: { connection_id: number; percentage?: number; amount?: number }[];
  };
}

/** Create a personal account + category for the given user token. */
async function seedAccountAndCategory(token: string) {
  const accRes = await apiFetchAs(token, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: `Conta ${Date.now()}`, initial_balance: 0 }),
  });
  const account = (await accRes.json()) as { id: number; name: string };

  const catRes = await apiFetchAs(token, "/api/categories", {
    method: "POST",
    body: JSON.stringify({ name: `Categoria ${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }),
  });
  const category = (await catRes.json()) as { id: number; name: string };

  return { account, category };
}

async function createTemplate(
  token: string,
  name: string,
  payload: ApiTemplate["payload"],
): Promise<ApiTemplate> {
  const res = await apiFetchAs(token, "/api/transaction-templates", {
    method: "POST",
    body: JSON.stringify({ name, payload }),
  });
  return res.json();
}

async function listTemplates(token: string): Promise<ApiTemplate[]> {
  const res = await apiFetchAs(token, "/api/transaction-templates");
  return res.json();
}

test.describe("Transaction Templates", () => {
  test("manage: create a template via the management drawer", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-create-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.openNewTemplateForm();
    await templatesPage.fillTemplateForm({
      name: "Modelo Mercado",
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      description: "Compras supermercado",
    });
    await templatesPage.saveTemplateForm();

    const templates = await listTemplates(token);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("Modelo Mercado");
    expect(templates[0].payload.account_id).toBe(account.id);
    expect(templates[0].payload.category_id).toBe(category.id);
    expect(templates[0].payload.description).toBe("Compras supermercado");

    await templatesPage.expectTemplateRow(templates[0].id, { name: "Modelo Mercado" });

    await page.close();
  });

  test("manage: edit a template's name", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-edit-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);
    const template = await createTemplate(token, "Nome Antigo", {
      type: "expense",
      account_id: account.id,
      category_id: category.id,
      description: "Descricao original",
    });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.openEditTemplateForm(template.id);
    await templatesPage.fillTemplateForm({ name: "Nome Novo" });
    await templatesPage.saveTemplateForm();

    await templatesPage.expectTemplateRow(template.id, { name: "Nome Novo" });

    const templates = await listTemplates(token);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("Nome Novo");

    await page.close();
  });

  test("manage: delete a template", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-delete-${Date.now()}@financeapp.local`);
    const template = await createTemplate(token, "Para Excluir", {
      type: "expense",
      description: "Descricao qualquer",
    });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.deleteTemplate(template.id);

    const templates = await listTemplates(token);
    expect(templates).toHaveLength(0);

    await page.close();
  });

  test("chip apply: fills account, category and description; leaves amount blank and focused", async ({
    browser,
  }) => {
    const token = await getAuthTokenForUser(`e2e-templates-chip-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);
    const template = await createTemplate(token, "Assinatura Streaming", {
      type: "expense",
      account_id: account.id,
      category_id: category.id,
      description: "Assinatura Netflix",
    });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);

    await expect(page.getByTestId(TransactionsTestIds.InputDescription)).toHaveValue("Assinatura Netflix");
    await expect(page.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue(account.name);
    await expect(page.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue(category.name);
    await expect(page.getByTestId(TransactionsTestIds.InputAmount)).toBeFocused();

    await page.close();
  });

  test("chip apply: stale account reference is cleared without a form error (APPLY-04)", async ({
    browser,
  }) => {
    const token = await getAuthTokenForUser(`e2e-templates-stale-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);
    const template = await createTemplate(token, "Modelo Conta Excluida", {
      type: "expense",
      account_id: account.id,
      category_id: category.id,
      description: "Descricao preservada",
    });

    // Delete the referenced account so the template holds a stale reference.
    await apiFetchAs(token, `/api/accounts/${account.id}`, { method: "DELETE" });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);

    await expect(page.getByTestId(TransactionsTestIds.AlertFormError)).not.toBeVisible();
    await expect(page.getByTestId(TransactionsTestIds.InputDescription)).toHaveValue("Descricao preservada");
    await expect(page.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue("");

    await page.close();
  });

  test("save as template: creates a template from the create form and the new chip appears", async ({
    browser,
  }) => {
    const token = await getAuthTokenForUser(`e2e-templates-saveas-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await txPage.selectType("expense");
    await txPage.fillDescription("Presente aniversario");
    await txPage.fillAmount(1000);
    await txPage.selectAccount(account.id);
    await txPage.selectCategory(category.id);

    await templatesPage.saveCurrentFormAsTemplate();

    const templates = await listTemplates(token);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("Presente aniversario");
    expect(templates[0].payload.account_id).toBe(account.id);

    // Reopen the create form so the chip row refetches and shows the new template.
    await page.reload();
    await txPage.openCreateForm();
    await expect(templatesPage.chip(templates[0].id)).toBeVisible();

    await page.close();
  });

  test("cap enforcement: disables 'new template' and 'save as template' at 3 templates (SAFE-01)", async ({
    browser,
  }) => {
    const token = await getAuthTokenForUser(`e2e-templates-cap-${Date.now()}@financeapp.local`);
    await createTemplate(token, "Modelo 1", { type: "expense", description: "d1" });
    await createTemplate(token, "Modelo 2", { type: "expense", description: "d2" });
    await createTemplate(token, "Modelo 3", { type: "expense", description: "d3" });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await expect(templatesPage.newTemplateButton()).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(templatesPage.managementDrawer).not.toBeVisible();

    await txPage.openCreateForm();
    await expect(templatesPage.saveAsTemplateButton()).toBeDisabled();

    await page.close();
  });

  test("split template round-trip: chip apply prefills the split row (TMPL-05)", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-split");
    const template = await createTemplate(setup.userToken, "Aluguel Compartilhado", {
      type: "expense",
      account_id: setup.userAccountId,
      description: "Aluguel compartilhado",
      split_settings: [{ connection_id: setup.connectionId, percentage: 50 }],
    });

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);
    await txPage.expandExtraSection("split");

    await expect(page.getByTestId(TransactionsTestIds.InputSplitPercentage)).toHaveValue("50");

    await page.close();
  });
});
