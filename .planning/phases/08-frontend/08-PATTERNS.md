# Phase 8: Frontend - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 17 (14 new + 3 modified)
**Analogs found:** 17 / 17

---

## Critical Infrastructure Note

`@mantine/notifications` and `@mantine/modals` are **NOT installed** in
`frontend/package.json`. The UI-SPEC references both packages but the existing
codebase does not use them. The established pattern for:

- **Success feedback** — close the drawer; no toast. Query invalidation causes
  the list to refresh, giving implicit confirmation.
- **Error feedback** — Mantine `Alert color="red"` rendered inline inside the
  drawer/modal (see `AccountForm.tsx` lines 52-55, `TransactionForm.tsx`).
- **Confirmation dialogs** — Mantine `Modal` with explicit `opened` state (see
  `DeleteCategoryDialog.tsx`).

The planner must either (a) install `@mantine/notifications` and
`@mantine/modals` as a prerequisite step, or (b) implement success/confirm UX
using the existing `Alert`/`Modal` pattern. **Do not import packages that are
not in package.json.**

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/routes/_authenticated.charges.tsx` | route/page | request-response | `src/routes/_authenticated.transactions.tsx` | exact |
| `src/api/charges.ts` | API client | request-response | `src/api/transactions.ts` | exact |
| `src/types/charges.ts` | types | — | `src/types/transactions.ts` | exact |
| `src/hooks/useCharges.ts` | hook (query) | CRUD | `src/hooks/useTransactions.ts` | exact |
| `src/hooks/useChargesPendingCount.ts` | hook (query) | request-response | `src/hooks/useAccounts.ts` | role-match |
| `src/hooks/useCreateCharge.ts` | hook (mutation) | CRUD | `src/hooks/useCreateTransaction.ts` | exact |
| `src/hooks/useAcceptCharge.ts` | hook (mutation) | CRUD | `src/hooks/useUpdateTransaction.ts` | role-match |
| `src/hooks/useRejectCharge.ts` | hook (mutation) | CRUD | `src/hooks/useDeleteTransaction.ts` | role-match |
| `src/hooks/useCancelCharge.ts` | hook (mutation) | CRUD | `src/hooks/useDeleteTransaction.ts` | role-match |
| `src/components/charges/ChargeCard.tsx` | component | — | `src/components/accounts/AccountCard.tsx` | exact |
| `src/components/charges/ChargeCard.module.css` | styles | — | `src/components/transactions/TransactionRow.module.css` | role-match |
| `src/components/charges/CreateChargeDrawer.tsx` | component (drawer) | request-response | `src/components/transactions/CreateTransactionDrawer.tsx` | exact |
| `src/components/charges/AcceptChargeDrawer.tsx` | component (drawer) | request-response | `src/components/accounts/AccountDrawer.tsx` | role-match |
| `src/components/charges/ChargeStatusBadge.tsx` | component | — | `src/components/transactions/RecurrenceBadge.tsx` | role-match |
| `src/components/AppLayout.tsx` (modified) | layout | — | itself | — |
| `src/utils/queryKeys.ts` (modified) | utility | — | itself | — |
| `src/utils/apiErrors.ts` (modified) | utility | — | itself | — |

---

## Pattern Assignments

### `src/routes/_authenticated.charges.tsx` (route/page, request-response)

**Analog:** `src/routes/_authenticated.transactions.tsx`

**Route definition pattern** (lines 39-42):
```tsx
// Use createFileRoute (not createAuthenticatedRoute — that utility doesn't exist).
// Auth is handled by the parent _authenticated.tsx layout route via beforeLoad.
export const Route = createFileRoute('/_authenticated/charges')({
  validateSearch: zodValidator(chargeSearchSchema),
  component: ChargesPage,
})
```

**Search schema pattern** (lines 26-37):
```tsx
const now = new Date()

const chargeSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(now.getMonth() + 1),
  year: z.coerce.number().int().default(now.getFullYear()),
})
```

**Sticky header pattern** (lines 201-240, desktop branch):
```tsx
<Stack gap="md">
  <Box
    style={{
      position: 'sticky',
      top: 'calc(-1 * var(--mantine-spacing-md))',
      zIndex: 10,
      background: 'var(--mantine-color-body)',
      marginTop: 'calc(-1 * var(--mantine-spacing-md))',
      paddingTop: 'var(--mantine-spacing-md)',
      paddingBottom: 'var(--mantine-spacing-xs)',
    }}
  >
    <Group justify="space-between" align="center">
      <PeriodNavigator month={search.month} year={search.year} />
      <Button leftSection={<IconPlus size={16} />} onClick={() => void renderDrawer(() => <CreateChargeDrawer />)}>
        Nova Cobrança
      </Button>
    </Group>
  </Box>
  {/* content */}
</Stack>
```

**Mobile branch pattern** (lines 110-198): wrap content in `<Stack gap="sm" pb="5rem">` for mobile bottom safe area.

**renderDrawer invocation** (lines 131, 218):
```tsx
onClick={() => void renderDrawer(() => <CreateChargeDrawer />)
```

**PeriodNavigator** is reused but the charges page version must use `from: '/charges'` and `from: '/_authenticated/charges'` instead of the hardcoded transaction paths inside `PeriodNavigator.tsx`. The component will need to accept a `from`/`route` prop OR the charges page will need a local copy that uses its own route. See PeriodNavigator analog section below.

**Skeleton loading pattern** (lines 84-90 in `_authenticated.accounts.tsx`):
```tsx
{query.isLoading ? (
  <Stack gap="sm">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} height={80} radius="md" />
    ))}
  </Stack>
) : (
  /* list */
)}
```

---

### `src/api/charges.ts` (API client, request-response)

**Analog:** `src/api/transactions.ts`

**Module header pattern** (lines 1-3 of transactions.ts):
```ts
import { Charges } from '@/types/charges'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
```

**GET with query params pattern** (lines 39-65):
```ts
export async function fetchCharges(params: Charges.FetchParams): Promise<Charges.ListResponse> {
  const url = new URL(`${apiUrl}/api/charges`)
  url.searchParams.set('month', String(params.month))
  url.searchParams.set('year', String(params.year))
  if (params.direction) url.searchParams.set('direction', params.direction)
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch charges')
  return res.json()
}
```

**GET simple endpoint pattern** (for pending-count — analogous to fetchBalance lines 17-37):
```ts
export async function fetchChargesPendingCount(): Promise<{ count: number }> {
  const res = await fetch(`${apiUrl}/api/charges/pending-count`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch pending count')
  return res.json()
}
```

**POST with JSON body pattern** (lines 146-161):
```ts
export async function createCharge(payload: Charges.CreateChargePayload): Promise<Response> {
  const res = await fetch(`${apiUrl}/api/charges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw res   // throw the Response so mutation onError can parseApiError
  return res
}
```

**POST to sub-resource pattern** (analogous to deleteTransaction — lines 80-92 — but POST not DELETE):
```ts
export async function acceptCharge(id: number, payload: Charges.AcceptChargePayload): Promise<void> {
  const res = await fetch(`${apiUrl}/api/charges/${id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw res
}

export async function rejectCharge(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/charges/${id}/reject`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw res
}

export async function cancelCharge(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/charges/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw res
}
```

**Error throw convention:** throw the raw `Response` (not `new Error(...)`) for mutations so `onError` can call `parseApiError(err as Response)`. Throw `new Error(...)` for queries since those errors are not field-mapped.

---

### `src/types/charges.ts` (types namespace)

**Analog:** `src/types/transactions.ts`

**Namespace pattern** (lines 1-5 of transactions.ts):
```ts
export namespace Charges {
  export type ChargeStatus = 'pending' | 'paid' | 'rejected' | 'cancelled'
  export type Direction = 'sent' | 'received'

  export interface Charge {
    id: number
    charger_user_id: number
    payer_user_id: number
    charger_account_id: number | null
    payer_account_id: number | null
    connection_id: number
    period_month: number
    period_year: number
    description: string | null
    status: ChargeStatus
    date: string | null        // ISO string from backend time.Time
    created_at: string | null
    updated_at: string | null
  }

  export interface FetchParams {
    month: number
    year: number
    direction?: Direction
  }

  export interface ListResponse {
    charges: Charge[]
  }

  export interface CreateChargePayload {
    connection_id: number
    my_account_id: number
    period_month: number
    period_year: number
    description?: string
    date: string               // ISO RFC3339 string
  }

  export interface AcceptChargePayload {
    account_id: number
    date: string               // ISO RFC3339 string
    amount?: number            // optional override in cents (int64 on backend)
  }
}
```

Source shape from `backend/internal/domain/charge.go` lines 24-72.

---

### `src/hooks/useCharges.ts` (hook, query)

**Analog:** `src/hooks/useTransactions.ts` (exact match)

**Full pattern** (lines 1-15):
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCharges } from '@/api/charges'
import { QueryKeys } from '@/utils/queryKeys'
import { Charges } from '@/types/charges'

export function useCharges(params: Charges.FetchParams) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Charges, params],
    queryFn: () => fetchCharges(params),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Charges] })
  return { query, invalidate }
}
```

---

### `src/hooks/useChargesPendingCount.ts` (hook, query)

**Analog:** `src/hooks/useAccounts.ts` (role-match — simple parameterless query)

**Pattern** (lines 1-17 of useAccounts.ts):
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchChargesPendingCount } from '@/api/charges'
import { QueryKeys } from '@/utils/queryKeys'

export function useChargesPendingCount() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.ChargesPendingCount],
    queryFn: fetchChargesPendingCount,
    staleTime: 60 * 1000,   // 1 minute; invalidated on every charge mutation
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ChargesPendingCount] })
  return { query, invalidate }
}
```

