import { ActionIcon, Box, Button, Group, Menu, Stack } from "@mantine/core";
import { IconDots, IconPlus, IconTableImport } from "@tabler/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMe } from "@/hooks/useMe";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useHotkey } from "@/hooks/useHotkey";
import { useActiveFilters } from "@/hooks/useActiveFilters";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useGroupedTransactions } from "@/hooks/useGroupedTransactions";
import { useTags } from "@/hooks/useTags";
import { deleteTransaction, updateTransaction } from "@/api/transactions";
import { updateSettlement } from "@/api/settlements";
import { renderDrawer } from "@/utils/renderDrawer";
import { CreateTransactionDrawer } from "@/components/transactions/CreateTransactionDrawer";
import { TransactionFab } from "@/components/transactions/TransactionFab";
import { PullToRefresh } from "@/components/PullToRefresh";
import { successHaptic } from "@/utils/haptics";
import { DesktopFiltersSidebar } from "@/components/transactions/DesktopFiltersSidebar";
import { DesktopSummary } from "@/components/transactions/DesktopSummary";
import { MobileFilterBar } from "@/components/transactions/MobileFilterBar";
import { MonthlyStats } from "@/components/transactions/MonthlyStats";
import { NetSummary } from "@/components/transactions/NetSummary";
import { PeriodNavigator } from "@/components/transactions/PeriodNavigator";
import { GroupByMenuButton } from "@/components/transactions/filters/GroupByMenuButton";
import { AdvancedFilter } from "@/components/transactions/filters/AdvancedFilter";
import { TextSearch } from "@/components/transactions/filters/TextSearch";
import { TagFilter } from "@/components/transactions/filters/TagFilter";
import { TransactionList } from "@/components/transactions/TransactionList";
import { SelectionActionBar } from "@/components/transactions/SelectionActionBar";
import { ShortcutHint } from "@/components/ShortcutHint";
import { PropagationSettingsDrawer, PropagationSetting } from "@/components/transactions/PropagationSettingsDrawer";
import { BulkProgressDrawer, BulkProgressItem } from "@/components/transactions/BulkProgressDrawer";
import { BulkDivisionDrawer } from "@/components/transactions/BulkDivisionDrawer";
import { SelectCategoryDrawer } from "@/components/transactions/SelectCategoryDrawer";
import { SelectDateDrawer } from "@/components/transactions/SelectDateDrawer";
import { Transactions } from "@/types/transactions";
import { splitPercentagesToCents } from "@/utils/splitMath";
import { TransactionsTestIds } from "@/testIds";

// A selectable row within a group. Transactions and settlements interleave
// visually, so shift+click ranges are computed over a unified, type-tagged list.
type RowRef = { type: "tx" | "settlement"; id: number };

