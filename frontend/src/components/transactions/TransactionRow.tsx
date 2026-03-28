import { Badge, Checkbox, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconArrowDown, IconUsers } from "@tabler/icons-react";
import { Transactions } from "@/types/transactions";
import { formatCents } from "@/utils/formatCents";
import { parseDate } from "@/utils/parseDate";
import { RecurrenceBadge } from "./RecurrenceBadge";
import classes from "./TransactionRow.module.css";

const MAX_TAGS = 3;

interface CategoryCellProps {
  tx: Transactions.Transaction;
  groupBy: Transactions.GroupBy;
  category: Transactions.Category | null | undefined;
  fromAccount: Transactions.Account | null | undefined;
  toAccount: Transactions.Account | null | undefined;
}

function CategoryCell({
  tx,
  groupBy,
  category,
  fromAccount,
  toAccount,
}: CategoryCellProps) {
  if (groupBy === "category") return null;

  if (tx.type !== "transfer") {
    return (
      <Text size="sm" c="dimmed" lineClamp={1}>
        {category?.name ?? "—"}
      </Text>
    );
  }

  if (groupBy === "account") {
    return (
      <Text size="sm" c="dimmed" lineClamp={1}>
        {toAccount?.name ?? "—"}
      </Text>
    );
  }

  return (
    <Stack gap={0}>
      <Text size="sm" c="dimmed" lineClamp={1}>
        {fromAccount?.name ?? "—"}
      </Text>
      <IconArrowDown size={12} style={{ opacity: 0.5 }} />
      <Text size="sm" c="dimmed" lineClamp={1}>
        {toAccount?.name ?? "—"}
      </Text>
    </Stack>
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
  onEdit?: () => void;
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

  const date = parseDate(tx.date);
  const dateLabel = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const selectionMode = isSelectionMode ?? false;

  return (
    <div
      data-transaction-id={tx.id}
      className={`${classes.row}${selectionMode ? ` ${classes.selectable} ${classes.selectionMode}` : ""}${isSelected ? ` ${classes.selected}` : ""}${!selectionMode && onEdit ? ` ${classes.editable}` : ""}`}
      onClick={selectionMode ? () => onSelect?.(tx.id) : (onEdit ?? undefined)}
    >
      {/* Col 1 (selection mode only): checkbox */}
      {selectionMode && (
        <div className={classes.checkbox}>
          <Checkbox
            checked={isSelected ?? false}
            onChange={() => onSelect!(tx.id)}
            onClick={(e) => e.stopPropagation()}
            size="sm"
            data-testid={`checkbox_${tx.id}`}
          />
        </div>
      )}

      {/* Col 2: date + description + tags */}
      <div className={classes.main}>
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

      {/* Col 2: category OR transfer accounts */}
      <div className={classes.category}>
        <CategoryCell
          tx={tx}
          groupBy={groupBy}
          category={category}
          fromAccount={fromAccount}
          toAccount={toAccount}
        />
      </div>

      {/* Col 3: account */}
      <div className={classes.account}>
        {groupBy !== "account" && tx.type !== "transfer" && (
          <Text size="sm" c="dimmed" lineClamp={1}>
            {account?.name ?? "—"}
          </Text>
        )}
      </div>

      {/* Col 4: amount */}
      <div className={classes.amount}>
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
