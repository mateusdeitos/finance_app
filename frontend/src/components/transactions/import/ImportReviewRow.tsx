import { memo } from "react";
import {
  Box,
  Button,
  Checkbox,
  Loader,
  NumberInput,
  Popover,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconAlertCircle, IconCheck, IconX } from "@tabler/icons-react";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { Transactions } from "@/types/transactions";
import { parseDate, localDateStr } from "@/utils/parseDate";
import { CurrencyInput } from "@/components/transactions/form/CurrencyInput";
import classes from "./ImportReviewRow.module.css";

const TRANSACTION_TYPE_OPTIONS = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

const ACTION_OPTIONS = [
  { value: "import", label: "Importar" },
  { value: "skip", label: "Não importar" },
  { value: "duplicate", label: "Duplicado" },
];

const RECURRENCE_TYPE_OPTIONS = [
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
];

interface Props {
  row: Transactions.ImportRowState;
  index: number;
  selected: boolean;
  disabled: boolean;
  onChange: (
    index: number,
    patch: Partial<Transactions.ImportRowState>
  ) => void;
  onToggleSelect: (index: number) => void;
}

export const ImportReviewRow = memo(function ImportReviewRow({
  row,
  index,
  selected,
  disabled,
  onChange,
  onToggleSelect,
}: Props) {
  const { query: categoriesQuery } = useCategories();
  const { query: accountsQuery } = useAccounts();

  const categories = categoriesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }));

  const accountOptions = accounts.map((a) => ({
    value: String(a.id),
    label: a.name,
  }));

  const isSkipped = row.action !== "import";
  const isTransfer = row.type === "transfer";

  function rowClass() {
    if (row.action === "duplicate") return classes.rowDuplicate;
    if (isSkipped) return classes.rowSkipped;
    return undefined;
  }

  function recurrenceSummary() {
    if (!row.recurrence_type) return "Parcelamento";
    const typeLabel =
      RECURRENCE_TYPE_OPTIONS.find((o) => o.value === row.recurrence_type)
        ?.label ?? row.recurrence_type;
    const count = row.recurrence_count ? `${row.recurrence_count}x ` : "";
    return `${count}(${typeLabel})`;
  }

  const statusCell = () => {
    if (row.import_status === "loading") return <Loader size="xs" />;
    if (row.import_status === "success")
      return <IconCheck size={16} color="var(--mantine-color-green-6)" />;
    if (row.import_status === "error") {
      return (
        <Tooltip label={row.import_error ?? "Erro ao importar"} withArrow>
          <IconX size={16} color="var(--mantine-color-red-6)" />
        </Tooltip>
      );
    }
    if (row?.parse_errors?.length) {
      return (
        <Tooltip
          label={row.parse_errors.join("; ")}
          withArrow
          multiline
          maw={300}
        >
          <IconAlertCircle size={16} color="var(--mantine-color-orange-6)" />
        </Tooltip>
      );
    }
    return null;
  };

  return (
    <Table.Tr className={rowClass()}>
      {/* Checkbox */}
      <Table.Td>
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect(index)}
          disabled={disabled}
          size="xs"
        />
      </Table.Td>

      {/* Status */}
      <Table.Td>
        <Box className={classes.statusIcon}>{statusCell()}</Box>
      </Table.Td>

      {/* Action */}
      <Table.Td miw={120}>
        <Select
          size="xs"
          data={ACTION_OPTIONS}
          value={row.action}
          onChange={(val) =>
            val &&
            onChange(index, { action: val as Transactions.ImportRowAction })
          }
          disabled={disabled}
          withCheckIcon={false}
        />
      </Table.Td>

      {/* Date */}
      <Table.Td miw={130}>
        <DatePickerInput
          size="xs"
          valueFormat="DD/MM/YYYY"
          value={row.date ? parseDate(row.date) : null}
          onChange={(d) => onChange(index, { date: d ? localDateStr(d) : "" })}
          disabled={disabled || isSkipped}
          error={
            !row.date && row.action === "import" ? "Obrigatório" : undefined
          }
          popoverProps={{ withinPortal: true }}
        />
      </Table.Td>

      {/* Description */}
      <Table.Td miw={160}>
        <TextInput
          size="xs"
          value={row.description}
          onChange={(e) => onChange(index, { description: e.target.value })}
          disabled={disabled || isSkipped}
          error={
            !row.description && row.action === "import"
              ? "Obrigatório"
              : undefined
          }
        />
      </Table.Td>

      {/* Amount */}
      <Table.Td miw={120}>
        <CurrencyInput
          value={row.amount}
          onChange={(cents) => onChange(index, { amount: cents })}
          error={
            !row.amount && row.action === "import" ? "Obrigatório" : undefined
          }
        />
      </Table.Td>

      {/* Type */}
      <Table.Td miw={120}>
        <Select
          size="xs"
          data={TRANSACTION_TYPE_OPTIONS}
          value={row.type}
          onChange={(val) =>
            val &&
            onChange(index, {
              type: val as Transactions.TransactionType,
              category_id: null,
              destination_account_id: null,
            })
          }
          disabled={disabled || isSkipped}
          withCheckIcon={false}
        />
      </Table.Td>

      {/* Category (hidden for transfers) */}
      <Table.Td miw={140}>
        {!isTransfer ? (
          <Select
            size="xs"
            data={categoryOptions}
            value={row.category_id ? String(row.category_id) : null}
            onChange={(val) =>
              onChange(index, { category_id: val ? Number(val) : null })
            }
            disabled={disabled || isSkipped}
            searchable
            clearable
            placeholder="Selecionar..."
            withCheckIcon={false}
          />
        ) : (
          <Text fz="xs" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>

      {/* Destination account (only for transfers) */}
      <Table.Td miw={140}>
        {isTransfer ? (
          <Select
            size="xs"
            data={accountOptions}
            value={
              row.destination_account_id
                ? String(row.destination_account_id)
                : null
            }
            onChange={(val) =>
              onChange(index, {
                destination_account_id: val ? Number(val) : null,
              })
            }
            disabled={disabled || isSkipped}
            searchable
            placeholder="Selecionar..."
            withCheckIcon={false}
            error={
              !row.destination_account_id && row.action === "import"
                ? "Obrigatório"
                : undefined
            }
          />
        ) : (
          <Text fz="xs" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>

      {/* Recurrence */}
      <Table.Td miw={120}>
        <Popover withinPortal>
          <Popover.Target>
            <Button
              size="xs"
              variant="default"
              disabled={disabled || isSkipped}
              fullWidth
            >
              {recurrenceSummary()}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <RecurrencePopover row={row} index={index} onChange={onChange} />
          </Popover.Dropdown>
        </Popover>
      </Table.Td>
    </Table.Tr>
  );
});

// --- Recurrence popover ---

interface RecurrencePopoverProps {
  row: Transactions.ImportRowState;
  index: number;
  onChange: (
    index: number,
    patch: Partial<Transactions.ImportRowState>
  ) => void;
}

function RecurrencePopover({ row, index, onChange }: RecurrencePopoverProps) {
  return (
    <Stack gap="xs" w={200}>
      <Select
        label="Tipo"
        size="xs"
        data={RECURRENCE_TYPE_OPTIONS}
        value={row.recurrence_type ?? null}
        onChange={(val) =>
          onChange(index, {
            recurrence_type:
              (val as Transactions.RecurrenceType | null) ?? null,
            recurrence_count: val ? (row.recurrence_count ?? 1) : null,
          })
        }
        clearable
        withCheckIcon={false}
      />
      {row.recurrence_type && (
        <NumberInput
          label="Quantidade"
          size="xs"
          min={1}
          value={row.recurrence_count ?? 1}
          onChange={(val) =>
            onChange(index, {
              recurrence_count: typeof val === "number" ? val : null,
            })
          }
        />
      )}
    </Stack>
  );
}
