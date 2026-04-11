# Architecture — Frontend

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Layered client architecture — API functions → custom hooks → route/page components → UI components

**Key Characteristics:**
- Strict separation between raw API calls (`src/api/`) and hook wrappers (`src/hooks/`)
- All server state via TanStack Query; no Redux or Zustand
- Forms use React Hook Form with Zod validation and `FormProvider` context for cross-component field access
- Drawers are opened imperatively via `renderDrawer()` helper (isolated React root, Promise-based)
- All protected routes share a single `_authenticated` layout that guards via TanStack Router `beforeLoad`

## Layers

**API Layer:**
- Purpose: Raw fetch calls, no React, no hooks
- Location: `src/api/`
- Contains: `async` functions that call the backend and return typed data or throw `Response` on error
- Depends on: `src/types/transactions.ts` namespaces; `VITE_API_URL` env var
- Used by: hooks only

**Hooks Layer:**
- Purpose: Wrap API functions in TanStack Query; provide `{ query, invalidate }` for reads and `{ mutation }` for writes
- Location: `src/hooks/`
- Contains: one hook per operation (e.g. `useTransactions`, `useCreateTransaction`)
- Depends on: `src/api/`, `src/utils/queryKeys.ts`, `src/utils/apiErrors.ts`
- Used by: route components and drawer components

**Route Layer:**
- Purpose: Page-level entry points; own layout state and orchestrate components
- Location: `src/routes/`
- Contains: TanStack Router route definitions using `createFileRoute`; search param schemas via Zod + `zodValidator`
- Depends on: hooks, utility components, `renderDrawer`
- Used by: TanStack Router (auto-generated `src/routeTree.gen.ts`)

**Component Layer:**
- Purpose: Reusable UI pieces with no routing concerns
- Location: `src/components/`
- Contains: domain-grouped sub-directories (`transactions/`, `accounts/`, `categories/`); form sub-directory for field components
- Depends on: hooks, `src/types/`, Mantine, utils
- Used by: routes

**Utility Layer:**
- Purpose: Pure functions, shared constants, infrastructure helpers
- Location: `src/utils/`
- Key files:
  - `queryKeys.ts` — `QueryKeys` const object (all query cache keys)
  - `renderDrawer.tsx` — imperative drawer system
  - `buildTransactionPayload.ts` — maps form values to API payload
  - `apiErrors.ts` — parses backend `ErrorTag` arrays to RHF field paths
  - `formatCents.ts` — currency formatting (BRL, cents → display)
  - `parseDate.ts` — UTC-safe date parsing and conversion utilities
  - `groupTransactions.ts` — groups `Transaction[]` by date/category/account

## Data Flow

**Reading Data (Query):**
1. Route/component calls `useXxx()` hook
2. Hook calls `useQuery({ queryKey: [QueryKeys.Xxx, params], queryFn: fetchXxx })`
3. API function fetches from `VITE_API_URL/api/...` with `credentials: 'include'`
4. Data flows back as typed result from namespace (e.g. `Transactions.Transaction[]`)
5. Hook returns `{ query, invalidate }` — component reads `query.data`

**Writing Data (Mutation):**
1. Component calls `useXxxMutation()` hook, receives `{ mutation }`
2. Component calls `mutation.mutate(payload, { onSuccess, onError })`
3. On success: component (not mutation hook) calls `invalidate()` from relevant query hook
4. On error: component receives `Response` object; calls `parseApiError` then `mapTagsToFieldErrors`; sets RHF field errors via `methods.setError`

**Form Submission Flow (Transaction):**
1. Drawer component initializes `useForm` with `zodResolver(transactionFormSchema)` and default values
2. `FormProvider` wraps `<TransactionForm>` to share form context
3. `TransactionForm` uses `useFormContext<TransactionFormValues>()` — accesses fields without prop drilling
4. Sub-components (`RecurrenceFields`, `SplitSettingsFields`) also use `useFormContext` with `namePrefix` for reuse in import context
5. On submit: `handleSubmit(onSubmit)` validates with Zod, calls `buildTransactionPayload(values, existingTags)`
6. `buildTransactionPayload` converts form values to `CreateTransactionPayload` (handles date ISO conversion, tag resolution, recurrence/split conditioning)
7. Mutation fires; success closes drawer via `ctx.close()`

