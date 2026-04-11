# Coding Conventions — Frontend

**Analysis Date:** 2026-04-09

## Naming Patterns

**Files:**
- React components: PascalCase (`TransactionForm.tsx`)
- Hooks: `use` prefix + PascalCase resource (`useCreateTransaction.ts`)
- API modules: lowercase domain name (`transactions.ts`, `accounts.ts`)
- Utility modules: camelCase descriptor (`buildTransactionPayload.ts`, `formatCents.ts`)
- Schemas: camelCase + `Schema` suffix in the filename and exported variable (`transactionFormSchema.ts` exports `transactionFormSchema`)
- CSS Modules: match component filename (`TransactionRow.module.css`)

**Functions:**
- camelCase for all functions
- Hook functions: `use` prefix required (`useTransactions`, `useCreateTransaction`)
- API functions: imperative verbs (`fetchTransactions`, `createTransaction`, `updateTransaction`, `deleteTransaction`)
- Event handlers inside components: `handle` prefix (`handleSubmitPayload`, `handleDeleteClick`)

**Variables:**
- camelCase; boolean flags often prefixed `is`/`has` (`isTransfer`, `isRecurring`, `hasAvailableConnections`)

**Types:**
- PascalCase for interfaces and type aliases
- All domain types grouped in a **namespace** (see TypeScript Types section below)
- Payload types suffixed with `Payload` (`CreateTransactionPayload`, `UpdateTransactionPayload`)
- Form value types suffixed with `FormValues` (`TransactionFormValues`, `ImportFormValues`)

## TypeScript Types

**Namespace pattern — mandatory for domain types:**
```ts
// src/types/transactions.ts
export namespace Transactions {
  export type TransactionType = "expense" | "income" | "transfer";

  export interface Transaction {
    id: number;
    amount: number; // always cents
    // ...
  }

  export interface CreateTransactionPayload {
    transaction_type: TransactionType;
    // ...
  }
}
```

Import and use as:
```ts
import { Transactions } from '@/types/transactions'

function foo(tx: Transactions.Transaction) { ... }
```

**`any` cast pattern for multi-schema form sub-components:**
When a component must work with multiple form schemas (e.g. `RecurrenceFields`, `SplitSettingsFields`), cast the `useFormContext` type to `any`:
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any

const { control, formState: { errors } } = useFormContext<AnyFormValues>()
```
This is intentional — suppress the ESLint warning with a comment.

## Code Style

**Formatting:**
- ESLint enforced (`npm run lint`)
- Config: `eslint.config.*` (root level; exact config not read)
- Plugins: `eslint-plugin-react-hooks`, `eslint-plugin-unused-imports`

**Imports:**
- Path alias `@/` for all project imports (never relative `../../`)
- No explicit import ordering enforced, but by convention: external packages first, then `@/` imports

## Import Organization

**Order (by convention):**
1. React and external packages (`react`, `@mantine/core`, `@tanstack/react-query`)
2. Internal `@/` imports — hooks, utils, types, components
3. Relative imports within the same directory (`./transactionFormSchema`)

**Path Aliases:**
- `@` → `src/` (configured in `vite.config.ts` resolve.alias)

## Query Key Convention

All `queryKey` arrays must use constants from `src/utils/queryKeys.ts`:
```ts
// ✅ correct
useQuery({ queryKey: [QueryKeys.Transactions, params], queryFn: fetchTransactions })

// ❌ wrong
useQuery({ queryKey: ['transactions', params], queryFn: fetchTransactions })
```

Add new keys to `QueryKeys` before creating a new query hook.

## Hook Patterns

**Query hooks — always return `{ query, invalidate }`:**
```ts
export function useTransactions(params: Transactions.FetchParams) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Transactions, params],
    queryFn: () => fetchTransactions(params),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] })
  return { query, invalidate }
}
```

**Mutation hooks — always return `{ mutation }` only; no invalidation inside:**
```ts
export function useUpdateTransaction() {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: UpdateTransactionVariables) => updateTransaction(id, payload),
  })
  return { mutation }
}
```
Invalidation is the call site's responsibility, not the mutation hook's.

**Exception:** `useCreateTransaction` includes invalidation inside `onSuccess` because it's universally needed and also handles field error mapping via `onFieldErrors` callback. This pattern is not the default.

## Form Patterns

**Setup:**
```ts
const methods = useForm<TransactionFormValues>({
  resolver: zodResolver(transactionFormSchema),
  defaultValues: { ... },
})
```

**Provider wrapping:**
```tsx
<FormProvider {...methods}>
  <TransactionForm onSubmitPayload={handleSubmit} ... />
