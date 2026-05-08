import { Stack, Text } from "@mantine/core";
import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveFilters } from "@/hooks/useActiveFilters";
import { useGroupedTransactions } from "@/hooks/useGroupedTransactions";
import { useOpeningBalance } from "@/hooks/useOpeningBalance";
import { Transactions } from "@/types/transactions";
import { TransactionGroup } from "./TransactionGroup";
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
    const txAmount = tx.operation_type === "credit" ? tx.amount : -tx.amount;
    const settlementsAmount = hideSettlements
      ? 0
      : (tx.settlements_from_source ?? []).reduce((s, settlement) => {
          // Include settlement if: no account filter, OR source tx account matches, OR settlement account matches
          if (filterSet && !filterSet.has(tx.account_id) && !filterSet.has(settlement.account_id)) {
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

  const { query: balanceQuery } = useOpeningBalance({
    month: search.month,
    year: search.year,
    accumulated: search.accumulated,
    hideSettlements: search.hideSettlements,
  });

  const openingBalance = balanceQuery.data?.balance ?? 0;

  const groupTotals = useMemo(
    () => groups.map((g) => groupNetTotal(g, search.hideSettlements, filters.accountIds)),
    [groups, search.hideSettlements, filters.accountIds],
  );

  const runningBalances = useMemo(() => {
    return groupTotals.reduce<number[]>((acc, total) => {
      const prev = acc.length > 0 ? acc[acc.length - 1] : openingBalance;
      return [...acc, prev + total];
    }, []);
  }, [groupTotals, openingBalance]);

  if (isLoading) {
    return <TransactionListSkeleton />;
  }

  if (groups.length === 0) {
    return (
      <Text ta="center" c="dimmed" py="xl">
        Nenhuma transação encontrada
      </Text>
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
          runningBalance={runningBalances[i]}
          isFirst={i === 0}
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