export function TransactionsPage() {
  const search = useSearch({ from: "/_authenticated/transactions" });
  const routeNavigate = useNavigate({ from: "/transactions" });
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data ?? 0;

  // Selection state — transactions and settlements live in separate sets so
  // their numeric IDs (which can collide across spaces) don't clobber each
  // other and so action handlers can dispatch each kind to the right endpoint.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedSettlementIds, setSelectedSettlementIds] = useState<Set<number>>(new Set());
  // Anchor for shift+click range selection. A cross-type anchor can't be
  // derived from one Set's insertion order, so it's tracked explicitly.
  const [anchor, setAnchor] = useState<
    { groupKey: string; type: RowRef["type"]; id: number } | null
  >(null);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedSettlementIds(new Set());
    setAnchor(null);
  }, []);

  // Per-group ordered row list for shift+click range selection. A group
  // interleaves transactions and settlements (inline + synthetic); the range
  // must span both types, so the list is unified and tagged by type in the
  // same visual order TransactionGroup renders.
  const { data: groupRows } = useGroupedTransactions(
    useMemo(
      () => (groups) => {
        const map = new Map<string, RowRef[]>();
        for (const g of groups) {
          const list: RowRef[] = [];
          for (const tx of g.transactions) {
            if (tx.origin_settlement_id !== undefined) {
              list.push({ type: "settlement", id: tx.origin_settlement_id });
              continue;
            }
            list.push({ type: "tx", id: tx.id });
            for (const s of tx.settlements_from_source ?? []) {
              list.push({ type: "settlement", id: s.id });
            }
          }
          map.set(g.key, list);
        }
        return map;
      },
      [],
    ),
  );

  const handleSelectRow = useCallback(
    (type: RowRef["type"], id: number, shiftKey: boolean, groupKey: string) => {
      const rows = groupRows.get(groupKey);
      if (shiftKey && anchor && anchor.groupKey === groupKey && rows) {
        const anchorIdx = rows.findIndex(
          (r) => r.type === anchor.type && r.id === anchor.id,
        );
        const targetIdx = rows.findIndex((r) => r.type === type && r.id === id);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const range = rows.slice(
            Math.min(anchorIdx, targetIdx),
            Math.max(anchorIdx, targetIdx) + 1,
          );
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const r of range) if (r.type === "tx") next.add(r.id);
            return next;
          });
          setSelectedSettlementIds((prev) => {
            const next = new Set(prev);
            for (const r of range) if (r.type === "settlement") next.add(r.id);
            return next;
          });
          setAnchor({ groupKey, type, id });
          return;
        }
      }

      const setter = type === "tx" ? setSelectedIds : setSelectedSettlementIds;
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchor({ groupKey, type, id });
    },
    [anchor, groupRows],
  );

  const handleSelectTransaction = useCallback(
    (id: number, shiftKey: boolean, groupKey: string) =>
      handleSelectRow("tx", id, shiftKey, groupKey),
    [handleSelectRow],
  );

  const handleSelectSettlement = useCallback(
    (id: number, shiftKey: boolean, groupKey: string) =>
      handleSelectRow("settlement", id, shiftKey, groupKey),
    [handleSelectRow],
  );

  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];
  const connectedAccountsCount = accounts.filter((a) => a.user_connection?.connection_status === "accepted").length;
  const { query: tagsQuery } = useTags();
  const existingTags = tagsQuery.data ?? [];

  // Transactions data (needed to find full transaction objects for selected IDs)
  // Uses same params as TransactionList so they share the same query cache entry
  const filters = useActiveFilters();
  const { query: txQuery, invalidate: invalidateTransactions } = useTransactions({
    month: search.month,
    year: search.year,
    ...filters,
  });
  const allTransactions = txQuery.data ?? [];

  const hasRecurring = [...selectedIds].some((id) => {
    const tx = allTransactions.find((t) => t.id === id);
    return tx?.transaction_recurrence_id != null;
  });

  // Filter out linked transactions where user is not the original creator (SEL-02 silent skip)
  function getEligibleIds(): number[] {
    return [...selectedIds].filter((id) => {
      const tx = allTransactions.find((t) => t.id === id);
      return tx?.original_user_id == null || tx?.original_user_id === currentUserId;
    });
  }

  // Division-specific eligibility: also excludes transfers (D-10).
  // Transfers cannot carry split_settings (buildUpdatePayload sets it to undefined for transfers).
  function getDivisionEligibleIds(): number[] {
    return getEligibleIds().filter((id) => {
      const tx = allTransactions.find((t) => t.id === id);
      return tx?.type !== "transfer";
    });
  }

  // A linked (secondary) transaction is the credit side of a transfer or a
  // partner's side of a shared expense/income. The backend rejects edits to
  // structural fields (account, type, destination, split, recurrence) on these.
  function isLinkedTransaction(tx: Transactions.Transaction): boolean {
    if (tx.original_user_id != null && tx.original_user_id !== currentUserId) return true;
    return tx.type === "transfer" && tx.operation_type === "credit";
  }

  function buildUpdatePayload(
    tx: Transactions.Transaction,
    overrides: Partial<Transactions.UpdateTransactionPayload>,
  ): Transactions.UpdateTransactionPayload {
    const isTransfer = tx.type === "transfer";

    const resolvedTags = (tx.tags ?? []).map((t) => {
      const existing = existingTags.find((et) => et.name === t.name);
      return existing ? { id: existing.id, name: t.name } : { name: t.name };
    });
    const tags = resolvedTags.length > 0 ? resolvedTags : undefined;

    // Bulk updates only change an allowed field (date/category). For a linked
    // transaction, echoing the structural fields would be rejected by the
    // backend (issue #145), so send only the override plus the tags — which an
    // update would otherwise clear. Structural fields are still echoed for main
    // transactions, where the backend needs them to rebuild transfers/splits.
    if (isLinkedTransaction(tx)) {
      return { tags, ...overrides };
    }

    const destinationAccountId = isTransfer ? tx.linked_transactions?.[0]?.account_id : undefined;

    const splitSettings = isTransfer
      ? undefined
      : (tx.linked_transactions ?? [])
          .filter((lt) => lt.user_id !== tx.user_id)
          .flatMap((lt) => {
            const acc = accounts.find(
              (a) =>
                a.user_connection?.from_account_id === lt.account_id ||
                a.user_connection?.to_account_id === lt.account_id,
            );
            if (!acc?.user_connection) return [];
            return [{ connection_id: acc.user_connection.id, amount: lt.amount }];
          });

    return {
      transaction_type: tx.type,
      account_id: tx.account_id,
      category_id: isTransfer ? undefined : (tx.category_id ?? undefined),
      amount: tx.amount,
      date: tx.date,
      description: tx.description,
      destination_account_id: destinationAccountId,
      tags,
      split_settings: splitSettings && splitSettings.length > 0 ? splitSettings : undefined,
      recurrence_settings: tx.transaction_recurrence
        ? {
            type: tx.transaction_recurrence.type,
            current_installment: tx.installment_number ?? 1,
            total_installments: tx.transaction_recurrence.installments,
          }
        : undefined,
      ...overrides,
    };
  }

  async function handleDeleteClick() {
    try {
      let propagation: PropagationSetting | undefined;
      if (hasRecurring) {
        propagation = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer />);
      }

      const eligibleIds = getEligibleIds();
      const items: BulkProgressItem[] = eligibleIds.map((id) => {
        const tx = allTransactions.find((t) => t.id === id);
        return { id, label: tx?.description ?? String(id) };
      });
      if (items.length === 0) return;

      void renderDrawer(() => (
        <BulkProgressDrawer
          items={items}
          action={async (item) => {
            const tx = allTransactions.find((t) => t.id === item.id);
            const prop = tx?.transaction_recurrence_id != null && propagation ? propagation : undefined;
            await deleteTransaction(item.id, prop);
          }}
          titles={{
            processing: "Excluindo transações...",
            success: "Transações excluídas",
            error: "Erro ao excluir",
          }}
          successMessage={(n) =>
            n === 1 ? "1 transação excluída com sucesso" : `${n} transações excluídas com sucesso`
          }
          onInvalidate={invalidateTransactions}
          onSuccess={clearSelection}
          testIdPrefix={TransactionsTestIds.BulkDeleteDrawer}
        />
      ));
    } catch {
      // User dismissed the propagation drawer without confirming
    }
  }

  async function handleCategoryChange() {
    try {
      const category = await renderDrawer<Transactions.Category>(() => <SelectCategoryDrawer />);

      let propagation: PropagationSetting | undefined;
      if (hasRecurring) {
        propagation = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer actionLabel="alterar" />);
      }

      const eligibleIds = getEligibleIds();
      const items: BulkProgressItem[] = eligibleIds.map((id) => {
        const tx = allTransactions.find((t) => t.id === id);
        return { id, label: tx?.description ?? String(id) };
      });
      if (items.length === 0) return;

      void renderDrawer(() => (
        <BulkProgressDrawer
          items={items}
          action={async (item) => {
            const tx = allTransactions.find((t) => t.id === item.id);
            if (!tx) return;
            const payload = buildUpdatePayload(tx, { category_id: category.id });
            if (tx.transaction_recurrence_id != null && propagation) {
              payload.propagation_settings = propagation;
            }
            await updateTransaction(item.id, payload);
          }}
          titles={{
            processing: "Alterando categoria...",
            success: "Transações atualizadas",
            error: "Erro ao atualizar",
          }}
          successMessage={(n) =>
            n === 1 ? "1 transação atualizada com sucesso" : `${n} transações atualizadas com sucesso`
          }
          onInvalidate={invalidateTransactions}
          onSuccess={clearSelection}
          testIdPrefix={TransactionsTestIds.BulkCategoryDrawer}
        />
      ));
    } catch {
      // User dismissed a drawer (category selection or propagation) without confirming
    }
  }

  async function handleDateChange() {
    try {
      const dateStr = await renderDrawer<string>(() => <SelectDateDrawer />);

      let propagation: PropagationSetting | undefined;
      if (hasRecurring) {
        propagation = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer actionLabel="alterar" />);
      }

      // Build a unified item list: tx items first, then settlement items.
      // Settlement IDs are tagged with a stable prefix in the BulkProgressItem
      // label-key so the action callback can dispatch each kind to the right
      // endpoint while reusing the existing progress drawer.
      const eligibleTxIds = getEligibleIds();
      const txItems: BulkProgressItem[] = eligibleTxIds.map((id) => {
        const tx = allTransactions.find((t) => t.id === id);
        return { id, label: tx?.description ?? String(id) };
      });

      const settlementIds = [...selectedSettlementIds];
      const settlementIdSet = new Set(settlementIds);
      const settlementItems: BulkProgressItem[] = settlementIds.map((id) => {
        // BulkProgressItem.id must be unique across the list; settlement IDs
        // can collide with transaction IDs since they live in different tables.
        // Negate to keep them distinct without inventing a new shape.
        return { id: -id, label: "Acerto" };
      });

      const items = [...txItems, ...settlementItems];
      if (items.length === 0) return;

      void renderDrawer(() => (
        <BulkProgressDrawer
          items={items}
          action={async (item) => {
            if (item.id < 0) {
              const settlementId = -item.id;
              if (!settlementIdSet.has(settlementId)) return;
              await updateSettlement(settlementId, { date: dateStr });
              return;
            }
            const tx = allTransactions.find((t) => t.id === item.id);
            if (!tx) return;
            const payload = buildUpdatePayload(tx, { date: dateStr });
            if (tx.transaction_recurrence_id != null && propagation) {
              payload.propagation_settings = propagation;
            }
            await updateTransaction(item.id, payload);
          }}
          titles={{
            processing: "Alterando data...",
            success: "Itens atualizados",
            error: "Erro ao atualizar",
          }}
          successMessage={(n) =>
            n === 1 ? "1 item atualizado com sucesso" : `${n} itens atualizados com sucesso`
          }
          onInvalidate={invalidateTransactions}
          onSuccess={clearSelection}
          testIdPrefix={TransactionsTestIds.BulkDateDrawer}
        />
      ));
    } catch {
      // User dismissed a drawer (date selection or propagation) without confirming
    }
  }

  async function handleDivisionClick() {
    try {
      // Step 1: User picks the split configuration (percentages).
      const rawSplits = await renderDrawer<Transactions.SplitSetting[]>(() => <BulkDivisionDrawer />);

      // Step 2: If any selected tx has a recurrence, ask how to propagate.
      let propagation: PropagationSetting | undefined;
      if (hasRecurring) {
        propagation = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer actionLabel="alterar" />);
      }

      // Step 3: Build eligibility (silently skip linked non-owned + transfers).
      const eligibleIds = getDivisionEligibleIds();
      const items: BulkProgressItem[] = eligibleIds.map((id) => {
        const tx = allTransactions.find((t) => t.id === id);
        return { id, label: tx?.description ?? String(id) };
      });

      if (items.length === 0) return;

      // Step 4: Sequential per-tx PUT via the existing progress drawer.
      void renderDrawer(() => (
        <BulkProgressDrawer
          items={items}
          action={async (item) => {
            const tx = allTransactions.find((t) => t.id === item.id);
            if (!tx) return;
            // Convert percentages -> cents per-tx (PAY-01); last split absorbs remainder.
            // splitPercentagesToCents strips `percentage` from the output (PAY-02).
            const perTxSplits = splitPercentagesToCents(tx.amount, rawSplits);
            const payload = buildUpdatePayload(tx, { split_settings: perTxSplits });
            if (tx.transaction_recurrence_id != null && propagation) {
              payload.propagation_settings = propagation;
            }
            await updateTransaction(item.id, payload);
          }}
          titles={{
            processing: "Alterando divisão...",
            success: "Transações atualizadas",
            error: "Erro ao atualizar",
          }}
          successMessage={(n) =>
            n === 1 ? "1 transação atualizada com sucesso" : `${n} transações atualizadas com sucesso`
          }
          onInvalidate={invalidateTransactions}
          onSuccess={clearSelection}
          testIdPrefix={TransactionsTestIds.BulkDivisionProgressDrawer}
        />
      ));
    } catch {
      // User dismissed a drawer (division selection or propagation) — silent exit.
    }
  }

  const isSelecting = selectedIds.size > 0 || selectedSettlementIds.size > 0;
  const totalSelected = selectedIds.size + selectedSettlementIds.size;

  const openCreateTransaction = useCallback(() => {
    void renderDrawer(() => <CreateTransactionDrawer />);
  }, []);
  useHotkey("n", openCreateTransaction, { enabled: !isSelecting });

  async function handleSwipeDelete(tx: Transactions.Transaction) {
    try {
      let propagation: PropagationSetting | undefined;
      if (tx.transaction_recurrence_id != null) {
        propagation = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer />);
      }
      await deleteTransaction(tx.id, propagation);
      await invalidateTransactions();
      successHaptic();
    } catch {
      // User dismissed the propagation drawer without confirming.
    }
  }

  if (isMobile) {
    return (
      <PullToRefresh onRefresh={invalidateTransactions} enabled={!isSelecting}>
      <Stack gap="sm">
        <Box
          style={{
            position: "sticky",
            top: "calc(-1 * var(--mantine-spacing-md))",
            zIndex: 10,
            background: "var(--mantine-color-body)",
            marginTop: "calc(-1 * var(--mantine-spacing-md))",
            paddingTop: "var(--mantine-spacing-md)",
            paddingBottom: "var(--mantine-spacing-xs)",
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
              <PeriodNavigator
                month={search.month}
                year={search.year}
                onPeriodChange={(m, y) => routeNavigate({ search: { ...search, month: m, year: y } })}
              />
              <MonthlyStats />
            </Group>
            <NetSummary />
            {isSelecting ? (
              <SelectionActionBar
                variant="inline"
                count={totalSelected}
                onClearSelection={clearSelection}
                onCategoryChange={handleCategoryChange}
                onDateChange={handleDateChange}
                onDivisaoChange={handleDivisionClick}
                connectedAccountsCount={connectedAccountsCount}
                onDelete={handleDeleteClick}
              />
            ) : (
              <MobileFilterBar />
            )}
          </Stack>
        </Box>

        <TransactionList
          currentUserId={currentUserId}
          selectedIds={selectedIds}
          selectedSettlementIds={selectedSettlementIds}
          onSelectTransaction={handleSelectTransaction}
          onSelectSettlement={handleSelectSettlement}
          onDeleteTransaction={handleSwipeDelete}
        />

        {!isSelecting && <TransactionFab />}
      </Stack>
      </PullToRefresh>
    );
  }

  return (
    <Box
      // 2-column desktop shell built with flexbox (sidebar + main). The sidebar
      // lives inside the page (not the AppShell aside) so it stays scoped to
      // /transactions, and the main column carries the toolbar + summary +
      // condensed filter chip row + list as before.
      style={{ display: "flex", alignItems: "stretch", gap: "var(--mantine-spacing-md)" }}
    >
      <DesktopFiltersSidebar />
      <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
        <Box
          style={{
            position: "sticky",
            top: "calc(-1 * var(--mantine-spacing-md))",
            zIndex: 10,
            background: "var(--mantine-color-body)",
            marginTop: "calc(-1 * var(--mantine-spacing-md))",
            paddingTop: "var(--mantine-spacing-md)",
            paddingBottom: "var(--mantine-spacing-xs)",
          }}
        >
          <Stack gap="sm" style={{ visibility: isSelecting ? "hidden" : undefined }}>
            <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
              <PeriodNavigator
                month={search.month}
                year={search.year}
                onPeriodChange={(m, y) => routeNavigate({ search: { ...search, month: m, year: y } })}
              />
              <Box style={{ flex: 1, maxWidth: 360 }}>
                <TextSearch />
              </Box>
              <Group gap="xs" wrap="nowrap">
                <TagFilter />
                <AdvancedFilter />
                <GroupByMenuButton />
                <Box style={{ width: 1, height: 18, background: "var(--mantine-color-default-border)", margin: "0 4px" }} />
                <Button
                  leftSection={<IconPlus size={16} />}
                  rightSection={<ShortcutHint keys={["N"]} />}
                  onClick={openCreateTransaction}
                  data-testid={TransactionsTestIds.BtnNew}
                >
                  Nova Transação
                </Button>
                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <ActionIcon
                      variant="default"
                      aria-label="Mais opções"
                      data-testid={TransactionsTestIds.BtnMoreOptions}
                    >
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconTableImport size={14} />}
                      onClick={() => void navigate({ to: "/transactions/import" })}
                      data-testid={TransactionsTestIds.MenuItemImportTransactions}
                    >
                      Importar transações
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
            <DesktopSummary />
          </Stack>
        </Box>

        <TransactionList
          currentUserId={currentUserId}
          selectedIds={selectedIds}
          selectedSettlementIds={selectedSettlementIds}
          onSelectTransaction={handleSelectTransaction}
          onSelectSettlement={handleSelectSettlement}
        />
      </Stack>

      {isSelecting && (
        <SelectionActionBar
          count={totalSelected}
          onClearSelection={clearSelection}
          onCategoryChange={handleCategoryChange}
          onDateChange={handleDateChange}
          onDivisaoChange={handleDivisionClick}
          connectedAccountsCount={connectedAccountsCount}
          onDelete={handleDeleteClick}
        />
      )}
    </Box>
  );
}
