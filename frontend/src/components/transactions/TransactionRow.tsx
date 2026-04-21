import { Badge, Checkbox, Group, Text, Tooltip } from "@mantine/core";
import { IconAlertCircle, IconArrowRight, IconUsers } from "@tabler/icons-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { Transactions } from "@/types/transactions";
import { formatCents } from "@/utils/formatCents";
import { parseDate } from "@/utils/parseDate";
import { RecurrenceBadge } from "./RecurrenceBadge";
import classes from "./TransactionRow.module.css";
import { FocusField } from "./form/TransactionForm";
import { MouseEventHandler } from "react";

const MAX_TAGS = 3;

interface CategoryCellProps {
  tx: Transactions.Transaction;
  groupBy: Transactions.GroupBy;
  category: Transactions.Category | null | undefined;
  fromAccount: Transactions.Account | null | undefined;
  toAccount: Transactions.Account | null | undefined;
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

function AccountCell({
  tx,
  groupBy,
  account,
  fromAccount,
  toAccount,
}: AccountCellProps) {
  if (groupBy === "account") return null;

  if (tx.type === "transfer") {
    return (
      <Group gap={4} wrap="nowrap" data-testid="transfer_avatar_group">
        <Tooltip label={fromAccount?.name ?? "\u2014"} withArrow position="top">
          <span>
            <AccountAvatar account={fromAccount} size={28} />
          </span>
        </Tooltip>
        <IconArrowRight size={12} style={{ opacity: 0.5 }} data-testid="icon_transfer_arrow" />
        <Tooltip label={toAccount?.name ?? "\u2014"} withArrow position="top">
          <span>
            <AccountAvatar account={toAccount} size={28} />
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
  onSelect?: (id: number) => void;
  onEdit?: (fieldClicked: FocusField) => void;
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
}: TransactionRowProps) {
  const account = accounts.find((a) => a.id === tx.account_id);
  const linkedAccount =
    tx.type === "transfer" && (tx.linked_transactions ?? []).length > 0
      ? accounts.find((a) => a.id === tx.linked_transactions![0].account_id)
      : null;
  const fromAccount = tx.operation_type === "debit" ? account : linkedAccount;
  const toAccount = tx.operation_type === "debit" ? linkedAccount : account;
  const category = tx.category_id
    ? categories.find((c) => c.id === tx.category_id)
    : null;
  const tags = tx.tags ?? [];
  const visibleTags = tags.slice(0, MAX_TAGS);
  const extraTags = tags.length - MAX_TAGS;

  const hasLinkedUser = (tx.linked_transactions ?? []).some(
    (l) => l.user_id !== currentUserId
  );

  const isFromOtherUser =
    tx.original_user_id != null && tx.original_user_id !== currentUserId;

  const originalUserLinkedTx = isFromOtherUser
    ? (tx.linked_transactions ?? []).find((l) => l.user_id === tx.original_user_id)
    : null;
  const originalUserAccount = originalUserLinkedTx
    ? accounts.find((a) => a.id === originalUserLinkedTx.account_id)
    : null;
  const originalUserAccountName = originalUserAccount?.name ?? null;

  const date = parseDate(tx.date);
  const dateLabel = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const selectionMode = isSelectionMode ?? false;

  function colClick(
    field: FocusField
  ): MouseEventHandler<HTMLDivElement> | undefined {
    if (selectionMode) return undefined;
    return (e) => {
      e.stopPropagation();
      onEdit?.(field);
    };
  }

  return (
    <div
      data-transaction-id={tx.id}
      className={`${classes.row}${selectionMode ? ` ${classes.selectable} ${classes.selectionMode}` : ""}${isSelected ? ` ${classes.selected}` : ""}${!selectionMode && onEdit ? ` ${classes.editable}` : ""}`.trimEnd()}
      onClick={selectionMode ? () => onSelect?.(tx.id) : undefined}
    >
      {/* Col 1: checkbox or other-user warning */}
      <div className={classes.checkbox}>
        {isFromOtherUser ? (
          <Tooltip
            label={
              originalUserAccountName
                ? `Essa transação não pode ser alterada pois foi criada pelo usuário"${originalUserAccountName}"`
                : "Essa transação não pode ser alterada pois foi criada por outro usuário"
            }
            withArrow
            multiline
            maw={260}
          >
            <IconAlertCircle
              size={18}
              style={{ color: "var(--mantine-color-yellow-6)", flexShrink: 0 }}
            />
          </Tooltip>
        ) : (
          <Checkbox
            checked={isSelected ?? false}
            onChange={() => onSelect?.(tx.id)}
            onClick={(e) => e.stopPropagation()}
            size="sm"
            data-testid={`checkbox_${tx.id}`}
          />
        )}
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
        <CategoryCell
          tx={tx}
          groupBy={groupBy}
          category={category}
          fromAccount={fromAccount}
          toAccount={toAccount}
        />
      </div>

      {/* Col 4: account (or from→to for transfers) */}
      <div className={classes.account} onClick={colClick("account_id")}>
        <AccountCell
          tx={tx}
          groupBy={groupBy}
          account={account}
          fromAccount={fromAccount}
          toAccount={toAccount}
        />
      </div>

      {/* Col 5: amount */}
      <div className={classes.amount} onClick={colClick("amount")}>
        <Text
          size="sm"
          fw={600}
          c={tx.operation_type === "credit" ? "teal" : "red"}
        >
          {formatCents(tx.amount, tx.operation_type)}
        </Text>
      </div>
    </div>
  );
}
