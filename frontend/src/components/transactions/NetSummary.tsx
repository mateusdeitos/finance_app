import { Box, Card, Group, SegmentedControl, Skeleton, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useActiveFilters } from "@/hooks/useActiveFilters";
import { useGroupedTransactions } from "@/hooks/useGroupedTransactions";
import { useOpeningBalance } from "@/hooks/useOpeningBalance";
import { Transactions } from "@/types/transactions";
import { formatSignedCents } from "@/utils/formatCents";
import { TransactionsTestIds } from "@/testIds";

function computeMonthNet(
  groups: Transactions.TransactionGroup[],
  hideSettlements: boolean,
  accountFilter: number[],
): number {
  const filterSet = accountFilter.length > 0 ? new Set(accountFilter) : null;
  let net = 0;
  for (const g of groups) {
    for (const tx of g.transactions) {
      if (hideSettlements && tx.origin_settlement_id !== undefined) continue;
      const sign = tx.operation_type === "credit" ? 1 : -1;
      net += sign * tx.amount;
      if (!hideSettlements) {
        for (const s of tx.settlements_from_source ?? []) {
          if (filterSet && !filterSet.has(s.account_id)) continue;
          net += (s.type === "credit" ? 1 : -1) * s.amount;
        }
      }
    }
  }
  return net;
}

/**
 * Top NetLine card. Shows the period's net result and lets the user toggle
 * between "Mês" (just this month's net) and "Acumulado" (previous balance +
 * this month's net) without reaching for a switch inside the list.
 */
export function NetSummary() {
  const search = useSearch({ from: "/_authenticated/transactions" });
  const navigate = useNavigate({ from: "/transactions" });
  const filters = useActiveFilters();
  const { groups } = useGroupedTransactions();

  const monthNet = useMemo(
    () => computeMonthNet(groups, search.hideSettlements, filters.accountIds),
    [groups, search.hideSettlements, filters.accountIds],
  );

  // Opening balance is only fetched when the user is in accumulated mode —
  // useOpeningBalance gates `enabled` on `accumulated`. In Mês mode this
  // query is idle, so no extra network traffic.
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
    <Card withBorder radius="md" padding="xs">
      <Stack gap={4}>
        {/* Top row: the "Inicial" caption (accumulated only) shares the line
            with the Mês/Acumulado toggle, keeping the big Saldo figure below
            free to use the full card width — otherwise the extra "Inicial"
            column pushes the row past the mobile viewport and the card scrolls
            horizontally. */}
        <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
          {search.accumulated ? (
            <Group gap={6} wrap="nowrap" align="baseline" style={{ minWidth: 0 }}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: "0.04em" }}>
                Inicial
              </Text>
              {isLoading ? (
                <Skeleton height={14} width={70} radius="sm" />
              ) : (
                <Text
                  fw={600}
                  size="xs"
                  c="dimmed"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                  data-testid={TransactionsTestIds.StatOpeningBalance}
                >
                  {formatSignedCents(openingBalance)}
                </Text>
              )}
            </Group>
          ) : (
            <Box />
          )}
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
        <Group gap="sm" wrap="nowrap" align="baseline" style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: "0.04em" }}>
            {search.accumulated ? "Saldo acumulado" : "Saldo"}
          </Text>
          {isLoading ? (
            <Skeleton height={22} width={120} radius="sm" />
          ) : (
            <Text
              fw={700}
              size="lg"
              c={displayedNet < 0 ? "red" : "teal"}
              style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}
            >
              {formatSignedCents(displayedNet)}
            </Text>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
