# CLAUDE.md — Frontend

This file provides guidance to Claude Code (claude.ai/code) when working with the frontend.

## Project Overview

React/TypeScript frontend for a couples' finance management app.

## Stack

- **Bundler**: Vite
- **Framework**: React 19
- **Language**: TypeScript
- **Routing**: TanStack Router (file-based)
- **Data fetching**: TanStack Query
- **Forms**: React Hook Form + `@hookform/resolvers/zod`
- **Validation**: Zod
- **Component library**: Mantine
- **Styling**: CSS Modules (alongside Mantine)
- **E2E**: Playwright

## Commands

```bash
npm run dev       # start dev server
npm run build     # production build
npm run preview   # preview production build
npm run lint      # ESLint
```

## Project Structure

```
src/
  api/           # API client functions (raw fetch calls; no hooks, no React)
  hooks/         # Custom hooks (queries, mutations, effects, UI)
  components/    # Reusable UI components, organized by domain
  pages/         # Page components (the content a route renders)
  routes/        # TanStack Router file-based routes (thin entry points)
  types/         # TypeScript namespaces and domain types
  utils/         # Pure utility functions (and renderDrawer portal helper)
```

## Core Conventions

The rules below are mandatory. Code that violates them either gets refactored in the same PR or flagged as a known migration (see "Known divergences" at the bottom).

### 1. Routes are thin entry points

A file under `src/routes/` **only** wires the route to a page component. No page JSX, no queries, no state, no handlers inside the route file.

```tsx
// src/routes/_authenticated.accounts.tsx
import { createFileRoute } from '@tanstack/react-router'
import { AccountsPage } from '@/pages/AccountsPage'

export const Route = createFileRoute('/_authenticated/accounts')({
  component: AccountsPage,
})
```

```tsx
// src/pages/AccountsPage.tsx
export function AccountsPage() {
  const { query, invalidate } = useAccounts()
  // ...page content
}
```

Allowed in a route file: `createFileRoute(...)`, search-param schema (e.g. Zod `validateSearch`), `beforeLoad`/`loader` that only delegates to query prefetch, and the `component:` reference. Everything else belongs in the page component.

Search params schemas can be colocated in the route file **or** in `src/types/…`; whichever keeps the route file short.

### 2. Pages are components, not routes

Page components live in `src/pages/` as `PascalCase` functions (`AccountsPage`, `TransactionsPage`). They own the queries, mutations, handlers, and JSX. They may split into sub-components next to them or under `src/components/<domain>/` when reusable.

### 3. Data fetching always via TanStack Query

- **Never** call `fetch`/`axios` inside a component, page, or effect. API calls live in `src/api/` and are consumed by hooks in `src/hooks/`.
- Every query is a custom hook that returns `{ query, invalidate }`:
  ```ts
  export function useTransactions() {
    const queryClient = useQueryClient()
    const query = useQuery({ queryKey: [QueryKeys.Transactions], queryFn: fetchTransactions })
    const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] })
    return { query, invalidate }
  }
  ```
- Every mutation is a custom hook that returns `{ mutation }` only. **Invalidation is the caller's responsibility** (usually via the `invalidate` returned by the matching query hook) — do not hard-code `onSuccess` invalidations inside the mutation hook.
  ```ts
  export function useCreateTransaction(options?: { onSuccess?: () => void }) {
    const mutation = useMutation({ mutationFn: createTransaction, onSuccess: options?.onSuccess })
    return { mutation }
  }
  ```
- Query keys must come from the `QueryKeys` const in `src/utils/queryKeys.ts`. No magic strings.
- **Derived state from queries goes through a `select` callback, not a `useMemo`/filter in the component.** Query hooks are written to accept a typed `select` and forward it to `useQuery`:
  ```ts
  export function useAccounts<T = Transactions.Account[]>(select?: (data: Transactions.Account[]) => T) {
    const query = useQuery({ queryKey: [QueryKeys.Accounts], queryFn: fetchAccounts, select })
    // ...
  }
  ```
  Consumers pick exactly the slice they need:
  ```ts
  const { query: activeOwn }    = useAccounts((a) => a.filter((x) => x.is_active && !x.user_connection))
  const { query: activeShared } = useAccounts((a) => a.filter((x) => x.is_active && !!x.user_connection))
  const { query: inactive }     = useAccounts((a) => a.filter((x) => !x.is_active))
  ```
  Calling the same query hook multiple times is **fine and encouraged** — TanStack Query deduplicates on the `queryKey`, so there is exactly one fetch regardless of how many subscribers exist. Each `select` result is memoized per subscriber, so components only re-render when their slice actually changes. When adding a new query hook, always expose a `select?: (data) => T` generic parameter so callers can follow this pattern.

