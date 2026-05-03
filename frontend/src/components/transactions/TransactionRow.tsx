import { Badge, Checkbox, Group, Text, Tooltip } from "@mantine/core";
import { IconArrowRight, IconUsers } from "@tabler/icons-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { SwipeAction } from "@/components/SwipeAction";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Transactions } from "@/types/transactions";
import { formatCents } from "@/utils/formatCents";
import { parseDate } from "@/utils/parseDate";
import { tapHaptic } from "@/utils/haptics";
import { RecurrenceBadge } from "./RecurrenceBadge";
import classes from "./TransactionRow.module.css";
import { FocusField } from "./form/TransactionForm";
import { MouseEventHandler } from "react";
import { TransactionsTestIds } from "@/testIds";

const MAX_TAGS = 3;

interface CategoryCellProps {
  tx: Transactions.Transaction;
  groupBy: Transactions.GroupBy;
  category: Transactions.Category | null | undefined;
}

function CategoryCell({ tx, groupBy, category }: CategoryCellProps) {
  if (groupBy === "category") return null;
  if (tx.type === "transfer") return null;

  return (
    <Text size="sm" c="dimmed" lineClamp={1}>
      {category?.name ?? "—"}
    </Text>
  );
}

interface AccountCellProps {
  tx: Transactions.Transaction;
  groupBy: Transactions.GroupBy;
  account: Transactions.Account | null | undefined;
  fromAccount: Transactions.Account | null | undefined;
  toAccount: Transactions.Account | null | undefined;
}

function AccountCell({ tx, groupBy, account, fromAccount, toAccount }: AccountCellProps) {
  if (groupBy === "account") return null;

  if (tx.type === "transfer") {
    return (
      <Group gap={4} wrap="nowrap" data-testid={TransactionsTestIds.TransferAvatarGroup}>
        <Tooltip label={fromAccount?.name ?? "\u2014"} withArrow position="top">
          <span>
            <AccountAvatar account={fromAccount} size={28} />
          </span>
        </Tooltip>
        <IconArrowRight size={12} style={{ opacity: 0.5 }} data-testid={TransactionsTestIds.IconTransferArrow} />
        <Tooltip label={toAccount?.name ?? "\u2014"} withArrow position="top">
          <span>
            <AccountAvatar account={toAccount} direction="to" size={28} />
          </span>
        </Tooltip>
      </Group>
    );
  }

  return (
    <Tooltip label={account?.name ?? "\u2014"} withArrow position="top">
      <span style={{ display: "inline-flex" }}>
        <AccountAvatar account={account} size={28} />
      </span>
    </Tooltip>
  );
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
  const linkedAccount =
    tx.type === "transfer" && (tx.linked_transactions ?? []).length > 0
      ? accounts.find((a) => {
          const ids = [a.id];
          const lt = tx.linked_transactions![0];
          if (a.user_connection) {
            ids.push(a.user_connection?.from_account_id, a.user_connection?.to_account_id);
          }

          return (
            ids.includes(lt.account_id) ||
            a.user_connection?.from_user_id == lt.original_user_id ||
            a.user_connection?.to_user_id == lt.original_user_id
          );
        })
      : null;

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

  const hasLinkedUser = (tx.linked_transactions ?? []).some((l) => l.user_id !== currentUserId);

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

  const rowContent = (
    <div
      data-transaction-id={tx.id}
      className={`${classes.row}${selectionMode ? ` ${classes.selectable} ${classes.selectionMode}` : ""}${isSelected ? ` ${classes.selected}` : ""}${!selectionMode && onEdit ? ` ${classes.editable}` : ""}`.trimEnd()}
      onClick={selectionMode ? (e) => { tapHaptic(); onSelect?.(tx.id, e.shiftKey); } : undefined}
    >
      {/* Col 1: checkbox or other-user warning */}
      <div className={classes.checkbox}>
        <Checkbox
          checked={isSelected ?? false}
          onChange={(e) => { tapHaptic(); onSelect?.(tx.id, (e.nativeEvent as MouseEvent).shiftKey); }}
          onClick={(e) => e.stopPropagation()}
          size="sm"
          data-testid={TransactionsTestIds.Checkbox(tx.id)}
        />
      </div>

      {/* Col 2: date + description + tags */}
      <div className={classes.main} onClick={colClick("description")}>
        {groupBy !== "date" && (
          <Text size="xs" c="dimmed">
            {dateLabel}
          </Text>
        )}
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={500} lineClamp={1}>
            {tx.description}
          </Text>
          <RecurrenceBadge transaction={tx} />
          {hasLinkedUser && (
            <Tooltip label="Compartilhada">
              <IconUsers size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </Tooltip>
          )}
        </Group>
        {tags.length > 0 && (
          <Group gap={4} mt={2}>
            {visibleTags.map((tag) => (
              <Badge key={tag.id} size="xs" variant="outline" radius="sm">
                {tag.name}
              </Badge>
            ))}
            {extraTags > 0 && (
              <Text size="xs" c="dimmed">
                (...)
              </Text>
            )}
          </Group>
        )}
      </div>

      {/* Col 3: category */}
      <div className={classes.category} onClick={colClick("category_id")}>
        <CategoryCell tx={tx} groupBy={groupBy} category={category} />
      </div>

      {/* Col 4: account (or from→to for transfers) */}
      <div className={classes.account} onClick={colClick("account_id")}>
        <AccountCell tx={tx} groupBy={groupBy} account={account} fromAccount={fromAccount} toAccount={toAccount} />
      </div>

      {/* Col 5: amount */}
      <div className={classes.amount} onClick={colClick("amount")}>
        <Text size="sm" fw={600} c={tx.operation_type === "credit" ? "teal" : "red"}>
          {formatCents(tx.amount, tx.operation_type)}
        </Text>
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