**Route Protection:**
1. `_authenticated.tsx` parent route calls `beforeLoad` → `context.queryClient.ensureQueryData({ queryKey: [QueryKeys.Me] })`
2. On 401/throw: redirects to `/login?redirect=<location>`
3. All child routes defined as `_authenticated.<name>.tsx` inherit this guard automatically

## Key Abstractions

**`renderDrawer<T>(factory)`:**
- Purpose: Opens a drawer in an isolated React root; returns `Promise<T>` resolved when `ctx.close(value)` is called
- Location: `src/utils/renderDrawer.tsx`
- Pattern: `void renderDrawer(() => <MyDrawer />)` or `const result = await renderDrawer<MyType>(() => <MyDrawer />)`
- Inside drawer: `const { opened, close, reject } = useDrawerContext<T>()`

**`QueryKeys` constant:**
- Purpose: Single source of truth for all TanStack Query cache keys
- Location: `src/utils/queryKeys.ts`
- Pattern: Always use `QueryKeys.Xxx`; never use string literals in `queryKey` arrays

**`baseTransactionFields` + `applySharedRefinements`:**
- Purpose: Shared Zod field definitions and cross-field validation rules reused by both the main form schema and the CSV import form schema
- Location: `src/components/transactions/form/transactionFormSchema.ts`
- Pattern: Spread `baseTransactionFields` into specialized schemas; call `applySharedRefinements(data, ctx)` inside `superRefine`

**Namespace types:**
- Purpose: Group related types without polluting the global namespace
- Location: `src/types/transactions.ts`
- Pattern: `export namespace Transactions { export type X = ... }` — import as `import { Transactions } from '@/types/transactions'`

## Entry Points

**Application:**
- Location: `src/main.tsx`
- Responsibilities: Creates React root; wraps with `QueryClientProvider`, `MantineProvider`; renders `<App>`

**Router:**
- Location: `src/App.tsx`
- Responsibilities: Renders `<RouterProvider router={router} context={{ queryClient }} >`; lazy-loads devtools in development

**Route Root:**
- Location: `src/routes/__root.tsx`
- Responsibilities: `createRootRouteWithContext<{ queryClient: QueryClient }>()` — injects queryClient into all route `beforeLoad` context

**Auth Guard:**
- Location: `src/routes/_authenticated.tsx`
- Responsibilities: Guards all child routes; fetches `/api/auth/me` via queryClient on navigation; redirects to `/login` on failure; renders `<AppLayout>` (shell with nav)

## Error Handling

**Strategy:** API errors are `Response` objects thrown by API functions; caught in `onError` callbacks; parsed and mapped to RHF field errors or general error state.

**Patterns:**
- API functions throw `res` (the raw `Response`) when `!res.ok`
- `parseApiError(res: Response)` reads JSON body → `{ error, message, tags }`
- `mapTagsToFieldErrors(tags, message)` maps backend `ErrorTag` strings to RHF field paths; returns `{ fieldPath: message }` map; falls back to `_general` key for unmapped errors
- Components check for `_general` key to show top-level `<Alert>` vs calling `methods.setError(field, { message })`

## Cross-Cutting Concerns

**Authentication:** Cookie-based (`credentials: 'include'` on all fetch calls); JWT read by backend from `auth_token` cookie or `Authorization` header

**Date Handling:** All amounts stored as integers (cents). API dates are UTC ISO strings; `convertUtcToLocalKeepingValues()` strips timezone offset for display; `localMidnightISO()` in `src/api/transactions.ts` re-adds offset when sending to backend

**Currency:** All monetary values in cents (int). `formatCents()` / `formatBalance()` / `formatSignedCents()` in `src/utils/formatCents.ts` for display. `CurrencyInput` component in `src/components/transactions/form/CurrencyInput.tsx` handles user input.

**Mobile First:** Components branch on `useIsMobile()` hook (`src/hooks/useIsMobile.ts`); sticky headers use `dvh` units; touch targets sized for Mantine's default touch-friendly sizes; `AppShell` collapses navbar on mobile

---

*Architecture analysis: 2026-04-09*