### 4. Avoid `useEffect` inside components

`useEffect` is a last resort. In page/component files you should see **zero** `useEffect`. When an effect is genuinely needed, encapsulate it in a custom hook under `src/hooks/` with a clear name that describes the behavior, not the implementation:

```ts
// src/hooks/useResetFormOnChange.ts
export function useResetFormOnChange<T>(reset: UseFormReset<T>, values: T | undefined) {
  useEffect(() => {
    if (values) reset(values)
  }, [values, reset])
}

// in the component
useResetFormOnChange(reset, initialValues)
```

Before reaching for an effect, check whether the logic fits better as:
- Derived state during render.
- An event handler reacting to user input.
- A TanStack Query `select`/`onSuccess`/`enabled`.
- An existing custom hook in `src/hooks/`.

If an effect still survives the review, it lives in a hook — never inline.

### 5. Forms: React Hook Form + Zod

Every form follows the same pattern:

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  initial_balance: z.number().int(),
})

type AccountFormValues = z.infer<typeof schema>

export function AccountForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<AccountFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', initial_balance: 0 },
  })
  // ...
}
```

Rules:
- **Schema defined with Zod**; always infer the type with `z.infer<typeof schema>` — never declare the form values type by hand.
- **Always use `zodResolver`**; do not rely on manual validation inside handlers.
- Use `superRefine` for cross-field validation; extract shared fields/refinements into reusable factories when multiple forms share rules (see `src/components/transactions/form/` for the pattern with `baseTransactionFields` + `applySharedRefinements`).
- For nested forms, pass `control` via `FormProvider` / `useFormContext` rather than prop-drilling.
- Submit button triggers `handleSubmit(onSubmit)`; validation errors are surfaced via `errors.*.message`.
- **Use `useWatch` instead of `form.watch` to subscribe to field values.** `form.watch` re-renders the entire form component on every keystroke; `useWatch` creates a granular subscription so only the consuming component re-renders.
  ```tsx
  import { useWatch } from 'react-hook-form'

  // watching a single field
  const amount = useWatch({ control: form.control, name: 'amount' })

  // watching multiple fields at once
  const [month, year, connectionId] = useWatch({
    control: form.control,
    name: ['period_month', 'period_year', 'connection_id'],
  })
  ```

### 6. Components: small, focused, reusable

- One responsibility per component. If a file grows past ~200 lines, split it.
- Reusable UI → `src/components/<domain>/<Component>.tsx` (folder-by-domain: `accounts/`, `transactions/`, `charges/`, `categories/`, …). Sub-features get their own subfolder (`transactions/form/`, `transactions/filters/`, `transactions/import/`).
- CSS Modules (`Component.module.css`) colocated with the component.
- Prefer composition over props explosion. If a component needs 8+ props, it probably wants to be two components.
- Never declare helper components or modals **inside** a page function body — hoist them to their own file.

### 7. TypeScript: no `any`

- `any` is banned. Use `unknown` + narrowing, generics, or concrete types. If a library forces an escape hatch, isolate it in a small helper with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` **and a one-line comment** explaining why.
- Domain types live inside a namespace per domain (see `src/types/transactions.ts`):
  ```ts
  export namespace Transactions {
    export type Transaction = { id: number; amount: number /* cents */; /* ... */ }
  }
  ```
- Amounts are **cents (int64)** end-to-end (matches backend). Format via `src/utils/formatCents.ts` only at the display layer.

### 8. Drawers: `renderDrawer` + `close(value)`

All drawers open through `renderDrawer` from `src/utils/renderDrawer.tsx`. **Do not** use `useDisclosure` or local `useState` at the call site. The helper renders the drawer in an isolated React root (with its own `QueryClientProvider` + `MantineProvider`) and returns a `Promise` that resolves with whatever `ctx.close(value)` passes.

