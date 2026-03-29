import { Box, Group, Text } from "@mantine/core";
import { Fragment } from "react";
import { Transactions } from "@/types/transactions";
import { formatBalance, formatSignedCents } from "@/utils/formatCents";
import { renderDrawer } from "@/utils/renderDrawer";
import { OpeningBalanceRow } from "./OpeningBalanceRow";
import { SettlementRow } from "./SettlementRow";
import { TransactionRow } from "./TransactionRow";
import { UpdateTransactionDrawer } from "./UpdateTransactionDrawer";
import { FocusField } from "./form/TransactionForm";
import classes from "./TransactionGroup.module.css";

interface TransactionGroupProps {
  group: Transactions.TransactionGroup;
  groupBy: Transactions.GroupBy;
  accounts: Transactions.Account[];
  categories: Transactions.Category[];
  currentUserId: number;
  groupTotal?: number;
  runningBalance?: number;
  isFirst?: boolean;
  selectedIds?: Set<number>;
  onSelectTransaction?: (id: number) => void;
}

export function TransactionGroup({
  group,
  groupBy,
  accounts,
  categories,
  currentUserId,
  groupTotal,
  runningBalance,
  isFirst = false,
  selectedIds,
  onSelectTransaction,
}: TransactionGroupProps) {
  const isSelectionActive = (selectedIds?.size ?? 0) > 0;

  function openEditDrawer(
    tx: Transactions.Transaction,
    focusField?: FocusField
  ) {
    void renderDrawer(() => (
      <UpdateTransactionDrawer transaction={tx} focusField={focusField} />
    ));
  }

  return (
    <Box className={classes.group}>
      <Group justify="space-between" align="center" className={classes.header}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          {group.label}
        </Text>
      </Group>
      <div className={classes.rows}>
        {isFirst && <OpeningBalanceRow />}
        {group.transactions.map((tx) => {
          const isOwner =
            tx.original_user_id === currentUserId ||
            tx.user_id === currentUserId;
          return (
            <Fragment key={tx.id}>
              <TransactionRow
                transaction={tx}
                groupBy={groupBy}
                accounts={accounts}
                categories={categories}
                currentUserId={currentUserId}
                isSelected={selectedIds?.has(tx.id)}
                isSelectionMode={isSelectionActive}
                onSelect={onSelectTransaction}
                onEdit={
                  !isSelectionActive && isOwner
                    ? () => openEditDrawer(tx)
                    : undefined
                }
              />
              {(tx.settlements_from_source ?? []).map((s) => (
                <SettlementRow
                  key={`settlement-${s.id}`}
                  settlement={s}
                  groupBy={groupBy}
                  accounts={accounts}
                  onEdit={
                    !isSelectionActive && isOwner
                      ? () => openEditDrawer(tx, "split_settings.0.amount")
                      : undefined
                  }
                />
              ))}
            </Fragment>
          );
        })}
        {groupTotal !== undefined && runningBalance !== undefined && (
          <div className={classes.footerRow}>
            <Text size="xs" c="dimmed">
              Subtotal
            </Text>
            <Group gap="xs">
              <Text size="xs" fw={500} c={groupTotal >= 0 ? "teal" : "red"}>
                {formatSignedCents(groupTotal)}
              </Text>
              <Text size="xs" c="dimmed">
                ·
              </Text>
              <Text size="xs" fw={600} c={runningBalance < 0 ? "red" : "teal"}>
                {formatBalance(runningBalance)}
              </Text>
            </Group>
          </div>
        )}
      </div>
    </Box>
  );
}
