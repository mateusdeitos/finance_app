# Phase 9: Bulk Actions - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 6 (3 new, 3 modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/src/components/transactions/SelectionActionBar.tsx` (modify) | component | event-driven | itself (current version) | exact |
| `frontend/src/components/transactions/BulkProgressDrawer.tsx` (new) | component | batch | `BulkDeleteProgressDrawer.tsx` | exact |
| `frontend/src/components/transactions/SelectCategoryDrawer.tsx` (new) | component | request-response | `import/CreateCategoryDrawer.tsx` | role-match |
| `frontend/src/components/transactions/SelectDateDrawer.tsx` (new) | component | request-response | `PropagationSettingsDrawer.tsx` | role-match |
| `frontend/src/components/transactions/PropagationSettingsDrawer.tsx` (modify) | component | request-response | itself (current version) | exact |
| `frontend/src/routes/_authenticated.transactions.tsx` (modify) | page | event-driven | itself (`handleDeleteClick` flow) | exact |

## Pattern Assignments

### `frontend/src/components/transactions/SelectionActionBar.tsx` (modify, event-driven)

**Analog:** Current file + Mantine Menu pattern from `_authenticated.transactions.tsx`

**Current imports** (lines 1-3):
```tsx
import { ActionIcon, Button, Group, Text } from '@mantine/core'
import { IconTrash, IconX } from '@tabler/icons-react'
import classes from './SelectionActionBar.module.css'
```

**New imports to add:**
```tsx
import { ActionIcon, Button, Group, Menu, Text } from '@mantine/core'
import { IconCalendar, IconCategory, IconChevronDown, IconTrash, IconX } from '@tabler/icons-react'
```

**Mantine Menu pattern** (from `_authenticated.transactions.tsx` lines 137-151):
```tsx
<Menu shadow="md" width={200}>
  <Menu.Target>
    <ActionIcon size="sm" variant="default" aria-label="Mais opcoes">
      <IconDots size={14} />
    </ActionIcon>
  </Menu.Target>
  <Menu.Dropdown>
    <Menu.Item
      leftSection={<IconTableImport size={14} />}
      onClick={() => void navigate({ to: '/transactions/import' })}
    >
      Importar transacoes
    </Menu.Item>
  </Menu.Dropdown>
</Menu>
```

**Current props interface** (lines 5-9):
```tsx
interface SelectionActionBarProps {
  count: number
  onClearSelection: () => void
  onDelete: () => void
}
```

**Current layout** (lines 13-39) — replace `<Button>` with `<Menu>`:
```tsx
<div className={classes.bar} data-testid="selection_action_bar">
  <ActionIcon ... onClick={onClearSelection} ... />
  <Group justify="space-between" align="center">
    <Text size="sm" fw={700} data-testid="selection_count">{count}</Text>
    <Button color="red" size="sm" leftSection={<IconTrash size={14} />} onClick={onDelete} ...>
      Excluir
    </Button>
  </Group>
</div>
```

---

### `frontend/src/components/transactions/BulkProgressDrawer.tsx` (new, batch)

**Analog:** `frontend/src/components/transactions/BulkDeleteProgressDrawer.tsx` — generalize this entire file.

**Imports pattern** (lines 1-14):
```tsx
import {
  Button,
  Drawer,
  Group,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useDrawerContext } from "@/utils/renderDrawer";
```

**Drawer context pattern** (line 41):
```tsx
const { opened, close } = useDrawerContext<void>();
```

**Core sequential processing pattern** (lines 47-84):
```tsx
useEffect(() => {
  async function run() {
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      setCurrentLabel(tx.description);
      setProgress(Math.round((i / transactions.length) * 100));

      try {
        await deleteTransaction(tx.id, tx.propagationSettings);
      } catch (err) {
        let reason = "Erro desconhecido";
        if (err instanceof Response) {
          try {
            const body = await err.json();
            reason = body.message ?? reason;
          } catch {
            reason = `Erro ${err.status}`;
          }
        }
        setErrorInfo({
          description: tx.description,
          reason,
          remaining: transactions.slice(i + 1).map((t) => t.description),
        });
        setState("error");
        return;
      }
    }

    setProgress(100);
    setCurrentLabel("");
    setState("success");
    onInvalidate();
    onSuccess();
  }

  run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**Drawer close-prevention pattern** (lines 87-94, 104):
```tsx
const isProcessing = state === "processing";
// ...
<Drawer
  opened={opened}
  onClose={isProcessing ? () => {} : close}
  closeOnEscape={!isProcessing}
  closeOnClickOutside={!isProcessing}
  position="bottom"
  withCloseButton={!isProcessing}
