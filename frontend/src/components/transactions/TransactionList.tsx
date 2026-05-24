import { Stack, Text } from "@mantine/core";
import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveFilters } from "@/hooks/useActiveFilters";
import { useGroupedTransactions } from "@/hooks/useGroupedTransactions";
import { Transactions } from "@/types/transactions";
import { OpeningBalanceRow } from "./OpeningBalanceRow";
import { TransactionGroup } from "./TransactionGroup";
import classes from "./TransactionGroup.module.css";
import { TransactionListSkeleton } from "./TransactionListSkeleton";

interface TransactionListProps {
  currentUserId: number;
  selectedIds?: Set<number>;
  selectedSettlementIds?: Set<number>;
  onSelectTransaction?: (id: number, shiftKey: boolean, groupKey: string) => void;
  onSelectSettlement?: (settlementId: number, shiftKey: boolean, groupKey: string) => void;
  onDeleteTransaction?: (tx: Transactions.Transaction) => void;
}

function groupNetTotal(
  group: Transactions.TransactionGroup,
  hideSettlements: boolean,
  accountFilter: number[],
): number {
  const hasAccountFilter = accountFilter.length > 0;
  const filterSet = hasAccountFilter ? new Set(accountFilter) : null;

  return group.transactions.reduce((sum, tx) => {
    if (hideSettlements && tx.origin_settlement_id !== undefined) {
      return sum;
    }
    const txAmount = tx.operation_type === "credit" ? tx.amount : -tx.amount;
    const settlementsAmount = hideSettlements
      ? 0
      : (tx.settlements_from_source ?? []).reduce((s, settlement) => {
          // A settlement counts only toward its own (connection) account, never
          // the source transaction's private account — keeps the displayed total
          // consistent with GetBalance and lets the private account reconcile.
          if (filterSet && !filterSet.has(settlement.account_id)) {
            return s;
          }
          return s + (settlement.type === "credit" ? settlement.amount : -settlement.amount);
        }, 0);
    return sum + txAmount + settlementsAmount;
  }, 0);
}

export function TransactionList({
  currentUserId,
  selectedIds,
  selectedSettlementIds,
  onSelectTransaction,
  onSelectSettlement,
  onDeleteTransaction,
}: TransactionListProps) {
  const search = useSearch({ from: "/_authenticated/transactions" });
  const filters = useActiveFilters();

  const { groups, accounts, categories, isLoading } = useGroupedTransactions();

  const groupTotals = useMemo(
    () => groups.map((g) => groupNetTotal(g, search.hideSettlements, filters.accountIds)),
    [groups, search.hideSettlements, filters.accountIds],
  );

  if (isLoading) {
    return <TransactionListSkeleton />;
  }

  if (groups.length === 0) {
    return (
      <Stack gap="sm">
        <div className={classes.rows}>
          <OpeningBalanceRow />
        </div>
        <Text ta="center" c="dimmed" py="xl">
          Nenhuma transação encontrada
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      {groups.map((group, i) => (
        <TransactionGroup
          key={group.key}
          group={group}
          groupBy={search.groupBy}
          accounts={accounts}
          categories={categories}
          currentUserId={currentUserId}
          groupTotal={groupTotals[i]}
          isFirst={i === 0}
          accountFilter={filters.accountIds}
          selectedIds={selectedIds}
          selectedSettlementIds={selectedSettlementIds}
          onSelectTransaction={onSelectTransaction && ((id, shiftKey) => onSelectTransaction(id, shiftKey, group.key))}
          onSelectSettlement={onSelectSettlement && ((id, shiftKey) => onSelectSettlement(id, shiftKey, group.key))}
          onDeleteTransaction={onDeleteTransaction}
          hideSettlements={search.hideSettlements}
        />
      ))}
    </Stack>
  );
}