---

### `src/hooks/useCreateCharge.ts` (hook, mutation)

**Analog:** `src/hooks/useCreateTransaction.ts` (exact match)

**Full pattern** (lines 1-32):
```ts
import { useMutation } from '@tanstack/react-query'
import { createCharge } from '@/api/charges'
import { Charges } from '@/types/charges'
import { parseApiError, mapTagsToFieldErrors } from '@/utils/apiErrors'

interface UseCreateChargeOptions {
  onFieldErrors?: (errors: Record<string, string>) => void
  onSuccess?: () => void
}

export function useCreateCharge(options: UseCreateChargeOptions = {}) {
  const mutation = useMutation({
    mutationFn: (payload: Charges.CreateChargePayload) => createCharge(payload),
    onSuccess: () => {
      options.onSuccess?.()
    },
    onError: async (err: unknown) => {
      if (err instanceof Response) {
        const apiError = await parseApiError(err)
        const fieldErrors = mapTagsToFieldErrors(apiError.tags, apiError.message)
        options.onFieldErrors?.(fieldErrors)
      }
    },
  })
  return { mutation }
}
```

**Invalidation responsibility:** the mutation hook does NOT invalidate. The call site (drawer `onSuccess` callback) calls `invalidate()` from `useCharges` and `useChargesPendingCount`. This matches the pattern in `useCreateTransaction.ts` — note that `useCreateTransaction` does invalidate internally, but the `frontend/CLAUDE.md` states "Invalidation is the query hook's responsibility, not the mutation's." The charges mutation hooks must follow the CLAUDE.md rule: **no invalidation inside mutation hooks**.

---

### `src/hooks/useAcceptCharge.ts` (hook, mutation)

**Analog:** `src/hooks/useUpdateTransaction.ts` (role-match — mutation with id + payload)