```

**Bottom drawer styles** (lines 106-110):
```tsx
styles={{
  content: {
    borderRadius: "var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0",
    height: "auto",
    maxHeight: "80dvh",
  },
}}
```

**Success state UI** (lines 129-145):
```tsx
{state === "success" && (
  <Stack gap="sm" align="center" data-testid="bulk_delete_success">
    <Group justify="center" gap="xs">
      <ThemeIcon color="teal" radius="xl" size="lg">
        <IconCheck size={18} />
      </ThemeIcon>
      <Text size="sm" fw={500}>
        {transactions.length} transac
        {transactions.length !== 1 ? "oes excluidas" : "ao excluida"} com sucesso
      </Text>
    </Group>
    <Button variant="default" onClick={() => close()} data-testid="btn_bulk_delete_done">
      Fechar
    </Button>
  </Stack>
)}
```

**Error state UI** (lines 147-176):
```tsx
{state === "error" && errorInfo && (
  <Stack gap="xs" data-testid="bulk_delete_error">
    <Group gap="xs">
      <ThemeIcon color="red" radius="xl" size="md">
        <IconX size={14} />
      </ThemeIcon>
      <Text size="sm" fw={500}>
        Falha ao excluir &quot;{errorInfo.description}&quot;
      </Text>
    </Group>
    <Text size="sm" c="dimmed">{errorInfo.reason}</Text>
    {errorInfo.remaining.length > 0 && (
      <>
        <Text size="xs" c="dimmed" mt="xs">
          Nao processadas ({errorInfo.remaining.length}):
        </Text>
        {errorInfo.remaining.map((desc) => (
          <Text key={desc} size="xs" c="dimmed" pl="sm">* {desc}</Text>
        ))}
      </>
    )}
    <Button variant="default" onClick={() => close()} mt="xs" data-testid="btn_bulk_delete_close_error">
      Fechar
    </Button>
  </Stack>
)}
```

---

### `frontend/src/components/transactions/SelectCategoryDrawer.tsx` (new, request-response)

**Analog:** `frontend/src/components/transactions/import/CreateCategoryDrawer.tsx` — stripped-down read-only version.

**Imports to reuse** (lines 1-8):
```tsx
import { Drawer, Stack, Text } from '@mantine/core'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useCategories } from '@/hooks/useCategories'
import { CategoryCard } from '@/components/categories/CategoryCard'
import { Transactions } from '@/types/transactions'
```

**Drawer context with typed return** (line 13):
```tsx
const { opened, close, reject } = useDrawerContext<Transactions.Category | void>()
```

**Category data hook** (lines 14, 21):
```tsx
const { query } = useCategories()
const categories = query.data ?? []
```

**Drawer shell** (lines 45-46):
```tsx
<Drawer opened={opened} onClose={reject} title="Categorias" position="right" size="md" data-testid="drawer_create_category">
```

**Category list rendering** (lines 57-58, 60-63):
```tsx
{categories.length === 0 ? (
  <Text c="dimmed" size="sm">Nenhuma categoria cadastrada</Text>
) : (
  <Stack gap={4}>
    {categories.map((category) => (
      <CategoryCard key={category.id} category={category} ... />
    ))}
  </Stack>
)}
```

**Note:** The new SelectCategoryDrawer needs a simplified CategoryCard usage — the CategoryCard component has many interactive props (onDelete, onAddChild, onSaveName, onSaveEmoji). For the read-only variant, either: (a) pass no-op handlers and add an `onClick` for selection, or (b) create a simpler read-only card. Claude's discretion per CONTEXT.md.

---

### `frontend/src/components/transactions/SelectDateDrawer.tsx` (new, request-response)

**Analog:** `frontend/src/components/transactions/PropagationSettingsDrawer.tsx` — same bottom drawer + confirm button pattern.

**Imports pattern** (lines 1-3):
```tsx
import { Button, Drawer, Stack } from '@mantine/core'
import { useState } from 'react'
import { useDrawerContext } from '@/utils/renderDrawer'
```

**Additional import for DateInput:**
```tsx
import { DateInput } from '@mantine/dates'
```

**Drawer context** (line 14):
```tsx
const { opened, close, reject } = useDrawerContext<Date>()
```

**Bottom drawer structure** (lines 17-30):
```tsx
<Drawer
  opened={opened}
  onClose={reject}
  position="bottom"
  title="Excluir transacoes recorrentes"
  styles={{
    content: {
      borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0',
      height: 'auto',
      maxHeight: '80dvh',
    },
    body: { paddingBottom: 'var(--mantine-spacing-xl)' },
  }}
