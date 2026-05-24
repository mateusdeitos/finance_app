import { Box, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Fragment } from "react";
import { fetchTransaction } from "@/api/transactions";
import { TransactionsTestIds } from "@/testIds";
import { Transactions } from "@/types/transactions";
import { formatSignedCents } from "@/utils/formatCents";
import { renderDrawer } from "@/utils/renderDrawer";
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
  accountFilter?: number[];
  groupTotal?: number;
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
  accountFilter,
  groupTotal,
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

  function openSyntheticEditDrawer(sourceTxId: number) {
    // Synthetic settlement rows don't carry their source's full state;
    // fetch the source by id and open its update drawer focused on the
    // split-settings amount, mirroring the inline-settlement onEdit. The
    // source is always owned by the same user as the settlement, so no
    // extra ownership check is needed (the backend already filters by
    // caller user_id).
    const notifId = notifications.show({
      loading: true,
      title: "Carregando transação...",
      message: "",
      autoClose: false,
      withCloseButton: false,
    });
    fetchTransaction(sourceTxId)
      .then((source) => {
        notifications.hide(notifId);
        void renderDrawer(() => (
          <UpdateTransactionDrawer transaction={source} focusField="split_settings.0.amount" />
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

  function openEditDrawer(
    tx: Transactions.Transaction,
    focusField?: FocusField
  ) {
    if (renderLinkedDrawer(tx)) return;

    // Always refetch the source by id. The listing's `tx` may have been
    // transformed by groupTransactions — e.g. when a settlement.date differs
    // from the source's tx.date, the settlement is promoted to its own row
    // in another date group and stripped from `tx.settlements_from_source`.
    // The drawer needs the un-stripped source so the per-split date input
    // can be hydrated from settlement.date. Also handles the cross-tx hop
    // for the credit side of same-user transfers, mirroring the previous
    // `needsFetchToDebitOrigin` branch.
    const targetId = needsFetchToDebitOrigin(tx) ?? tx.id;

    const notifId = notifications.show({
      loading: true,
      title: "Carregando transação...",
      message: "",
      autoClose: false,
      withCloseButton: false,
    });
    fetchTransaction(targetId)
      .then((source) => {
        notifications.hide(notifId);
        void renderDrawer(() => (
          <UpdateTransactionDrawer transaction={source} focusField={focusField} />
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
      <Group
        justify="space-between"
        align="baseline"
        className={classes.header}
        wrap="nowrap"
        data-testid={TransactionsTestIds.GroupHeader(group.key)}
      >
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.06em" }}>
          {group.label}
        </Text>
        {groupTotal !== undefined && (
          <Text
            size="xs"
            fw={600}
            c={groupTotal >= 0 ? "teal" : "red"}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            subtotal {formatSignedCents(groupTotal)}
          </Text>
        )}
      </Group>
      <div className={classes.rows}>
        {group.transactions.map((tx) => {
          const isSynthetic = tx.origin_settlement_id !== undefined;
          const isOwner =
            !isSynthetic &&
            (tx.original_user_id === currentUserId ||
              tx.user_id === currentUserId);

          if (isSynthetic) {
            if (hideSettlements) return null;
            const settlementId = tx.origin_settlement_id!;
            const sourceTxId = tx.source_transaction_id;
            const syntheticSettlement: Transactions.Settlement = {
              id: settlementId,
              user_id: tx.user_id,
              amount: tx.amount,
              type: tx.operation_type === "credit" ? "credit" : "debit",
              account_id: tx.account_id,
              source_transaction_id: sourceTxId ?? 0,
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
                onEdit={
                  !isSelectionActive && sourceTxId
                    ? () => openSyntheticEditDrawer(sourceTxId)
                    : undefined
                }
                // Synthetic rows don't carry the source tx's date in the
                // listing payload; the chip renders without a "de …" suffix.
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
              {!hideSettlements &&
                (tx.settlements_from_source ?? [])
                  // A settlement belongs to its connection account. When an
                  // account filter is active, only show it under the source
                  // transaction if that connection account is in the filter;
                  // otherwise it would appear without counting toward the total.
                  .filter(
                    (s) =>
                      !accountFilter?.length ||
                      accountFilter.includes(s.account_id)
                  )
                  .map((s) => (
                    <SettlementRow
                      key={`settlement-${s.id}`}
                      settlement={s}
                      groupBy={groupBy}
                      accounts={accounts}
                      description={tx.description}
                      parentDate={tx.date}
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
      </div>
    </Box>
  );
}
