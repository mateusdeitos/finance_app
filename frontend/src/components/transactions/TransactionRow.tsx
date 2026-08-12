import { Checkbox, Tooltip } from "@mantine/core";
import { IconArrowRight, IconRepeat, IconUsers } from "@tabler/icons-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { SwipeAction } from "@/components/SwipeAction";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Transactions } from "@/types/transactions";
import { formatCents } from "@/utils/formatCents";
import { parseDate } from "@/utils/parseDate";
import { tapHaptic } from "@/utils/haptics";
import classes from "./TransactionRow.module.css";
import { FocusField } from "./form/TransactionForm";
import { MouseEventHandler, ReactNode } from "react";
import { TransactionsTestIds } from "@/testIds";

const MAX_TAGS = 3;

/**
 * Installment chip. The whole point of layout 1b is that "parcela 6/12" reads
 * at a glance, so this is a solid-filled chip rather than the dimmed inline
 * text it used to be. Mobile drops the "Parcela" word to save horizontal room.
 */
function InstallmentChip({
  transaction: tx,
  compact,
}: {
  transaction: Transactions.Transaction;
  compact: boolean;
}) {
  if (!tx.transaction_recurrence_id) return null;

  const hasInstallments =
    tx.installment_number != null && tx.transaction_recurrence?.installments != null;

  // Recurring-but-not-installment transactions keep the bare repeat glyph:
  // there is no "n of m" to show, so a chip would be noise.
  if (!hasInstallments) {
    return (
      <Tooltip label="Recorrente">
        <span className={classes.recurrenceIcon}>
          <IconRepeat size={13} />
        </span>
      </Tooltip>
    );
  }

  const fraction = `${tx.installment_number}/${tx.transaction_recurrence!.installments}`;

  return (
    <Tooltip label={`Parcela ${fraction}`}>
      <span className={classes.installmentChip} data-testid={TransactionsTestIds.InstallmentChip(tx.id)}>
        <IconRepeat size={11} />
        {compact ? fraction : `Parcela ${fraction}`}
      </span>
    </Tooltip>
  );
}

/**
 * Human label for how a transaction is divided. Derived from the settlements
 * the source transaction generated: their sum is the other person's share, the
 * remainder is ours. An even split collapses to "Dividida 50%", anything else
 * spells out both sides ("Dividida 70/30").
 */
export function splitLabel(
  tx: Transactions.Transaction,
  currentUserId: number,
): string | null {
  if (tx.type === "transfer") return null;

  const settlements = tx.settlements_from_source ?? [];
  if (settlements.length > 0 && tx.amount > 0) {
    const otherShare = settlements.reduce((sum, s) => sum + s.amount, 0);
    const otherPct = Math.round((otherShare / tx.amount) * 100);
    if (otherPct <= 0 || otherPct >= 100) return "Dividida";
    const minePct = 100 - otherPct;
    return otherPct === 50 ? "Dividida 50%" : `Dividida ${minePct}/${otherPct}`;
  }

  // The counterpart side of someone else's split: we hold only our own share,
  // so the ratio isn't recoverable from this row alone.
  if ((tx.linked_transactions ?? []).some((l) => l.user_id !== currentUserId)) {
    return "Dividida";
  }

  return null;
}

interface TransactionRowProps {
  transaction: Transactions.Transaction;
  groupBy: Transactions.GroupBy;
  accounts: Transactions.Account[];
  categories: Transactions.Category[];
  currentUserId: number;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onSelect?: (id: number, shiftKey: boolean) => void;
  onEdit?: (fieldClicked: FocusField) => void;
  onDelete?: (tx: Transactions.Transaction) => void;
}