>
```

**Confirm button pattern** (line 49):
```tsx
<Button color="red" onClick={() => close(value)} style={{ alignSelf: 'flex-start' }} data-testid="btn_propagation_confirm">
  Confirmar exclusao
</Button>
```

**DateInput usage pattern** (from `AcceptChargeDrawer.tsx` lines 179-186):
```tsx
<DateInput
  label="Data da transferencia"
  placeholder="Selecione uma data"
  value={field.value}
  onChange={(date) => field.onChange(date)}
  error={fieldState.error?.message}
  required
/>
```

---

### `frontend/src/components/transactions/PropagationSettingsDrawer.tsx` (modify, request-response)

**Analog:** Current file — add optional `actionLabel` prop.

**Current component signature** (line 13):
```tsx
export function PropagationSettingsDrawer() {
```

**Hardcoded delete strings to parameterize** (lines 8-11):
```tsx
const options: { value: PropagationSetting; label: string; description: string }[] = [
  { value: 'current', label: 'Somente esta', description: 'Exclui apenas a transacao selecionada' },
  { value: 'current_and_future', label: 'Esta e as proximas', description: 'Exclui esta e todas as recorrencias futuras' },
  { value: 'all', label: 'Todas', description: 'Exclui todas as recorrencias da serie' },
]
```

**Hardcoded title** (line 22):
```tsx
title="Excluir transacoes recorrentes"
```

**Hardcoded body text** (lines 33-35):
```tsx
<Text size="sm" c="dimmed">
  Algumas transacoes selecionadas fazem parte de uma serie recorrente. Como deseja exclui-las?
</Text>
```

**Hardcoded confirm button** (line 49):
```tsx
<Button color="red" onClick={() => close(value)} style={{ alignSelf: 'flex-start' }} data-testid="btn_propagation_confirm">
  Confirmar exclusao
</Button>
```

---

### `frontend/src/routes/_authenticated.transactions.tsx` (modify, event-driven)

**Analog:** `handleDeleteClick` function in the same file (lines 81-107).

**handleDeleteClick pattern to replicate for category/date** (lines 81-107):
```tsx
async function handleDeleteClick() {
  try {
    let propagation: PropagationSetting | undefined
    if (hasRecurring) {
      propagation = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer />)
    }

    const txsToDelete = [...selectedIds].map((id) => {
      const tx = allTransactions.find((t) => t.id === id)
      return {
        id,
        description: tx?.description ?? String(id),
        propagationSettings: tx?.transaction_recurrence_id != null ? propagation : undefined,
      }
    })

    void renderDrawer(() => (
      <BulkDeleteProgressDrawer
        transactions={txsToDelete}
        onInvalidate={invalidateTransactions}
        onSuccess={clearSelection}
      />
    ))
  } catch {
    // User dismissed the propagation drawer without confirming
  }
}
```

**Recurring check** (lines 76-79):
```tsx
const hasRecurring = [...selectedIds].some((id) => {
  const tx = allTransactions.find((t) => t.id === id)
  return tx?.transaction_recurrence_id != null
})
```

**Key integration points available in scope:**
- `currentUserId` (line 52) — for original_user_id filtering (D-09)
- `allTransactions` (line 74) — full tx objects
- `invalidateTransactions` (line 69) — cache invalidation
- `clearSelection` (line 64) — reset selection state
- `renderDrawer` (imported line 12) — drawer orchestration
- `selectedIds` (line 55) — current selection

**SelectionActionBar usage** (lines 164-169 mobile, 249-254 desktop):
```tsx
<SelectionActionBar
  count={selectedIds.size}
  onClearSelection={clearSelection}
  onDelete={handleDeleteClick}