**Opening:**
```tsx
// fire-and-forget
void renderDrawer(() => <CreateTransactionDrawer />)

// await a typed result
const category = await renderDrawer<Transactions.Category>(() => <SelectCategoryDrawer />)
```

**Inside the drawer component** — return data to the caller via `close(value)`:
```tsx
import { useDrawerContext } from '@/utils/renderDrawer'

export function SelectCategoryDrawer() {
  const { opened, close, reject } = useDrawerContext<Transactions.Category>()
  return (
    <Drawer opened={opened} onClose={reject} position="right" size="md">
      {categories.map((c) => (
        <Button key={c.id} onClick={() => close(c)}>{c.name}</Button>
      ))}
    </Drawer>
  )
}
```

Rules:
- Pass the return type as a generic to both `renderDrawer<T>` and `useDrawerContext<T>`. Use `T = void` when the drawer just performs an action.
- `close(value)` resolves the promise — the **only** way to return data from a drawer.
- `reject()` rejects the promise on dismiss; wire it to Mantine's `onClose` (swipe, ESC, backdrop).
- For confirmation drawers, return a discriminated result (`'confirmed' | 'cancelled'`) instead of a boolean when the semantics matter.
- The caller awaits the result and acts on it in-place — no lifted state, no callbacks.

## Authentication / Route Protection

Protected routes live under the `/_authenticated` layout route. `_authenticated.tsx` performs auth in `beforeLoad` via `ensureQueryData` on the `me` query and redirects to `/login` if unauthenticated.

## Query Keys

Centralized in `src/utils/queryKeys.ts` as a `QueryKeys` const object. Add a new entry there before writing a new query hook. No string literals inside `queryKey` arrays.

## Mobile First

Mobile is the primary target.

- Relative units (`rem`, `%`, `vh`/`vw`) over fixed pixels.
- Touch-sized hit targets; no hover-only interactions.
- Validate layouts at mobile viewport before desktop.

## E2E tests (Playwright)

Tests live in `frontend/e2e/` (tests in `tests/`, page objects in `pages/`, helpers in `helpers/`). Run with `npm run test:e2e`.

### Test isolation: one user per test case

Each test case must create a **fresh user** with its own account and category via `getAuthTokenForUser` + `apiFetchAs` (from `e2e/helpers/api.ts`). Use `openAuthedPage(browser, token)` to get a browser page authenticated as that user. This prevents cross-test state pollution and makes tests order-independent.

```ts
test("my test", async ({ browser }) => {
  const email = `e2e-mytest-${Date.now()}@financeapp.local`;
  const token = await getAuthTokenForUser(email);

  // Create test data as this user
  const accRes = await apiFetchAs(token, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: "Test Account", initial_balance: 0 }),
  });
  const account = (await accRes.json()) as { id: number };

  // Get an authenticated browser page
  const page = await openAuthedPage(browser, token);
  const myPage = new MyPageObject(page);
  await myPage.goto();

  // ... test logic ...

  await page.close();
});
```

Rules:
- Use `{ browser }` fixture (not `{ page }`) so you can create a fresh context per user.
- Always `await page.close()` at the end to release the browser context.
- No `beforeAll` for shared accounts/categories — each test is self-contained.
- API verification calls (e.g. listing transactions) must use `apiFetchAs(token, ...)` with the test user's token, not the global helpers.

### Selectors: `data-testid` only

**E2E selectors must use `data-testid`.** This is non-negotiable: the library is an implementation detail and may change — testid-based selectors are the only ones that survive a component-library swap or a Mantine upgrade.

