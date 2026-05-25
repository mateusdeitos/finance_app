import { Card, Divider, Group, SegmentedControl, Skeleton, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useActiveFilters } from "@/hooks/useActiveFilters";
import { useGroupedTransactions } from "@/hooks/useGroupedTransactions";
import { useOpeningBalance } from "@/hooks/useOpeningBalance";
import { Transactions } from "@/types/transactions";
import { formatSignedCents } from "@/utils/formatCents";

interface Totals {
  income: number;
  expense: number;
  net: number;
}

function computeTotals(
  groups: Transactions.TransactionGroup[],
  hideSettlements: boolean,
  accountFilter: number[],
): Totals {
  const filterSet = accountFilter.length > 0 ? new Set(accountFilter) : null;
  let income = 0;
  let expense = 0;
  let net = 0;
  for (const g of groups) {
    for (const tx of g.transactions) {
      if (hideSettlements && tx.origin_settlement_id !== undefined) continue;
      const sign = tx.operation_type === "credit" ? 1 : -1;
      net += sign * tx.amount;
      if (tx.type !== "transfer") {
        if (tx.operation_type === "credit") income += tx.amount;
        else expense += tx.amount;
      }
      if (!hideSettlements) {
        for (const s of tx.settlements_from_source ?? []) {
          if (filterSet && !filterSet.has(s.account_id)) continue;
          net += (s.type === "credit" ? 1 : -1) * s.amount;
          if (s.type === "credit") income += s.amount;
          else expense += s.amount;
        }
      }
    }
  }
  return { income, expense, net };
}

interface StatProps {
  label: string;
  amount: number;
  color: string;
  hero?: boolean;
}

function Stat({ label, amount, color, hero }: StatProps) {
  return (
    <Stack gap={2} pr="lg">
      <Text
        size="xs"
        c="dimmed"
        tt="uppercase"
        fw={600}
        style={{ letterSpacing: "0.04em" }}
      >
        {label}
      </Text>
      <Text
        fw={700}
        c={color}
        size={hero ? "xl" : "md"}
        style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}
      >
        {formatSignedCents(amount)}
      </Text>
    </Stack>
  );
}

/**
 * Desktop slim summary strip — one-line consolidated layout with Receitas |
 * Despesas | Saldo (hero) on the left and a Mês/Acumulado segmented toggle
 * on the right. Replaces the separate MonthlyStats + NetSummary stack used
 * on mobile so the desktop toolbar above stays uncluttered.
 */
export function DesktopSummary() {
  const search = useSearch({ from: "/_authenticated/transactions" });
  const navigate = useNavigate({ from: "/transactions" });
  const filters = useActiveFilters();
  const { groups } = useGroupedTransactions();

  const { income, expense, net: monthNet } = useMemo(
    () => computeTotals(groups, search.hideSettlements, filters.accountIds),
    [groups, search.hideSettlements, filters.accountIds],
  );

  const { query: openingQuery } = useOpeningBalance({
    month: search.month,
    year: search.year,
    accumulated: search.accumulated,
    hideSettlements: search.hideSettlements,
  });
  const openingBalance = openingQuery.data?.balance ?? 0;
  const displayedNet = search.accumulated ? openingBalance + monthNet : monthNet;
  const isLoading = search.accumulated && openingQuery.isLoading;

  function toggleAccumulated(value: string) {
    void navigate({
      search: (prev) => ({ ...prev, accumulated: value === "accumulated" }),
    });
  }

  return (
    <Card withBorder radius="md" padding="sm">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap={0} wrap="nowrap" align="center">
          <Stat label="Receitas" amount={income} color="teal" />
          <Divider orientation="vertical" />
          <Stat label="Despesas" amount={-expense} color="red" />
          <Divider orientation="vertical" />
          {isLoading ? (
            <Stack gap={2} pl="lg">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: "0.04em" }}>
                Saldo do mês
              </Text>
              <Skeleton height={24} width={140} radius="sm" />
            </Stack>
          ) : (
            <div style={{ paddingLeft: "var(--mantine-spacing-lg)" }}>
              <Stat
                label="Saldo do mês"
                amount={displayedNet}
                color={displayedNet < 0 ? "red" : "teal"}
                hero
              />
            </div>
          )}
        </Group>
        <SegmentedControl
          value={search.accumulated ? "accumulated" : "month"}
          onChange={toggleAccumulated}
          size="xs"
          radius="xl"
          data={[
            { label: "Mês", value: "month" },
            { label: "Acumulado", value: "accumulated" },
          ]}
        />
      </Group>
    </Card>
  );
}
