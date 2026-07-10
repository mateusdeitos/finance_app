import { ActionIcon, Box, Button, Group, Menu, Stack } from "@mantine/core";
import { IconDots, IconLayoutGrid, IconPlus, IconTableImport } from "@tabler/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMe } from "@/hooks/useMe";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useHotkey } from "@/hooks/useHotkey";
import { useCreateTransactionShortcut } from "@/hooks/useCreateTransactionShortcut";
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
import { ClearFiltersButton } from "@/components/transactions/ClearFiltersButton";
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
import { TemplatesManagementDrawer } from "@/components/transactions/templates/TemplatesManagementDrawer";
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

  // Filter out linked transactions where user is not the original creator (SEL-02 silent skip).
  // Used for actions that the partner (to_user) is NOT allowed to perform on their own
  // linked side: bulk delete (the backend cascades a partner delete onto the author's
  // source) and bulk division (split_settings is a disallowed field for linked txs).
  function getEligibleIds(): number[] {
    return [...selectedIds].filter((id) => {
      const tx = allTransactions.find((t) => t.id === id);
      return tx?.original_user_id == null || tx?.original_user_id === currentUserId;
    });
  }

  // Eligibility for bulk edits of fields the partner (to_user) is allowed to change on
  // their own linked side — date and category (issue #205 parity with single-row edit).
  // Unlike getEligibleIds, this includes the partner's linked transactions: their
  // original_user_id points at the author, but the partner OWNS the row
  // (user_id === currentUserId) and the backend permits amount/date/description/tags/
  // category edits on it. buildUpdatePayload sends only { tags, ...overrides } for linked
  // txs, so no disallowed structural field leaks onto the wire.
  function getFieldEditEligibleIds(): number[] {
    return [...selectedIds].filter((id) => {
      const tx = allTransactions.find((t) => t.id === id);
      if (!tx) return false;
      return (
        tx.user_id === currentUserId ||
        tx.original_user_id == null ||
        tx.original_user_id === currentUserId
      );
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

      const eligibleIds = getFieldEditEligibleIds();
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
      const eligibleTxIds = getFieldEditEligibleIds();
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

  // Indexes by id — built once per transactions payload so the selection
  // total below (and any other id-lookup downstream) stays O(1) per id
  // instead of scanning allTransactions for every selected row.
  const txById = useMemo(() => {
    const m = new Map<number, Transactions.Transaction>();
    for (const tx of allTransactions) m.set(tx.id, tx);
    return m;
  }, [allTransactions]);

  const settlementById = useMemo(() => {
    const m = new Map<number, Transactions.Settlement>();
    for (const tx of allTransactions) {
      // Inline settlements riding along with their source transaction.
      for (const s of tx.settlements_from_source ?? []) m.set(s.id, s);
      // Orphan/synthetic settlement rows arrive as standalone transactions
      // carrying origin_settlement_id; their amount/type live on the tx
      // itself, so map them too — otherwise selecting one wouldn't count
      // toward selectedTotalCents.
      if (tx.origin_settlement_id !== undefined) {
        m.set(tx.origin_settlement_id, {
          id: tx.origin_settlement_id,
          user_id: tx.user_id,
          amount: tx.amount,
          type: tx.operation_type === "credit" ? "credit" : "debit",
          account_id: tx.account_id,
          source_transaction_id: tx.source_transaction_id ?? 0,
          parent_transaction_id: 0,
          date: tx.date,
          created_at: tx.created_at,
        });
      }
    }
    return m;
  }, [allTransactions]);

  // Signed total (in cents) of every selected transaction + settlement.
  // Used by SelectionActionBar to show "saldo das transações selecionadas"
  // — credit moves the total up, debit moves it down. Transfers count too
  // so users see what they've actually picked, even if those net to zero.
  const selectedTotalCents = useMemo(() => {
    let total = 0;
    for (const id of selectedIds) {
      const tx = txById.get(id);
      if (!tx) continue;
      total += (tx.operation_type === "credit" ? 1 : -1) * tx.amount;
    }
    for (const sid of selectedSettlementIds) {
      const s = settlementById.get(sid);
      if (!s) continue;
      total += (s.type === "credit" ? 1 : -1) * s.amount;
    }
    return total;
  }, [selectedIds, selectedSettlementIds, txById, settlementById]);

  const openCreateTransaction = useCallback(() => {
    void renderDrawer(() => <CreateTransactionDrawer />);
  }, []);
  useHotkey("n", openCreateTransaction, { enabled: !isSelecting });

  // Open the create drawer from a PWA app-shortcut deep link (?new=<type>).
  useCreateTransactionShortcut();

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
                disabled={isSelecting}
              />
              <MonthlyStats />
            </Group>
            <NetSummary />
            {isSelecting ? (
              <SelectionActionBar
                variant="inline"
                count={totalSelected}
                totalCents={selectedTotalCents}
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
      // 2-column desktop shell built with flexbox (sidebar + main). Each
      // column owns its own vertical scroll: the sidebar scrolls internally
      // only if contas+categorias don't fit in the viewport, and the right
      // column scrolls only if the transaction list is taller than the
      // viewport. Negative margins on all four sides bleed past AppShell.Main's
      // `padding="md"` so the sidebar's vertical divider extends to the
      // actual edges of the main area; the right column re-adds its own
      // padding internally so the sticky toolbar still sits where it did.
      style={{
        display: "flex",
        alignItems: "stretch",
        height: "calc(100% + 2 * var(--mantine-spacing-md))",
        minHeight: 0,
        overflow: "hidden",
        margin: "calc(-1 * var(--mantine-spacing-md))",
      }}
    >
      <Box
        inert={isSelecting || undefined}
        style={{
          display: "flex",
          alignSelf: "stretch",
          opacity: isSelecting ? 0.5 : 1,
          transition: "opacity 150ms ease",
        }}
      >
        <DesktopFiltersSidebar />
      </Box>
      <Stack
        gap="md"
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          overflowY: "auto",
          paddingLeft: "var(--mantine-spacing-md)",
          paddingRight: "var(--mantine-spacing-md)",
          paddingBottom: "var(--mantine-spacing-md)",
          // No padding-top: overflow:auto clips at the padding-box edge, so
          // any padding-top here would let scrolled rows bleed above the
          // sticky toolbar. The toolbar carries its own padding-top instead
          // and its body-coloured background covers the edge.
        }}
      >
        <Box
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "var(--mantine-color-body)",
            paddingTop: "var(--mantine-spacing-md)",
            paddingBottom: "var(--mantine-spacing-xs)",
          }}
        >
          <Stack gap="sm">
            <Box
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
                alignItems: "center",
                gap: "var(--mantine-spacing-xs)",
              }}
            >
              <PeriodNavigator
                month={search.month}
                year={search.year}
                onPeriodChange={(m, y) => routeNavigate({ search: { ...search, month: m, year: y } })}
                disabled={isSelecting}
              />
              <Group
                gap="xs"
                wrap="wrap"
                align="center"
                style={{
                  minWidth: 0,
                  opacity: isSelecting ? 0.5 : 1,
                  transition: "opacity 150ms ease",
                }}
                inert={isSelecting || undefined}
              >
                <Box style={{ flex: "1 1 200px", minWidth: 140, maxWidth: 280 }}>
                  <TextSearch />
                </Box>
                <TagFilter />
                <AdvancedFilter />
                <GroupByMenuButton />
                <ClearFiltersButton />
              </Group>
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
                  <Menu.Item
                    leftSection={<IconLayoutGrid size={14} />}
                    onClick={() => void renderDrawer(() => <TemplatesManagementDrawer />)}
                    data-testid={TransactionsTestIds.MenuItemManageTemplates}
                  >
                    Gerenciar modelos
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Box>
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
        {isSelecting && (
          <Box
            aria-hidden
            style={{
              height: "calc(4.5rem + env(safe-area-inset-bottom))",
              flexShrink: 0,
            }}
          />
        )}
      </Stack>

      {isSelecting && (
        <SelectionActionBar
          count={totalSelected}
          totalCents={selectedTotalCents}
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
