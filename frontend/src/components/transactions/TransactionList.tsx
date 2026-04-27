import { Skeleton, Stack, Text } from "@mantine/core";
import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveFilters } from "@/hooks/useActiveFilters";
import { useGroupedTransactions } from "@/hooks/useGroupedTransactions";
import { useOpeningBalance } from "@/hooks/useOpeningBalance";
import { Transactions } from "@/types/transactions";
import { TransactionGroup } from "./TransactionGroup";

interface TransactionListProps {
  currentUserId: number;
  selectedIds?: Set<number>;
  onSelectTransaction?: (id: number, shiftKey: boolean, groupKey: string) => void;
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

export function TransactionList({ currentUserId, selectedIds, onSelectTransaction }: TransactionListProps) {
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
    return (
      <Stack gap="sm">
        {Array.from({ length: 3 }).map((_, i) => (
          <Stack key={i} gap={4}>
            <Skeleton height={28} radius="sm" />
            <Skeleton height={48} radius="sm" />
            <Skeleton height={48} radius="sm" />
            <Skeleton height={48} radius="sm" />
          </Stack>
        ))}
      </Stack>
    );
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
          onSelectTransaction={onSelectTransaction && ((id, shiftKey) => onSelectTransaction(id, shiftKey, group.key))}
          hideSettlements={search.hideSettlements}
        />
      ))}
    </Stack>
  );
}