export function TransactionRow({
  transaction: tx,
  groupBy,
  accounts,
  categories,
  currentUserId,
  isSelected,
  isSelectionMode,
  onSelect,
  onEdit,
  onDelete,
}: TransactionRowProps) {
  const isMobile = useIsMobile();
  const account = accounts.find((a) => a.id === tx.account_id);
  const linkedAccount = (() => {
    if (tx.type !== "transfer") return null;
    const lt = (tx.linked_transactions ?? [])[0];
    if (!lt) return null;

    const direct = accounts.find((a) => a.id === lt.account_id);
    if (direct) return direct;

    return (
      accounts.find((a) => {
        if (!a.user_connection) return false;
        const conn = a.user_connection;
        return (
          conn.from_account_id === lt.account_id ||
          conn.to_account_id === lt.account_id ||
          conn.from_user_id === lt.original_user_id ||
          conn.to_user_id === lt.original_user_id
        );
      }) ?? null
    );
  })();

  // For cross-user transfers: if any linked tx was authored by another user, find the
  // connection account where that user appears to correctly render the originator's avatar
  // (their private account has no user_connection and would only show initials).
  const linkedTxFromOtherUser =
    tx.type === "transfer"
      ? (tx.linked_transactions ?? []).find(
          (lt) => lt.original_user_id != null && lt.original_user_id !== currentUserId,
        )
      : undefined;
  const fromConnectionAccount: Transactions.Account | null = (() => {
    if (linkedTxFromOtherUser?.original_user_id == null) {
      return null;
    }

    const account = accounts.find(
      (a) =>
        a.user_connection &&
        (a.user_connection.from_user_id === linkedTxFromOtherUser.original_user_id ||
          a.user_connection.to_user_id === linkedTxFromOtherUser.original_user_id),
    );

    if (!account) {
      return null;
    }

    const acc: Transactions.Account = {
      ...account,
      name: (() => {
        let name = account.name;
        if (!account.user_connection) return name;

        if (
          account.user_connection?.from_user_id === linkedTxFromOtherUser.original_user_id &&
          !!account.user_connection.from_user_name
        ) {
          name = account!.user_connection!.from_user_name!;
        } else if (account?.user_connection?.to_user_name) {
          name = account.user_connection.to_user_name;
        }

        return name;
      })(),
    };

    return acc;
  })();

  const fromAccount = tx.operation_type === "debit" ? account : (fromConnectionAccount ?? linkedAccount);
  const toAccount = tx.operation_type === "debit" ? linkedAccount : account;
  const category = tx.category_id ? categories.find((c) => c.id === tx.category_id) : null;
  const tags = tx.tags ?? [];
  const visibleTags = tags.slice(0, MAX_TAGS);
  const extraTags = tags.length - MAX_TAGS;

  const split = splitLabel(tx, currentUserId);

  const date = parseDate(tx.date);
  const dateLabel = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const selectionMode = isSelectionMode ?? false;

  function colClick(field: FocusField): MouseEventHandler<HTMLDivElement> | undefined {
    if (selectionMode) return undefined;
    return (e) => {
      e.stopPropagation();
      onEdit?.(field);
    };
  }

  const swipeEnabled = isMobile && !selectionMode && !!onDelete;

  const showCategory = groupBy !== "category" && tx.type !== "transfer";
  const showAccount = groupBy !== "account";

  // Metadata line, in the order the design fixes: installment chip, category,
  // account, split chip, hashtags. Separators are only emitted between the
  // parts that actually rendered.
  const metaItems: ReactNode[] = [];

  if (groupBy !== "date") {
    metaItems.push(
      <span key="date" className={classes.metaText}>
        {dateLabel}
      </span>,
    );
  }

  if (showCategory) {
    metaItems.push(
      <span key="category" className={classes.metaItem} onClick={colClick("category_id")}>
        {category?.emoji && (
          <span className={classes.categoryEmoji} aria-hidden>
            {category.emoji}
          </span>
        )}
        <span className={classes.metaText}>{category?.name ?? "—"}</span>
      </span>,
    );
  }

  if (showAccount) {
    metaItems.push(
      tx.type === "transfer" ? (
        <span
          key="account"
          className={classes.transferAvatars}
          data-testid={TransactionsTestIds.TransferAvatarGroup}
          onClick={colClick("account_id")}
        >
          <Tooltip label={fromAccount?.name ?? "—"} withArrow position="top">
            <span style={{ display: "inline-flex" }}>
              <AccountAvatar account={fromAccount} size={16} />
            </span>
          </Tooltip>
          <IconArrowRight size={11} style={{ opacity: 0.5 }} data-testid={TransactionsTestIds.IconTransferArrow} />
          <Tooltip label={toAccount?.name ?? "—"} withArrow position="top">
            <span style={{ display: "inline-flex" }}>
              <AccountAvatar account={toAccount} size={16} />
            </span>
          </Tooltip>
        </span>
      ) : (
        <span key="account" className={classes.metaItem} onClick={colClick("account_id")}>
          <Tooltip label={account?.name ?? "—"} withArrow position="top">
            <span style={{ display: "inline-flex" }}>
              <AccountAvatar account={account} size={16} />
            </span>
          </Tooltip>
          <span className={classes.metaText}>{account?.name ?? "—"}</span>
        </span>
      ),
    );
  }

  const separatedMeta = metaItems.flatMap((item, i) =>
    i === 0
      ? [item]
      : [
          <span key={`sep-${i}`} className={classes.metaSeparator} aria-hidden>
            ·
          </span>,
          item,
        ],
  );

  const rowContent = (
    <div
      data-transaction-id={tx.id}
      className={`${classes.row}${tx.reviewed_at ? ` ${classes.reviewed}` : ""}${selectionMode ? ` ${classes.selectable}` : ""}${isSelected ? ` ${classes.selected}` : ""}${!selectionMode && onEdit ? ` ${classes.editable}` : ""}`.trimEnd()}
      // Row-level fallback: the per-field handlers below live on the leaf
      // elements and stop propagation, so anything else in the row (the gap
      // between the two lines, the padding) still opens the editor rather
      // than being a dead zone.
      onClick={
        selectionMode
          ? (e) => { tapHaptic(); onSelect?.(tx.id, e.shiftKey); }
          : onEdit
            ? () => onEdit("description")
            : undefined
      }
    >
      {/* Multi-select checkbox, on every viewport. */}
      <div className={classes.checkbox}>
        <Checkbox
          checked={isSelected ?? false}
          onChange={(e) => { tapHaptic(); onSelect?.(tx.id, (e.nativeEvent as MouseEvent).shiftKey); }}
          onClick={(e) => e.stopPropagation()}
          size="xs"
          data-testid={TransactionsTestIds.Checkbox(tx.id)}
        />
      </div>

      <div className={classes.main}>
        {/* Line 1 — description and value adjacent, which is the whole point
            of the redesign: the amount is no longer a viewport away. */}
        <div className={classes.descLine}>
          <span className={classes.description} onClick={colClick("description")}>
            {tx.description}
          </span>
          <span
            className={`${classes.amount} ${
              tx.type === "transfer"
                ? classes.amountNeutral
                : tx.operation_type === "credit"
                  ? classes.amountPositive
                  : classes.amountNegative
            }`}
            onClick={colClick("amount")}
          >
            {formatCents(tx.amount, tx.operation_type)}
          </span>
        </div>

        {/* Line 2 — metadata chips. */}
        <div className={classes.metaLine}>
          <InstallmentChip transaction={tx} compact={isMobile} />
          {separatedMeta}
          {split && (
            <span className={`${classes.outlineChip}`} data-testid={TransactionsTestIds.SplitChip(tx.id)}>
              <IconUsers size={11} />
              {split}
            </span>
          )}
          {visibleTags.map((tag) => (
            <span key={tag.id} className={classes.tag}>
              #{tag.name}
            </span>
          ))}
          {extraTags > 0 && <span className={classes.metaText}>+{extraTags}</span>}
        </div>
      </div>
    </div>
  );

  if (swipeEnabled) {
    return (
      <SwipeAction
        actionLabel="Excluir"
        actionColor="red"
        actionTestId={TransactionsTestIds.BtnSwipeDelete(tx.id)}
        onAction={() => onDelete!(tx)}
      >
        {rowContent}
      </SwipeAction>
    );
  }

  return rowContent;
}
