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

// For transfers between accounts of the same user, the debit side is the
// origin; editing the credit side is rejected by the backend as a linked
// transaction edit. Always route edits through the origin.
//
// The list endpoint only preloads linked_transactions one level deep, so the
// debit tx reached via `credit.linked_transactions[0]` has an empty
// linked_transactions of its own. Reattach the original credit-side tx so
// the update drawer can still derive the destination account from it.
function resolveTransferEditTarget(
  tx: Transactions.Transaction
): Transactions.Transaction {
  if (tx.type !== "transfer" || tx.operation_type !== "credit") return tx;
  const linked = tx.linked_transactions?.[0];
  if (!linked || linked.user_id !== tx.user_id) return tx;
  return { ...linked, linked_transactions: [tx] };
}

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
  hideSettlements?: boolean;
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
  hideSettlements,
}: TransactionGroupProps) {
  const isSelectionActive = (selectedIds?.size ?? 0) > 0;

  function openEditDrawer(
    tx: Transactions.Transaction,
    focusField?: FocusField
  ) {
    const target = resolveTransferEditTarget(tx);
    void renderDrawer(() => (
      <UpdateTransactionDrawer transaction={target} focusField={focusField} />
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
          const isSynthetic = tx.origin_settlement_id !== undefined;
          const isOwner =
            !isSynthetic &&
            (tx.original_user_id === currentUserId ||
              tx.user_id === currentUserId);

          if (isSynthetic) {
            // Render synthetic entries (orphaned settlements surfaced as
            // transactions by the backend) with the same SettlementRow
            // styling used for inline settlements.
            const syntheticSettlement: Transactions.Settlement = {
              id: tx.origin_settlement_id!,
              user_id: tx.user_id,
              amount: tx.amount,
              type: tx.operation_type === "credit" ? "credit" : "debit",
              account_id: tx.account_id,
              source_transaction_id: 0,
              parent_transaction_id: 0,
              created_at: tx.created_at,
            };
            return (
              <SettlementRow
                key={tx.id}
                settlement={syntheticSettlement}
                groupBy={groupBy}
                accounts={accounts}
                description={tx.description}
              />
            );
          }

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
                    ? (fieldClicked: FocusField) => openEditDrawer(tx, fieldClicked)
                    : undefined
                }
              />
              {!hideSettlements && (tx.settlements_from_source ?? []).map((s) => (
                <SettlementRow
                  key={`settlement-${s.id}`}
                  settlement={s}
                  groupBy={groupBy}
                  accounts={accounts}
                  description={tx.description}
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