**Pattern** (lines 1-16 of useUpdateTransaction.ts):
```ts
import { useMutation } from '@tanstack/react-query'
import { acceptCharge } from '@/api/charges'
import { Charges } from '@/types/charges'

interface AcceptChargeVariables {
  id: number
  payload: Charges.AcceptChargePayload
}

export function useAcceptCharge() {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: AcceptChargeVariables) => acceptCharge(id, payload),
  })
  return { mutation }
}
```

---

### `src/hooks/useRejectCharge.ts` (hook, mutation)

**Analog:** `src/hooks/useDeleteTransaction.ts` (role-match — id-only mutation)

**Pattern** (lines 1-16 of useDeleteTransaction.ts):
```ts
import { useMutation } from '@tanstack/react-query'
import { rejectCharge } from '@/api/charges'

export function useRejectCharge() {
  const mutation = useMutation({
    mutationFn: (id: number) => rejectCharge(id),
  })
  return { mutation }
}
```

---

### `src/hooks/useCancelCharge.ts` (hook, mutation)

**Analog:** `src/hooks/useDeleteTransaction.ts` (role-match — same as reject)

```ts
import { useMutation } from '@tanstack/react-query'
import { cancelCharge } from '@/api/charges'

export function useCancelCharge() {
  const mutation = useMutation({
    mutationFn: (id: number) => cancelCharge(id),
  })
  return { mutation }
}
```

---

### `src/components/charges/ChargeCard.tsx` (component)

**Analog:** `src/components/accounts/AccountCard.tsx` (exact match — Card with actions)

**Card shell pattern** (lines 16-51 of AccountCard.tsx):
```tsx
import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core'
import { Charges } from '@/types/charges'
import { ChargeStatusBadge } from './ChargeStatusBadge'
import { formatBalance } from '@/utils/formatCents'
import classes from './ChargeCard.module.css'

interface Props {
  charge: Charges.Charge
  currentUserId: number
  partnerName: string
  balanceAmount?: number      // cents; shown if available
  onAccept?: () => void
  onReject?: () => void
  onCancel?: () => void
}

export function ChargeCard({ charge, currentUserId, partnerName, balanceAmount, onAccept, onReject, onCancel }: Props) {
  const isReceived = charge.payer_user_id === currentUserId
  const isPending = charge.status === 'pending'

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text size="md" fw={400}>{partnerName}</Text>
          <Text size="sm" c="dimmed">
            {String(charge.period_month).padStart(2, '0')}/{charge.period_year}
          </Text>
          {charge.description && (
            <Text size="sm" c="dimmed" lineClamp={1}>{charge.description}</Text>
          )}
        </Stack>
        <ChargeStatusBadge status={charge.status} />
      </Group>

      <Group justify="space-between" align="center" mt="sm">
        <Text size="md" fw={700}>
          {balanceAmount != null ? formatBalance(balanceAmount) : '—'}
        </Text>
        {isPending && (
          <Group gap="xs">
            {isReceived && onAccept && (
              <Button size="xs" color="teal" onClick={onAccept}>Aceitar</Button>
            )}
            {isReceived && onReject && (
              <Button size="xs" color="red" variant="light" onClick={onReject}>Recusar</Button>
            )}
            {!isReceived && onCancel && (
              <Button size="xs" color="red" variant="light" onClick={onCancel}>Cancelar</Button>
            )}
          </Group>
        )}
      </Group>
    </Card>
  )
}
```

**Amount display:** use `formatBalance` from `src/utils/formatCents.ts` (line 13 — formats signed cents as currency string without explicit +/- prefix).

---

### `src/components/charges/ChargeCard.module.css` (styles)

**Analog:** any existing `.module.css` in `src/components/` — all are minimal, colocated files. No special pattern beyond standard CSS Modules. ChargeCard layout uses Mantine Stack/Group/Card so minimal custom CSS is needed (at most a `root` class for the card width/max-width if required).