/>
```

**updateTransaction API** (from `api/transactions.ts` lines 94-107):
```tsx
export async function updateTransaction(id: number, payload: Transactions.UpdateTransactionPayload): Promise<void> {
  const url = new URL(`${apiUrl}/api/transactions/${id}`);
  const body = {
    ...payload,
    date: payload.date && payload.date.length === 10 ? localMidnightISO(payload.date) : payload.date,
  };
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw res;
}
```

**UpdateTransactionPayload** (from `types/transactions.ts` lines 175-187):
```tsx
export interface UpdateTransactionPayload {
  transaction_type?: TransactionType;
  account_id?: number;
  category_id?: number | null;
  amount?: number;
  date?: string;
  description?: string;
  destination_account_id?: number;
  tags?: { id?: number; name: string }[];
  recurrence_settings?: RecurrenceSettings;
  split_settings?: SplitSetting[];
  propagation_settings?: PropagationSettings;
}
```

---

## Shared Patterns

### renderDrawer (drawer orchestration)
**Source:** `frontend/src/utils/renderDrawer.tsx`
**Apply to:** All new drawers (BulkProgressDrawer, SelectCategoryDrawer, SelectDateDrawer) and all handler functions in transactions page.

```tsx
// Inside drawer component:
const { opened, close, reject } = useDrawerContext<ReturnType>()
// ...
<Drawer opened={opened} onClose={reject} ...>

// At call site:
const result = await renderDrawer<ReturnType>(() => <MyDrawer />)
// or fire-and-forget:
void renderDrawer(() => <MyDrawer />)
```

### Bottom Drawer Styles
**Source:** `PropagationSettingsDrawer.tsx` lines 23-29 and `BulkDeleteProgressDrawer.tsx` lines 106-110
**Apply to:** SelectDateDrawer, BulkProgressDrawer

```tsx
styles={{
  content: {
    borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0',
    height: 'auto',
    maxHeight: '80dvh',
  },
  body: { paddingBottom: 'var(--mantine-spacing-xl)' },
}}
```

### Error Extraction from Response
**Source:** `BulkDeleteProgressDrawer.tsx` lines 57-65
**Apply to:** BulkProgressDrawer (generalized)

```tsx
let reason = "Erro desconhecido";
if (err instanceof Response) {
  try {
    const body = await err.json();
    reason = body.message ?? reason;
  } catch {
    reason = `Erro ${err.status}`;
  }
}
```

### Selection Filtering (D-09)
**Source:** Pattern derived from `allTransactions` + `currentUserId` in transactions page
**Apply to:** handleCategoryChange and handleDateChange functions

```tsx
// Filter out linked transactions where user is not the original creator
const filteredIds = [...selectedIds].filter((id) => {
  const tx = allTransactions.find((t) => t.id === id)
  return tx?.original_user_id === currentUserId || tx?.original_user_id == null
})
```

### UI Language
**Apply to:** All new components
All UI text must be in Portuguese (pt-BR). See Copywriting Contract in UI-SPEC for exact strings.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All files have close analogs in the existing codebase |

## Metadata

**Analog search scope:** `frontend/src/components/transactions/`, `frontend/src/routes/`, `frontend/src/api/`, `frontend/src/components/charges/`
**Files scanned:** 12
**Pattern extraction date:** 2026-04-17