</FormProvider>
```

**Inside `TransactionForm` and sub-components:**
```ts
const { control, handleSubmit, formState: { errors } } = useFormContext<TransactionFormValues>()
```

**All Mantine inputs must use `<Controller>`:**
```tsx
<Controller
  control={control}
  name="amount"
  render={({ field }) => (
    <CurrencyInput
      ref={field.ref}
      value={field.value}
      onChange={field.onChange}
      error={errors.amount?.message}
    />
  )}
/>
```

**Never use `register()` with Mantine components** — Mantine inputs are controlled; use `Controller` with `value`/`onChange`.

## Zod Schema Patterns

**Shared fields via object spread:**
```ts
export const baseTransactionFields = {
  recurrenceEnabled: z.boolean(),
  recurrenceType: z.enum(["monthly", "weekly", "daily", "yearly"]).nullable(),
  // ...
} as const

export const transactionFormSchema = z.object({
  ...baseTransactionFields,
  date: z.date({ error: "Data é obrigatória" }), // overrides base if needed
}).superRefine((data, ctx) => {
  applySharedRefinements(data, ctx)
})
```

**Shared cross-field validation:**
```ts
export function applySharedRefinements(data: SharedRefinementData, ctx: z.RefinementCtx) {
  if (data.recurrenceEnabled && !data.recurrenceType) {
    ctx.addIssue({ code: "custom", message: "...", path: ["recurrenceType"] })
  }
  // ...
}
```

## Error Handling

**API errors:**
- API functions throw the raw `Response` object when `!res.ok`
- Callers catch in `mutation.onError` and call `parseApiError(err as Response)`
- Then call `mapTagsToFieldErrors(apiError.tags, apiError.message)` to get `Record<string, string>`
- Apply field errors via `methods.setError(field, { message })` or show `_general` in an `<Alert>`

**Pattern in drawer components:**
```ts
onError: async (err: unknown) => {
  if (err instanceof Response) {
    const apiError = await parseApiError(err)
    const errors = mapTagsToFieldErrors(apiError.tags, apiError.message)
    for (const [field, message] of Object.entries(errors)) {
      if (field === '_general') {
        setSubmitError(message)
      } else {
        methods.setError(field as keyof TransactionFormValues, { message })
      }
    }
  } else {
    setSubmitError('Erro ao salvar transação')
  }
}
```

## Drawer Pattern

**Opening (call site):**
```ts
// fire-and-forget
void renderDrawer(() => <CreateTransactionDrawer />)

// await result
const result = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer />)
```

**Inside the drawer component:**
```tsx
export function MyDrawer() {
  const { opened, close, reject } = useDrawerContext<MyResultType>()
  return (
    <Drawer opened={opened} onClose={reject} position="right" size="md">
      <Button onClick={() => close(result)}>Confirmar</Button>
    </Drawer>
  )
}
```
- `close(value)` resolves the promise
- `reject()` rejects (pass to `onClose` so user dismissal rejects)
- Never use `useState`/`useDisclosure` for `opened` in renderDrawer drawers

## Component Guidelines

**Size:** Keep components small and single-responsibility. Large components (>200 lines) should be split.

**Sub-components:** Define small internal components (not exported) at the top of a file before the main exported component. Example: `SplitRowControls`, `SplitRow` inside `SplitSettingsFields.tsx`.

**Props interface:** Define as `interface Props { ... }` inline above the component function, not exported unless consumed externally.

**`namePrefix` pattern for reusable form field groups:**
Components shared between the main form and CSV import accept a `namePrefix?: string` (default `""`) to namespace their field paths:
```ts
export function RecurrenceFields({ namePrefix = "", comboboxWithinPortal = true }: RecurrenceFieldsProps) {
  // ...
  name={`${namePrefix}recurrenceType`}
}
```
This allows the same component to work at the top level of `transactionFormSchema` or nested at `rows.2.` inside `importFormSchema`.

## Language

**UI text language:** Portuguese (Brazilian). All labels, placeholders, error messages, and button text are in pt-BR.

## Comments

**When to comment:** Complex business logic, non-obvious workarounds, and schema design decisions.

**JSDoc:** Used for exported utility functions and schema comments explaining override conventions:
```ts
/**
 * Shared fields between create/edit form and import row schema.
 * Specialized schemas can override fields via spread.
 */
export const baseTransactionFields = { ... }
```

**Inline ESLint suppressions:** Always include a comment explaining why:
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any
```

---

*Convention analysis: 2026-04-09*