---

### `src/components/charges/CreateChargeDrawer.tsx` (component, drawer)

**Analog:** `src/components/transactions/CreateTransactionDrawer.tsx` (exact match)

**renderDrawer + useDrawerContext pattern** (lines 26-27 of CreateTransactionDrawer.tsx):
```tsx
export function CreateChargeDrawer() {
  const { opened, close, reject } = useDrawerContext<void>()
  // ...
  return (
    <Drawer opened={opened} onClose={reject} title="Nova Cobrança" position="right" size="md">
      {/* form */}
    </Drawer>
  )
}
```

**Error handling pattern inside drawer** (lines 78-93 of CreateTransactionDrawer.tsx):
```tsx
onError: async (err: unknown) => {
  if (err instanceof Response) {
    const apiError = await parseApiError(err)
    const errors = mapTagsToFieldErrors(apiError.tags, apiError.message)
    for (const [field, message] of Object.entries(errors)) {
      if (field === '_general') {
        setSubmitError(message)
      } else {
        methods.setError(field as keyof ChargeFormValues, { message })
      }
    }
  } else {
    setSubmitError('Erro ao criar cobrança')
  }
},
```

**General error display** (from AccountForm.tsx lines 52-55):
```tsx
{submitError && (
  <Alert color="red" title="Erro" variant="light">
    {submitError}
  </Alert>
)}
```

**Form library:** react-hook-form + zodResolver (same as all existing forms).

**Submit button loading pattern** (AccountForm.tsx line 83):
```tsx
<Button type="submit" loading={mutation.isPending} disabled={mutation.isPending} fullWidth>
  Criar Cobrança
</Button>
```

**On success:** call `close()` (resolves the renderDrawer promise), then the call site invalidates queries.

---

### `src/components/charges/AcceptChargeDrawer.tsx` (component, drawer)

**Analog:** `src/components/accounts/AccountDrawer.tsx` (role-match — drawer with form + mutation)

**Pattern differences from CreateChargeDrawer:**
- Receives `charge: Charges.Charge` as a prop (passed when `renderDrawer(() => <AcceptChargeDrawer charge={charge} />)` is called)
- Shows read-only charge summary before form fields
- Uses `useAcceptCharge` mutation

**Drawer shell** (lines 14-63 of AccountDrawer.tsx):
```tsx
export function AcceptChargeDrawer({ charge }: { charge: Charges.Charge }) {
  const { opened, close, reject } = useDrawerContext<void>()

  const { mutation } = useAcceptCharge()

  function handleSubmit(values: AcceptChargeFormValues) {
    mutation.mutate(
      { id: charge.id, payload: { account_id: values.account_id, date: values.date, amount: values.amount } },
      {
        onSuccess: () => close(),
        onError: async (err) => {
          if (err instanceof Response) {
            const apiError = await parseApiError(err)
            const errors = mapTagsToFieldErrors(apiError.tags, apiError.message)
            // setError on form fields or setSubmitError
          }
        },
      },
    )
  }

  return (
    <Drawer opened={opened} onClose={reject} title="Aceitar Cobrança" position="right" size="md">
      <Stack gap="md">
        {/* read-only summary */}
        {/* form fields */}
        <Button type="submit" loading={mutation.isPending} fullWidth>
          Confirmar aceitação
        </Button>
      </Stack>
    </Drawer>
  )
}
```

---

### `src/components/charges/ChargeStatusBadge.tsx` (component)

**Analog:** `src/components/transactions/RecurrenceBadge.tsx` (role-match — small badge component)

