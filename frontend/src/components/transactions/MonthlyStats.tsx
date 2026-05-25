import { Divider, Group, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { useActiveFilters } from "@/hooks/useActiveFilters";
import { useGroupedTransactions } from "@/hooks/useGroupedTransactions";
import { Transactions } from "@/types/transactions";
import { formatSignedCents } from "@/utils/formatCents";

interface MonthlyTotals {
  income: number;
  expense: number;
}

function computeMonthlyTotals(
  groups: Transactions.TransactionGroup[],
  hideSettlements: boolean,
  accountFilter: number[],
): MonthlyTotals {
  const filterSet = accountFilter.length > 0 ? new Set(accountFilter) : null;
  let income = 0;
  let expense = 0;

  for (const g of groups) {
    for (const tx of g.transactions) {
      if (hideSettlements && tx.origin_settlement_id !== undefined) continue;

      // Transfers are flow-neutral for the period (they move money between
      // accounts the user owns); excluding them keeps "entrou/saiu" telling
      // the story of inflow vs outflow rather than counting movements twice.
      if (tx.type !== "transfer") {
        if (tx.operation_type === "credit") income += tx.amount;
        else expense += tx.amount;
      }

      if (!hideSettlements) {
        for (const s of tx.settlements_from_source ?? []) {
          if (filterSet && !filterSet.has(s.account_id)) continue;
          if (s.type === "credit") income += s.amount;
          else expense += s.amount;
        }
      }
    }
  }

  return { income, expense };
}

/**
 * Renders the "entrou / saiu" pair shown next to the period navigator.
 * Reads directly from the listing's grouped transactions so it shares the
 * same query cache and stays in sync with what the list shows.
 */
export function MonthlyStats() {
  const search = useSearch({ from: "/_authenticated/transactions" });
  const filters = useActiveFilters();
  const { groups } = useGroupedTransactions();

  const { income, expense } = useMemo(
    () => computeMonthlyTotals(groups, search.hideSettlements, filters.accountIds),
    [groups, search.hideSettlements, filters.accountIds],
  );

  return (
    <Group gap="xs" wrap="nowrap" style={{ fontVariantNumeric: "tabular-nums", minWidth: 0 }}>
      <Stack gap={0} align="flex-end" style={{ minWidth: 0 }}>
        <Text c="dimmed" tt="uppercase" fw={600} style={{ fontSize: "0.5625rem", letterSpacing: "0.04em", lineHeight: 1.1 }}>
          entrou
        </Text>
        <Text fw={600} c="teal" style={{ fontSize: "0.75rem", lineHeight: 1.2 }}>
          {formatSignedCents(income)}
        </Text>
      </Stack>
      <Divider orientation="vertical" />
      <Stack gap={0} align="flex-end" style={{ minWidth: 0 }}>
        <Text c="dimmed" tt="uppercase" fw={600} style={{ fontSize: "0.5625rem", letterSpacing: "0.04em", lineHeight: 1.1 }}>
          saiu
        </Text>
        <Text fw={600} c="red" style={{ fontSize: "0.75rem", lineHeight: 1.2 }}>
          {formatSignedCents(-expense)}
        </Text>
      </Stack>
    </Group>
  );
}