Rules:
- **Always**: `page.getByTestId('btn_new_account')`, `drawer.getByTestId('input_account_name')`, `row.getByTestId('checkbox_select_transaction')`.
- **Never use UI-library-specific selectors**: no `.mantine-*`, `.ant-*`, `[class*="Group"]`, `[class*="Avatar"]`, `input[inputmode="numeric"]`, etc. These are Mantine internals and break on every upgrade.
- **Avoid `getByRole` / `getByText` / `getByLabel`** as a primary strategy — they couple tests to copy (which changes with i18n or wording tweaks) and to ARIA details emitted by the library. Only acceptable when rendering third-party UI you cannot instrument (e.g. a browser native `confirm()`); even then, add a testid to the nearest container first.
- Naming convention (already in use): `btn_<action>`, `input_<field>`, `drawer_<name>`, `section_<name>`, `row_<entity>`, `checkbox_<purpose>`. Stay consistent.
- When adding a new UI element, add a stable `data-testid` in the same commit. No test may rely on class names, tag shapes, or attribute probes as a workaround.

### Declaring testid constants (`src/testIds/`)

All `data-testid` values are centralised in `src/testIds/` and re-exported from `src/testIds/index.ts`. Never use magic strings — always reference the constant.

All ids — static or parametric — are declared as `as const` objects:
  ```ts
  // src/testIds/recurrence.ts
  export const RecurrenceTestIds = {
    // static id
    TypeSelect: 'select_recurrence_type',
    CurrentInstallmentInput: 'input_recurrence_current_installment',
    // parametric id (factory function)
    RowBtnRecurrencePopover: (rowIndex: number) => `btn_recurrence_popover_${rowIndex}` as const,
  } as const
  ```
- Group ids by domain, one file per domain (e.g. `recurrence.ts`, `import.ts`).
- Static ids: plain string value. Parametric ids: arrow function returning `'...' as const` so the return type is a string literal, not `string`.
- Add the export to `index.ts` before referencing the id anywhere.

When a testid is missing, the fix is to add it to the component, not to invent a fragile selector in the test.

### Error detection after form submission

Every form that can fail (validation or API errors) must render its general error using an `Alert` with a stable `data-testid` (e.g. `TransactionsTestIds.AlertFormError`). After submitting a form in e2e tests, always assert that no error is visible before waiting for the drawer to close:

```ts
// After clicking submit
await transactionsPage.assertNoFormErrors();
await expect(drawer).not.toBeVisible({ timeout: 10000 });
```

This prevents silent failures where a form error causes a timeout instead of an actionable assertion. When a test fails, the error message shows exactly what went wrong (e.g. "expected alert_form_error to not be visible") instead of a generic timeout.

### Form fields: use `e2e/helpers/formFields.ts` (mandatory)

**Every interaction with a form field in an e2e test must go through a field class from `frontend/e2e/helpers/formFields.ts`.** Do not call `.fill()`, `.click()`, `.check()`, `.setChecked()`, `.setInputFiles()`, or `press(digit)` loops directly on a form field locator — that's how Mantine quirks (the `CurrencyInput` keydown handler, combobox option portals, SegmentedControl item targeting) leak back into Page Objects and tests start failing intermittently.

The module exposes one class per field kind. Each class is constructed with `(root: Page | Locator, testid: string)` and exposes only the methods that make sense for that kind, so the type system stops you from calling `.fillCents()` on a text input or `.pick()` on a checkbox.

| Field kind | Class | Methods |
|---|---|---|
| Text input | `TextField` | `fill(value)`, `clear()` |
| Textarea | `TextareaField` | `fill(value)` |
| `NumberInput` | `NumberField` | `fill(value)` |
| `CurrencyInput` (cents) | `CurrencyField` | `fillCents(cents)`, `clearAndFillCents(cents)` |
| `DateInput` | `DateField` | `fill(formattedDate)` |
| Mantine `Select` | `SelectField` | `pick(optionTestId, { search? })` |
| `TagsInput` | `TagsField` | `add(values)` |
| `Radio` | `RadioField` | `pick()` |
| `Checkbox` | `CheckboxField` | `set(checked)` |
| `Switch` | `SwitchField` | `set(on)` |
| `SegmentedControl` | `SegmentedField` | `pick(optionTestId)` |
| `FileInput` | `FileField` | `set(content)` |

Call shape:

```ts
await new CurrencyField(this.formDrawer, TransactionsTestIds.InputAmount).fillCents(5000)
await new SelectField(this.formDrawer, TransactionsTestIds.SelectAccount)
  .pick(TransactionsTestIds.OptionAccount(accountId))
await new SegmentedField(this.formDrawer, TransactionsTestIds.SegmentedTransactionType)
  .pick(TransactionsTestIds.SegmentTransactionType('expense'))
```