**Badge pattern** (from TransactionRow.tsx line 197 and AccountCard.tsx line 21):
```tsx
import { Badge } from '@mantine/core'
import { Charges } from '@/types/charges'

const STATUS_COLORS: Record<Charges.ChargeStatus, string> = {
  pending: 'yellow',
  paid: 'teal',
  rejected: 'red',
  cancelled: 'gray',
}

const STATUS_LABELS: Record<Charges.ChargeStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
}

interface Props {
  status: Charges.ChargeStatus
}

export function ChargeStatusBadge({ status }: Props) {
  return (
    <Badge color={STATUS_COLORS[status]} variant="light" size="sm">
      {STATUS_LABELS[status]}
    </Badge>
  )
}
```

---

### Confirmation Pattern for Reject / Cancel

**No analog exists** for `modals.openConfirmModal` — `@mantine/modals` is not installed.

**Existing confirmation pattern** (from `DeleteCategoryDialog.tsx`) uses a Mantine `Modal` with explicit `opened` state. Apply the same approach:

```tsx
// Inside ChargeCard or the page, manage modal state:
const [confirmAction, setConfirmAction] = useState<'reject' | 'cancel' | null>(null)

// Modal component inline or extracted:
<Modal
  opened={confirmAction !== null}
  onClose={() => setConfirmAction(null)}
  title={confirmAction === 'reject' ? 'Recusar cobrança' : 'Cancelar cobrança'}
  size="sm"
>
  <Stack gap="md">
    <Text size="sm">
      {confirmAction === 'reject'
        ? 'Tem certeza que deseja recusar esta cobrança? Esta ação não pode ser desfeita.'
        : 'Tem certeza que deseja cancelar esta cobrança? Esta ação não pode ser desfeita.'}
    </Text>
    <Group justify="flex-end">
      <Button variant="default" onClick={() => setConfirmAction(null)}>Voltar</Button>
      <Button color="red" loading={rejectMutation.isPending || cancelMutation.isPending} onClick={handleConfirm}>
        {confirmAction === 'reject' ? 'Recusar' : 'Cancelar cobrança'}
      </Button>
    </Group>
  </Stack>
</Modal>
```

Source pattern: `src/components/categories/DeleteCategoryDialog.tsx` lines 61-94.

---

## Modified Files

### `src/components/AppLayout.tsx`

**Change:** Add "Cobranças" entry to `navLinks` array with a dynamic badge for pending count.

**Current navLinks pattern** (lines 10-14):
```tsx
const navLinks = [
  { label: "Transações", icon: IconReceipt2, to: "/transactions" },
  { label: "Contas", icon: IconWallet, to: "/accounts" },
  { label: "Categorias", icon: IconTree, to: "/categories" },
]
```

**Current NavLink render** (lines 89-99):
```tsx
{navLinks.map(({ label, icon: Icon, to }) => (
  <NavLink
    key={to}
    component={Link}
    to={to}
    label={label}
    leftSection={<Icon size={18} />}
    active={currentPath === to}
    onClick={close}
  />
))}
```

**Required change:** The navLinks array type and map render must be extended to support an optional `badge` property. The pending count must be fetched inside `AppLayout` via `useChargesPendingCount`. The `Badge` component from `@mantine/core` (already imported) is used for the count indicator with `color="red"`.

New import to add: `IconCreditCard` from `@tabler/icons-react` (line 3).

---

### `src/utils/queryKeys.ts`

**Current file** (lines 1-9):
```ts
export const QueryKeys = {
  Me: 'me',
  Transactions: 'transactions',
  Balance: 'balance',
  Accounts: 'accounts',
  Categories: 'categories',
  Tags: 'tags',
  InviteInfo: 'invite-info',
} as const
```

**Add:**
```ts
  Charges: 'charges',
  ChargesPendingCount: 'charges-pending-count',
```

---

### `src/utils/apiErrors.ts`

**Extend `tagToField` map** (lines 34-52) with charge-specific entries:
```ts
// Charge tags (add after existing TRANSACTION.* and TAG.* entries)
'CHARGE.INVALID_CONNECTION_ID': 'connection_id',
'CHARGE.CONNECTION_NOT_ACCEPTED': 'connection_id',
'CHARGE.INVALID_ACCOUNT_ID': 'my_account_id',
'CHARGE.INVALID_PAYER': '_general',
'CHARGE.CHARGE_NOT_PENDING': '_general',
'CHARGE.AMOUNT_MUST_BE_POSITIVE': 'amount',
```

