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
    destination_account_id?: number | null;
    tag_ids?: number[];
    description: string;
    split_settings?: { connection_id: number; percentage?: number; amount?: number }[];
  };
  last_used_at?: string;
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

async function seedTag(token: string) {
  const res = await apiFetchAs(token, "/api/tags", {
    method: "POST",
    body: JSON.stringify({ name: `Tag ${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }),
  });
  return (await res.json()) as { id: number; name: string };
}

async function seedAccount(token: string, name: string) {
  const res = await apiFetchAs(token, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name, initial_balance: 0 }),
  });
  return (await res.json()) as { id: number; name: string };
}

async function createTemplate(token: string, name: string, payload: ApiTemplate["payload"]): Promise<ApiTemplate> {
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

  test("manage: type selector keeps its semantic color", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-type-color-${Date.now()}@financeapp.local`);

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.openNewTemplateForm();
    const selector = templatesPage.formDrawer.getByTestId(TransactionsTestIds.SegmentedTransactionType);
    const selectorColor = () => selector.evaluate((element) => element.style.getPropertyValue("--sc-color"));

    await expect.poll(selectorColor).toBe("var(--mantine-color-red-filled)");
    await templatesPage.fillTemplateForm({ type: "income" });
    await expect.poll(selectorColor).toBe("var(--mantine-color-teal-filled)");
    await templatesPage.fillTemplateForm({ type: "transfer" });
    await expect.poll(selectorColor).toBe("var(--mantine-color-blue-filled)");

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

  test("chip apply: fills account, category and description; leaves amount blank and focused", async ({ browser }) => {
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
    await txPage.fillAmount(12_345);
    const dateInput = page.getByTestId(TransactionsTestIds.InputDate);
    const dateBeforeApply = await dateInput.textContent();
    await templatesPage.applyChip(template.id);

    await expect(page.getByTestId(TransactionsTestIds.InputDescription)).toHaveValue("Assinatura Netflix");
    await expect(page.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue(account.name);
    await expect(page.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue(category.name);
    await expect(page.getByTestId(TransactionsTestIds.InputAmount)).toHaveValue("0,00");
    await expect(dateInput).toHaveText(dateBeforeApply ?? "");
    await expect(page.getByTestId(TransactionsTestIds.InputAmount)).toBeFocused();

    await page.close();
  });

  test("chip apply: stale account reference is cleared without a form error (APPLY-04)", async ({ browser }) => {
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

  test("save as template: creates a template from the create form and the new chip appears", async ({ browser }) => {
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
    expect(templates[0].payload).not.toHaveProperty("amount");
    expect(templates[0].payload).not.toHaveProperty("date");

    // The already-open form updates immediately; a reload would mask a missed
    // query invalidation in the save-as mutation.
    await expect(templatesPage.chip(templates[0].id)).toBeVisible();

    await page.close();
  });

  test("save as template: percentage split omits the derived amount", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-saveas-split");
    const { category } = await seedAccountAndCategory(setup.userToken);

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await txPage.fillExpense(10_000, "Jantar dividido", setup.userAccountId, category.id);
    await txPage.expandExtraSection("split");
    await txPage.formDrawer.getByTestId(TransactionsTestIds.BtnAddSplitRow).click();
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.InputSplitPercentage)).toHaveValue("50%");

    await templatesPage.saveCurrentFormAsTemplate("Jantar dividido");

    const templates = await listTemplates(setup.userToken);
    expect(templates).toHaveLength(1);
    expect(templates[0].payload.split_settings).toEqual([{ connection_id: setup.connectionId, percentage: 50 }]);

    await page.close();
  });

  test("quick chips show the three recent templates and search reaches every template", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-search-${Date.now()}@financeapp.local`);
    await createTemplate(token, "Modelo 1", { type: "expense", description: "d1" });
    await createTemplate(token, "Modelo 2", { type: "expense", description: "d2" });
    await createTemplate(token, "Modelo 3", { type: "expense", description: "d3" });
    await createTemplate(token, "Modelo 4", { type: "expense", description: "d4" });
    const templates = await listTemplates(token);
    expect(templates).toHaveLength(4);

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await expect(templatesPage.newTemplateButton()).toBeEnabled();

    await page.keyboard.press("Escape");
    await expect(templatesPage.managementDrawer).not.toBeVisible();

    await txPage.openCreateForm();
    await expect(templatesPage.saveAsTemplateButton()).toBeEnabled();
    await expect(templatesPage.chip(templates[0].id)).toBeVisible();
    await expect(templatesPage.chip(templates[1].id)).toBeVisible();
    await expect(templatesPage.chip(templates[2].id)).toBeVisible();
    await expect(templatesPage.chip(templates[3].id)).not.toBeVisible();

    await templatesPage.openSearch();
    await templatesPage.searchDrawer.getByTestId(TransactionsTestIds.TemplateSearchInput).fill("não existe");
    await expect(
      templatesPage.searchDrawer.getByTestId(TransactionsTestIds.TemplateSearchResult(templates[3].id)),
    ).toHaveCount(0);
    await templatesPage.searchDrawer.getByTestId(TransactionsTestIds.TemplateSearchInput).fill("d1");
    await expect(
      templatesPage.searchDrawer.getByTestId(TransactionsTestIds.TemplateSearchResult(templates[3].id)),
    ).toBeVisible();
    await expect(
      templatesPage.searchDrawer.getByTestId(TransactionsTestIds.TemplateSearchResult(templates[0].id)),
    ).not.toBeVisible();
    await templatesPage.applySearchResult(templates[3].id);
    await expect(page.getByTestId(TransactionsTestIds.InputDescription)).toHaveValue("d1");

    await expect.poll(async () => (await listTemplates(token))[0]?.id).toBe(templates[3].id);
    await expect(templatesPage.chip(templates[3].id)).toBeVisible();
    await expect(templatesPage.chip(templates[2].id)).not.toBeVisible();

    await page.close();
  });

  test("split template round-trip: chip apply prefills the split row (TMPL-05)", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-split");
    const template = await createTemplate(setup.userToken, "Aluguel Compartilhado", {
      type: "expense",
      account_id: setup.userAccountId,
      description: "Aluguel compartilhado",
      split_settings: [{ connection_id: setup.connectionId, percentage: 37 }],
    });

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);
    await txPage.expandExtraSection("split");

    await expect(page.getByTestId(TransactionsTestIds.InputSplitPercentage)).toHaveValue("37%");

    await page.close();
  });

  test("percentage split template: set amount and submit the transaction", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-apply-submit-split");
    const { category } = await seedAccountAndCategory(setup.userToken);
    const template = await createTemplate(setup.userToken, "Mercado dividido", {
      type: "expense",
      account_id: setup.userAccountId,
      category_id: category.id,
      description: "Imec",
      split_settings: [{ connection_id: setup.connectionId, percentage: 37 }],
    });

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);
    await txPage.fillAmount(10_000);

    const createRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/transactions" && request.method() === "POST",
    );
    await txPage.submitForm();

    const payload = JSON.parse((await createRequest).postData() ?? "{}") as {
      split_settings?: { connection_id: number; percentage?: number; amount?: number }[];
    };
    expect(payload.split_settings).toHaveLength(1);
    expect(payload.split_settings?.[0]).toMatchObject({
      connection_id: setup.connectionId,
      percentage: 37,
    });
    expect(payload.split_settings?.[0]).not.toHaveProperty("amount");

    await page.close();
  });

  test("manage: creates percentage and fixed split templates without transaction-only fields", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-manage-splits");
    const { category } = await seedAccountAndCategory(setup.userToken);

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.openNewTemplateForm();
    await templatesPage.fillTemplateForm({
      name: "Modelo percentual",
      type: "expense",
      accountId: setup.userAccountId,
      categoryId: category.id,
      description: "Divisão percentual",
    });
    await templatesPage.addTemplateSplit({ mode: "percentage", percentage: 37 });
    await expect(templatesPage.formDrawer.getByTestId(TransactionsTestIds.InputSplitDate(0))).toHaveCount(0);
    await expect(templatesPage.formDrawer.getByTestId(TransactionsTestIds.SplitRowPreview(0))).toHaveText("");
    await templatesPage.saveTemplateForm();

    await templatesPage.openNewTemplateForm();
    await templatesPage.fillTemplateForm({
      name: "Modelo fixo",
      type: "expense",
      accountId: setup.userAccountId,
      categoryId: category.id,
      description: "Divisão fixa",
    });
    await templatesPage.addTemplateSplit({ mode: "amount", amount: 2_500 });
    await templatesPage.saveTemplateForm();

    const templates = await listTemplates(setup.userToken);
    const percentageTemplate = templates.find((template) => template.name === "Modelo percentual");
    const fixedTemplate = templates.find((template) => template.name === "Modelo fixo");
    expect(percentageTemplate?.payload.split_settings).toEqual([{ connection_id: setup.connectionId, percentage: 37 }]);
    expect(fixedTemplate?.payload.split_settings).toEqual([{ connection_id: setup.connectionId, amount: 2_500 }]);
    expect(percentageTemplate?.payload).not.toHaveProperty("amount");
    expect(percentageTemplate?.payload).not.toHaveProperty("date");
    expect(fixedTemplate?.payload).not.toHaveProperty("amount");
    expect(fixedTemplate?.payload).not.toHaveProperty("date");

    await page.close();
  });

  test("manage: editing a template preserves category, tags and split configuration", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-edit-fields");
    const { category } = await seedAccountAndCategory(setup.userToken);
    const tag = await seedTag(setup.userToken);
    const template = await createTemplate(setup.userToken, "Modelo completo", {
      type: "expense",
      account_id: setup.userAccountId,
      category_id: category.id,
      tag_ids: [tag.id],
      description: "Campos persistidos",
      split_settings: [{ connection_id: setup.connectionId, percentage: 37 }],
    });

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.openEditTemplateForm(template.id);
    await templatesPage.fillTemplateForm({ name: "Modelo completo renomeado" });
    await templatesPage.saveTemplateForm();

    const [updated] = await listTemplates(setup.userToken);
    expect(updated.name).toBe("Modelo completo renomeado");
    expect(updated.payload).toMatchObject({
      type: "expense",
      account_id: setup.userAccountId,
      category_id: category.id,
      tag_ids: [tag.id],
      description: "Campos persistidos",
    });
    expect(updated.payload.split_settings).toEqual([{ connection_id: setup.connectionId, percentage: 37 }]);

    await page.close();
  });

  test("fixed split template: set amount and submit the transaction", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-apply-submit-fixed-split");
    const { category } = await seedAccountAndCategory(setup.userToken);
    const template = await createTemplate(setup.userToken, "Mercado valor fixo", {
      type: "expense",
      account_id: setup.userAccountId,
      category_id: category.id,
      description: "Feira",
      split_settings: [{ connection_id: setup.connectionId, amount: 2_500 }],
    });

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);
    await expect(page.getByTestId(TransactionsTestIds.InputSplitAmount)).toHaveValue("25,00");
    await txPage.fillAmount(10_000);

    const createRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/transactions" && request.method() === "POST",
    );
    await txPage.submitForm();

    const payload = JSON.parse((await createRequest).postData() ?? "{}") as {
      split_settings?: { connection_id: number; percentage?: number; amount?: number }[];
    };
    expect(payload.split_settings).toHaveLength(1);
    expect(payload.split_settings?.[0]).toMatchObject({ connection_id: setup.connectionId, amount: 2_500 });
    expect(payload.split_settings?.[0]).not.toHaveProperty("percentage");

    await page.close();
  });

  test("chip apply: carries template tags into the submitted transaction", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-apply-tags-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);
    const tag = await seedTag(token);
    const template = await createTemplate(token, "Mercado com tag", {
      type: "expense",
      account_id: account.id,
      category_id: category.id,
      tag_ids: [tag.id],
      description: "Compras marcadas",
    });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);
    await txPage.fillAmount(5_000);

    const createRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/transactions" && request.method() === "POST",
    );
    await txPage.submitForm();

    const payload = JSON.parse((await createRequest).postData() ?? "{}") as {
      tags?: { id?: number; name: string }[];
    };
    expect(payload.tags).toEqual([{ id: tag.id, name: tag.name }]);

    await page.close();
  });

  test("chip apply: transfer template restores its destination and submits without category or splits", async ({
    browser,
  }) => {
    const setup = await createUserAndPartner("e2e-templates-apply-transfer");
    const destination = await seedAccount(setup.userToken, `Destino ${Date.now()}`);
    const template = await createTemplate(setup.userToken, "Transferência mensal", {
      type: "transfer",
      account_id: setup.userAccountId,
      destination_account_id: destination.id,
      description: "Reserva mensal",
    });

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);
    await txPage.assertCreateTypeSelected("transfer");
    await expect(page.getByTestId(TransactionsTestIds.SelectDestinationAccount)).toHaveValue(destination.name);
    await txPage.fillAmount(8_000);

    const createRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/transactions" && request.method() === "POST",
    );
    await txPage.submitForm();

    const payload = JSON.parse((await createRequest).postData() ?? "{}") as {
      transaction_type?: string;
      account_id?: number;
      destination_account_id?: number;
      category_id?: number;
      split_settings?: unknown;
    };
    expect(payload).toMatchObject({
      transaction_type: "transfer",
      account_id: setup.userAccountId,
      destination_account_id: destination.id,
    });
    expect(payload).not.toHaveProperty("category_id");
    expect(payload).not.toHaveProperty("split_settings");

    await page.close();
  });

  test("chip apply: clears a deleted category while retaining the usable fields", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-stale-category-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);
    const template = await createTemplate(token, "Categoria removida", {
      type: "expense",
      account_id: account.id,
      category_id: category.id,
      description: "Ainda utilizável",
    });
    await apiFetchAs(token, `/api/categories/${category.id}`, { method: "DELETE" });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);

    await expect(page.getByTestId(TransactionsTestIds.AlertFormError)).not.toBeVisible();
    await expect(page.getByTestId(TransactionsTestIds.InputDescription)).toHaveValue("Ainda utilizável");
    await expect(page.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue(account.name);
    await expect(page.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue("");

    await page.close();
  });

  test("chip apply: drops a deleted tag and still submits the transaction", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-stale-tag-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);
    const tag = await seedTag(token);
    const template = await createTemplate(token, "Tag removida", {
      type: "expense",
      account_id: account.id,
      category_id: category.id,
      tag_ids: [tag.id],
      description: "Transação sem tag removida",
    });
    await apiFetchAs(token, `/api/tags/${tag.id}`, { method: "DELETE" });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);
    await txPage.fillAmount(2_000);

    const createRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/transactions" && request.method() === "POST",
    );
    await txPage.submitForm();

    const payload = JSON.parse((await createRequest).postData() ?? "{}") as { tags?: unknown };
    expect(payload).not.toHaveProperty("tags");

    await page.close();
  });

  test("chip apply: clears a deleted transfer destination while retaining the source", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-stale-destination");
    const destination = await seedAccount(setup.userToken, `Destino removido ${Date.now()}`);
    const template = await createTemplate(setup.userToken, "Transferência destino removido", {
      type: "transfer",
      account_id: setup.userAccountId,
      destination_account_id: destination.id,
      description: "Transferência preservada",
    });
    await apiFetchAs(setup.userToken, `/api/accounts/${destination.id}`, { method: "DELETE" });

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await txPage.openCreateForm();
    await templatesPage.applyChip(template.id);

    await txPage.assertCreateTypeSelected("transfer");
    await expect(page.getByTestId(TransactionsTestIds.AlertFormError)).not.toBeVisible();
    await expect(page.getByTestId(TransactionsTestIds.InputDescription)).toHaveValue("Transferência preservada");
    await expect(page.getByTestId(TransactionsTestIds.SelectDestinationAccount)).toHaveValue("");

    await page.close();
  });

  test("manage: shared-account templates discard an existing split", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-templates-shared-account");
    const { category } = await seedAccountAndCategory(setup.userToken);

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.openNewTemplateForm();
    await templatesPage.fillTemplateForm({
      name: "Modelo conta compartilhada",
      type: "expense",
      accountId: setup.userAccountId,
      categoryId: category.id,
      description: "Sem divisão inválida",
    });
    await templatesPage.addTemplateSplit({ mode: "percentage", percentage: 37 });
    await templatesPage.fillTemplateForm({ accountId: setup.userConnAccountId });
    await templatesPage.saveTemplateForm();

    const [template] = await listTemplates(setup.userToken);
    expect(template.payload.account_id).toBe(setup.userConnAccountId);
    expect(template.payload.split_settings).toBeUndefined();

    await page.close();
  });

  test("manage: delete invalidates the open form's template chips", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-delete-chip-${Date.now()}@financeapp.local`);
    const template = await createTemplate(token, "Chip removido", {
      type: "expense",
      description: "Não deve aparecer",
    });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.deleteTemplate(template.id);
    await page.keyboard.press("Escape");
    await expect(templatesPage.managementDrawer).not.toBeVisible();

    await txPage.openCreateForm();
    await expect(templatesPage.chip(template.id)).toHaveCount(0);

    await page.close();
  });

  test("manage: surfaces a duplicate template-name error", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-templates-duplicate-${Date.now()}@financeapp.local`);
    const { account, category } = await seedAccountAndCategory(token);
    await createTemplate(token, "Modelo duplicado", {
      type: "expense",
      account_id: account.id,
      category_id: category.id,
      description: "Primeiro modelo",
    });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await templatesPage.openNewTemplateForm();
    await templatesPage.fillTemplateForm({
      name: "Modelo duplicado",
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      description: "Tentativa duplicada",
    });
    await templatesPage.formDrawer.getByTestId(TransactionsTestIds.TemplateBtnSave).click();

    await expect(templatesPage.formDrawer).toBeVisible();
    await expect(templatesPage.formDrawer.getByTestId(TransactionsTestIds.TemplateFormError)).toBeVisible();

    await page.close();
  });

  test("templates are private in the browser UI", async ({ browser }) => {
    const ownerToken = await getAuthTokenForUser(`e2e-templates-owner-${Date.now()}@financeapp.local`);
    const viewerToken = await getAuthTokenForUser(`e2e-templates-viewer-${Date.now()}@financeapp.local`);
    const ownerTemplate = await createTemplate(ownerToken, "Modelo privado", {
      type: "expense",
      description: "Somente dono",
    });

    const page = await openAuthedPage(browser, viewerToken);
    const txPage = new TransactionsPage(page);
    const templatesPage = new TransactionTemplatesPage(page);
    await txPage.goto();

    await templatesPage.openManagementDrawer();
    await expect(
      templatesPage.managementDrawer.getByTestId(TransactionsTestIds.TemplateRow(ownerTemplate.id)),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(templatesPage.managementDrawer).not.toBeVisible();

    await txPage.openCreateForm();
    await expect(templatesPage.chip(ownerTemplate.id)).toHaveCount(0);

    await page.close();
  });
});