Rules:
- **Always pass an option testid**, never a label, to `SelectField.pick` and `SegmentedField.pick`. Both refuse label fallbacks. If a Mantine `Select` doesn't have a `renderOption` testid yet, add one in the same PR (factory under `src/testIds/`, then `renderOption={({ option }) => <span data-testid={...}>{option.label}</span>}` on the `Select`). Same pattern for `SegmentedControl`: render each item's `label` as JSX with a per-option testid.
- **Always scope `root` to a drawer/form locator** when the form lives inside one (e.g. `formDrawer`, `updateDrawer`, `createDrawer`). Defaulting to `page` lets stale duplicates match silently.
- **Page Object methods that fill a form field must instantiate a field class** — they shouldn't reimplement the keydown loop, the click+option dance, or hardcoded label maps. If you find yourself writing one of those in a Page Object, the class is missing or the testid is missing; fix the source rather than work around it in the test.
- **Specs themselves should also use the classes** when they need to touch a field that the Page Object doesn't expose — don't reach into `page.getByLabel(...)` / `getByRole('option', ...)`.

Add a new field class (or extend an existing one) when a new form-field kind first appears in a real test. Don't ship a one-off interaction inline.

## Known divergences (migrate when touching)

These exist in the codebase and agents should **not** copy them. When touching a file listed here, prefer migrating it toward the conventions above within the scope of the task.

- **Fat route files** — `src/routes/_authenticated.transactions.tsx` (~450 lines), `_authenticated.categories.tsx`, `_authenticated.accounts.tsx`, `login.tsx`, `auth.callback.tsx`: page logic lives inside the route file. Extract to `src/pages/<Name>Page.tsx`.
- **`useEffect` in components** — e.g. `components/accounts/AccountForm.tsx:46`, `components/transactions/form/TransactionForm.tsx:71`, `components/transactions/form/SplitSettingsFields.tsx:73,80`, `components/transactions/form/RecurrenceFields.tsx`. Extract each to a named custom hook under `src/hooks/`.
- **In-component query filtering** — e.g. `routes/_authenticated.accounts.tsx:59-63` filters the `useAccounts()` result four times inline. Convert each slice to its own `useAccounts(select)` call (or equivalent) so the derivation runs inside TanStack Query.
- **Drawers not using `renderDrawer`** — `components/InviteDrawer.tsx` (prop-controlled via `useDisclosure` in `components/AppLayout.tsx`) and `components/categories/DeleteCategoryDialog.tsx` (modal with `useState`). Convert to `renderDrawer` + `useDrawerContext`.
- **`any` escape hatches** — a handful of `as any` / `: any` casts in `SplitSettingsFields.tsx`, `RecurrenceFields.tsx`, `SplitPopover.tsx`, `ImportReviewRow.tsx` (all `eslint-disable`d). Replace with proper types; ESLint has no blanket `no-explicit-any` rule yet, but treat `any` as forbidden regardless.
- **Fragile E2E selectors** — most `e2e/` is testid-based, but these files still reach into Mantine internals or copy and must be migrated on touch:
  - `e2e/tests/avatars.spec.ts` — pervasive `.mantine-Avatar-root` / `.mantine-Avatar-placeholder`.
  - `e2e/pages/TransactionsPage.ts` — `getByRole('dialog', …)`, `locator('[class*="Group"], [class*="Stack"]')`, `locator('[class*="transaction"]')`.
  - `e2e/pages/ImportPage.ts` — `locator('input[type="file"]')`, `locator('input[type="checkbox"]')`, and multiple `getByRole('option'/'button', { name: … })`.
  - `e2e/pages/AccountsPage.ts` — `locator('input[inputmode="numeric"]')`.

  Replacement approach: add a `data-testid` on the target element in the component, then switch the test to `getByTestId`.
- **Shared test users via `beforeAll`** — `e2e/tests/import.spec.ts`, `import-installment.spec.ts`, `import-split-settings.spec.ts`, `import-shift-select.spec.ts` use a shared account/category created in `beforeAll`. Migrate to one fresh user per test case using `getAuthTokenForUser` + `openAuthedPage` (see "Test isolation" section above).