No structural change — only appending to the existing `tagToField` object.

---

## Shared Patterns

### renderDrawer (all drawer components)

**Source:** `src/utils/renderDrawer.tsx`
**Apply to:** `CreateChargeDrawer.tsx`, `AcceptChargeDrawer.tsx`

```tsx
// Call site (page or card):
void renderDrawer(() => <CreateChargeDrawer periodMonth={month} periodYear={year} />)

// Inside drawer component:
import { useDrawerContext } from '@/utils/renderDrawer'
const { opened, close, reject } = useDrawerContext<void>()
// opened → pass to Drawer
// close() → on form submit success
// reject() → pass to Drawer onClose prop (user dismisses without submitting)
```

### Error Display (all forms)

**Source:** `src/components/accounts/AccountForm.tsx` lines 52-55
**Apply to:** `CreateChargeDrawer.tsx`, `AcceptChargeDrawer.tsx`

```tsx
const [submitError, setSubmitError] = useState<string | undefined>()

{submitError && (
  <Alert color="red" title="Erro" variant="light">
    {submitError}
  </Alert>
)}
```

### Loading Button (all mutations)

**Source:** `src/components/accounts/AccountForm.tsx` line 83
**Apply to:** All charge action buttons

```tsx
<Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
  {label}
</Button>
```

### Skeleton Loading (list pages)

**Source:** `src/routes/_authenticated.accounts.tsx` lines 84-90
**Apply to:** `_authenticated.charges.tsx` while `chargesQuery.isLoading`

```tsx
{query.isLoading ? (
  <Stack gap="sm">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} height={80} radius="md" />
    ))}
  </Stack>
) : (
  /* charge cards */
)}
```

### Amount Formatting

**Source:** `src/utils/formatCents.ts`
**Apply to:** `ChargeCard.tsx`, `AcceptChargeDrawer.tsx` (balance preview)

```ts
import { formatBalance } from '@/utils/formatCents'
// formatBalance(amountInCents) → "R$ 1.234,56" (signed, no explicit prefix)
```

### Query Invalidation on Mutation Success

**Source:** `src/hooks/useCreateTransaction.ts` lines 17-20 (but charge mutation hooks do NOT invalidate internally — see CLAUDE.md rule)
**Apply to:** Drawer `onSuccess` callbacks

```tsx
// In the drawer or page handler, after mutation.mutate() succeeds:
invalidateCharges()           // from useCharges({ ... }).invalidate
invalidatePendingCount()      // from useChargesPendingCount().invalidate
close()                       // close the drawer
```

---

## PeriodNavigator Adaptation Note

**Source:** `src/components/transactions/PeriodNavigator.tsx` lines 15-16

```tsx
const navigate = useNavigate({ from: '/transactions' })
const search = useSearch({ from: '/_authenticated/transactions' })
```

These strings are hardcoded to the transactions route. The charges page cannot reuse this component directly without modification. Options (planner decides):

1. **Add props** — extend `PeriodNavigator` to accept `from` and `routeId` props (breaking change to existing usage if not defaulted).
2. **Copy component** — create `src/components/charges/ChargePeriodNavigator.tsx` with `/charges` and `/_authenticated/charges` substituted. Simplest, no risk to existing code.

---

## No Analog Found

All 17 files have analogs. No files require fallback to RESEARCH.md patterns.

---

## Metadata

**Analog search scope:** `frontend/src/` (api/, hooks/, components/, routes/, utils/, types/)
**Backend shape source:** `backend/internal/domain/charge.go`, `backend/internal/handler/charge_handler.go`
**Files scanned:** 30+
**Pattern extraction date:** 2026-04-16
