import { Box, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Fragment } from "react";
import { fetchTransaction } from "@/api/transactions";
import { Transactions } from "@/types/transactions";
import { formatBalance, formatSignedCents } from "@/utils/formatCents";
import { renderDrawer } from "@/utils/renderDrawer";
import { OpeningBalanceRow } from "./OpeningBalanceRow";
import { SettlementRow } from "./SettlementRow";
import { TransactionRow } from "./TransactionRow";
import { UpdateTransactionDrawer } from "./UpdateTransactionDrawer";
import { UpdateLinkedSplitDrawer } from "./UpdateLinkedSplitDrawer";
import { UpdateLinkedTransferDrawer } from "./UpdateLinkedTransferDrawer";
import { FocusField } from "./form/TransactionForm";
import classes from "./TransactionGroup.module.css";

function getLinkedMode(
  tx: Transactions.Transaction,
  currentUserId: number,
): "transfer" | "split" | null {
  if (tx.original_user_id == null || tx.original_user_id === currentUserId)
    return null;
  return tx.type === "transfer" ? "transfer" : "split";
}

// For transfers between accounts of the same user, the debit side is the
// origin; editing the credit side is rejected by the backend as a linked
// transaction edit. Always route edits through the origin.
//
// The linked relationship is stored unidirectionally (debit → credit), so the
// credit-side row carries only a shallow reference to the debit side. Fetch
// the debit tx fresh so its own linked_transactions resolve the destination
// account in the edit drawer.
function needsFetchToDebitOrigin(tx: Transactions.Transaction): number | null {
  if (tx.type !== "transfer" || tx.operation_type !== "credit") return null;
  const linked = tx.linked_transactions?.[0];
  if (!linked || linked.user_id !== tx.user_id) return null;
  return linked.id;
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
  selectedSettlementIds?: Set<number>;
  onSelectTransaction?: (id: number, shiftKey: boolean) => void;
  onSelectSettlement?: (settlementId: number, shiftKey: boolean) => void;
  onDeleteTransaction?: (tx: Transactions.Transaction) => void;
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
  selectedSettlementIds,
  onSelectTransaction,
  onSelectSettlement,
  onDeleteTransaction,
  hideSettlements,
}: TransactionGroupProps) {
  const isSelectionActive =
    (selectedIds?.size ?? 0) > 0 || (selectedSettlementIds?.size ?? 0) > 0;

  function renderLinkedDrawer(tx: Transactions.Transaction) {
    const mode = getLinkedMode(tx, currentUserId);
    if (mode === "transfer") {
      void renderDrawer(() => <UpdateLinkedTransferDrawer transaction={tx} />);
      return true;
    }
    if (mode === "split") {
      void renderDrawer(() => <UpdateLinkedSplitDrawer transaction={tx} />);
      return true;
    }
    return false;
  }

  function openEditDrawer(
    tx: Transactions.Transaction,
    focusField?: FocusField
  ) {
    if (renderLinkedDrawer(tx)) return;

    const debitId = needsFetchToDebitOrigin(tx);
    if (debitId == null) {
      void renderDrawer(() => (
        <UpdateTransactionDrawer transaction={tx} focusField={focusField} />
      ));
      return;
    }

    const notifId = notifications.show({
      loading: true,
      title: "Carregando transação...",
      message: "",
      autoClose: false,
      withCloseButton: false,
    });
    fetchTransaction(debitId)
      .then((debit) => {
        notifications.hide(notifId);
        void renderDrawer(() => (
          <UpdateTransactionDrawer transaction={debit} focusField={focusField} />
        ));
      })
      .catch(() => {
        notifications.update({
          id: notifId,
          loading: false,
          color: "red",
          title: "Erro",
          message: "Não foi possível carregar a transação",
          autoClose: 3000,
        });
      });
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
            const settlementId = tx.origin_settlement_id!;
            const syntheticSettlement: Transactions.Settlement = {
              id: settlementId,
              user_id: tx.user_id,
              amount: tx.amount,
              type: tx.operation_type === "credit" ? "credit" : "debit",
              account_id: tx.account_id,
              source_transaction_id: 0,
              parent_transaction_id: 0,
              date: tx.date,
              created_at: tx.created_at,
            };
            return (
              <SettlementRow
                key={tx.id}
                settlement={syntheticSettlement}
                groupBy={groupBy}
                accounts={accounts}
                description={tx.description}
                isSelected={selectedSettlementIds?.has(settlementId)}
                isSelectionMode={isSelectionActive}
                onSelect={onSelectSettlement}
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
                onDelete={!isSelectionActive && isOwner ? onDeleteTransaction : undefined}
              />
              {!hideSettlements && (tx.settlements_from_source ?? []).map((s) => (
                <SettlementRow
                  key={`settlement-${s.id}`}
                  settlement={s}
                  groupBy={groupBy}
                  accounts={accounts}
                  description={tx.description}
                  isSelected={selectedSettlementIds?.has(s.id)}
                  isSelectionMode={isSelectionActive}
                  onSelect={onSelectSettlement}
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
