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
    <Group gap={6} wrap="nowrap" align="center">
      {category?.emoji && (
        <span style={{ fontSize: "0.9375rem", lineHeight: 1 }} aria-hidden>
          {category.emoji}
        </span>
      )}
      <Text size="sm" c="dimmed" lineClamp={1}>
        {category?.name ?? "—"}
      </Text>
    </Group>
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
        <Tooltip label={fromAccount?.name ?? "—"} withArrow position="top">
          <span style={{ display: "inline-flex" }}>
            <AccountAvatar account={fromAccount} size={28} />
          </span>
        </Tooltip>
        <IconArrowRight size={12} style={{ opacity: 0.5 }} data-testid={TransactionsTestIds.IconTransferArrow} />
        <Tooltip label={toAccount?.name ?? "—"} withArrow position="top">
          <span style={{ display: "inline-flex" }}>
            <AccountAvatar account={toAccount} size={28} />
          </span>
        </Tooltip>
      </Group>
    );
  }

  return (
    <Tooltip label={account?.name ?? "—"} withArrow position="top">
      <span style={{ display: "inline-flex" }}>
        <AccountAvatar account={account} size={28} />
      </span>
    </Tooltip>
  );
}

interface LeadingAvatarCellProps {
  tx: Transactions.Transaction;
  account: Transactions.Account | null | undefined;
  fromAccount: Transactions.Account | null | undefined;
  toAccount: Transactions.Account | null | undefined;
}

// Mobile-only leading avatar slot. Transfers stack the from/to avatars with a
// 50% overlap and a ring in the page color to read as "de → para" without
// needing an explicit arrow at this density.
function LeadingAvatarCell({ tx, account, fromAccount, toAccount }: LeadingAvatarCellProps) {
  if (tx.type === "transfer") {
    return (
      <div className={classes.transferAvatars} data-testid={TransactionsTestIds.TransferAvatarGroup}>
        <Tooltip label={fromAccount?.name ?? "—"} withArrow position="top">
          <span style={{ display: "inline-flex" }}>
            <AccountAvatar account={fromAccount} size={20} />
          </span>
        </Tooltip>
        <Tooltip label={toAccount?.name ?? "—"} withArrow position="top">
          <span style={{ display: "inline-flex" }}>
            <AccountAvatar account={toAccount} size={20} />
          </span>
        </Tooltip>
      </div>
    );
  }

  return (
    <Tooltip label={account?.name ?? "—"} withArrow position="top">
      <span style={{ display: "inline-flex" }}>
        <AccountAvatar account={account} size={26} />
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

  // Meta line: on mobile we collapse category + account name into the meta
  // line below the description (their dedicated columns are hidden on mobile).
  const metaParts: string[] = [];
  if (groupBy !== "date") metaParts.push(dateLabel);
  if (isMobile) {
    if (tx.type !== "transfer" && groupBy !== "category" && category?.name) {
      metaParts.push(category.name);
    }
    if (groupBy !== "account") {
      if (tx.type === "transfer") {
        const from = fromAccount?.name ?? "—";
        const to = toAccount?.name ?? "—";
        metaParts.push(`${from} → ${to}`);
      } else if (account?.name) {
        metaParts.push(account.name);
      }
    }
  }

  const rowContent = (
    <div
      data-transaction-id={tx.id}
      className={`${classes.row}${selectionMode ? ` ${classes.selectable} ${classes.selectionMode}` : ""}${isSelected ? ` ${classes.selected}` : ""}${!selectionMode && onEdit ? ` ${classes.editable}` : ""}`.trimEnd()}
      onClick={selectionMode ? (e) => { tapHaptic(); onSelect?.(tx.id, e.shiftKey); } : undefined}
    >
      {/* Col 1: checkbox */}
      <div className={classes.checkbox}>
        <Checkbox
          checked={isSelected ?? false}
          onChange={(e) => { tapHaptic(); onSelect?.(tx.id, (e.nativeEvent as MouseEvent).shiftKey); }}
          onClick={(e) => e.stopPropagation()}
          size="sm"
          data-testid={TransactionsTestIds.Checkbox(tx.id)}
        />
      </div>

      {/* Mobile-only: leading account avatar (or stacked from/to for transfers).
          We keep the slot div in the grid on every viewport so the grid template
          stays the same, but only mount the avatar content on mobile — that way
          the desktop AccountCell remains the single bearer of the
          TransferAvatarGroup / AvatarAccount testids and avatar-related tests
          don't get duplicate matches. */}
      <div className={classes.leadingAvatar} onClick={colClick("account_id")}>
        {isMobile && (
          <LeadingAvatarCell tx={tx} account={account} fromAccount={fromAccount} toAccount={toAccount} />
        )}
      </div>

      {/* Description + meta + tags */}
      <div className={classes.main} onClick={colClick("description")}>
        <Group gap={6} wrap="nowrap" align="flex-start">
          <Text size="sm" fw={500} lineClamp={2} style={{ flex: "1 1 auto", minWidth: 0 }}>
            {tx.description}
          </Text>
          {!isMobile && <RecurrenceBadge transaction={tx} />}
          {hasLinkedUser && (
            <Tooltip label="Compartilhada">
              <IconUsers size={11} style={{ flexShrink: 0, opacity: 0.6, marginTop: 2 }} />
            </Tooltip>
          )}
        </Group>
        {(metaParts.length > 0 || visibleTags.length > 0 || (isMobile && !!tx.transaction_recurrence_id)) && (
          <Group gap={6} mt={2} wrap="wrap" align="center">
            {isMobile && <RecurrenceBadge transaction={tx} />}
            {metaParts.length > 0 && (
              <Text size="xs" c="dimmed">
                {metaParts.join(" · ")}
              </Text>
            )}
            {visibleTags.map((tag) => (
              <Badge
                key={tag.id}
                size="xs"
                variant="light"
                color="blue"
                radius="xl"
                styles={{ root: { textTransform: "none", fontWeight: 500 } }}
              >
                #{tag.name}
              </Badge>
            ))}
            {extraTags > 0 && (
              <Text size="xs" c="dimmed">
                +{extraTags}
              </Text>
            )}
          </Group>
        )}
      </div>

      {/* Desktop-only column: category */}
      <div className={classes.category} onClick={colClick("category_id")}>
        <CategoryCell tx={tx} groupBy={groupBy} category={category} />
      </div>

      {/* Desktop-only column: account (or from→to for transfers) */}
      <div className={classes.account} onClick={colClick("account_id")}>
        <AccountCell tx={tx} groupBy={groupBy} account={account} fromAccount={fromAccount} toAccount={toAccount} />
      </div>

      {/* Amount */}
      <div className={classes.amount} onClick={colClick("amount")}>
        <Text size="sm" fw={600} c={tx.type === "transfer" ? "dimmed" : (tx.operation_type === "credit" ? "teal" : "red")}>
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
