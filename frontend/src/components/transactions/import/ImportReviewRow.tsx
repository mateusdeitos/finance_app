import { forwardRef, memo, useRef, useState } from "react";
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
  onChange: (index: number, patch: Partial<Transactions.ImportRowState>) => void;
  onToggleSelect: (index: number) => void;
}

export const ImportReviewRow = memo(
  forwardRef<HTMLTableRowElement, Props>(function ImportReviewRow(
    { row, index, selected, disabled, onChange, onToggleSelect },
    ref
  ) {
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

    // Shared accounts (have a user_connection) for split
    const sharedAccountOptions = accounts
      .filter((a) => a.user_connection?.connection_status === "accepted")
      .map((a) => ({
        value: String(a.user_connection!.id),
        label: a.name,
      }));

    const isSkipped = row.action !== "import";
    const isTransfer = row.type === "transfer";

    function rowClass() {
      if (row.action === "duplicate") return classes.rowDuplicate;
      if (isSkipped) return classes.rowSkipped;
      return undefined;
    }

    function splitSummary() {
      if (!row.split_settings?.length) return "Sem divisão";
      const s = row.split_settings[0];
      const label =
        sharedAccountOptions.find((o) => o.value === String(s.connection_id))
          ?.label ?? `#${s.connection_id}`;
      if (s.percentage != null) return `${s.percentage}% — ${label}`;
      if (s.amount != null)
        return `R$${(s.amount / 100).toFixed(2)} — ${label}`;
      return label;
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
      <Table.Tr ref={ref} className={rowClass()} data-row-index={index}>
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

        {/* Date */}
        <Table.Td miw={130}>
          <DatePickerInput
            size="xs"
            valueFormat="DD/MM/YYYY"
            value={row.date ? parseDate(row.date) : null}
            onChange={(d) => onChange(index, { date: d ? localDateStr(d) : "" })}
            disabled={disabled || isSkipped}
            error={!row.date && row.action === "import" ? "Obrigatório" : undefined}
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
            <Text fz="xs" c="dimmed">—</Text>
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
            <Text fz="xs" c="dimmed">—</Text>
          )}
        </Table.Td>

        {/* Recurrence */}
        <Table.Td miw={130}>
          <RecurrencePopover
            row={row}
            index={index}
            onChange={onChange}
            disabled={disabled || isSkipped}
          />
        </Table.Td>

        {/* Split (divisão) */}
        <Table.Td miw={140}>
          {!isTransfer && sharedAccountOptions.length > 0 ? (
            <SplitPopover
              row={row}
              index={index}
              onChange={onChange}
              disabled={disabled || isSkipped}
              sharedAccountOptions={sharedAccountOptions}
              summary={splitSummary()}
            />
          ) : (
            <Text fz="xs" c="dimmed">—</Text>
          )}
        </Table.Td>

        {/* Action — last */}
        <Table.Td miw={120}>
          <Select
            size="xs"
            data={ACTION_OPTIONS}
            value={row.action}
            onChange={(val) =>
              val && onChange(index, { action: val as Transactions.ImportRowAction })
            }
            disabled={disabled}
            withCheckIcon={false}
          />
        </Table.Td>
      </Table.Tr>
    );
  })
);

// ─── Recurrence popover ────────────────────────────────────────────────────────

interface RecurrencePopoverProps {
  row: Transactions.ImportRowState;
  index: number;
  disabled: boolean;
  onChange: (index: number, patch: Partial<Transactions.ImportRowState>) => void;
}

function RecurrencePopover({ row, index, disabled, onChange }: RecurrencePopoverProps) {
  const [opened, setOpened] = useState(false);
  const countInputRef = useRef<HTMLInputElement>(null);

  function recurrenceSummary() {
    if (!row.recurrence_type) return "Parcelamento";
    const typeLabel =
      RECURRENCE_TYPE_OPTIONS.find((o) => o.value === row.recurrence_type)
        ?.label ?? row.recurrence_type;
    const count = row.recurrence_count ? `${row.recurrence_count}x ` : "";
    return `${count}(${typeLabel})`;
  }

  function handleTypeChange(val: string | null) {
    onChange(index, {
      recurrence_type: (val as Transactions.RecurrenceType | null) ?? null,
      recurrence_count: val ? (row.recurrence_count ?? 1) : null,
    });
    if (val) {
      // Stay open and focus quantity input
      setTimeout(() => countInputRef.current?.focus(), 50);
    }
  }

  return (
    <Popover opened={opened} onChange={setOpened} withinPortal>
      <Popover.Target>
        <Button
          size="xs"
          variant="default"
          disabled={disabled}
          fullWidth
          onClick={() => setOpened(true)}
        >
          {recurrenceSummary()}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={200}>
          <Select
            label="Tipo"
            size="xs"
            data={RECURRENCE_TYPE_OPTIONS}
            value={row.recurrence_type ?? null}
            onChange={handleTypeChange}
            clearable
            withCheckIcon={false}
            comboboxProps={{ withinPortal: false }}
          />
          {row.recurrence_type && (
            <NumberInput
              ref={countInputRef}
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
      </Popover.Dropdown>
    </Popover>
  );
}

// ─── Split popover ─────────────────────────────────────────────────────────────

interface SplitPopoverProps {
  row: Transactions.ImportRowState;
  index: number;
  disabled: boolean;
  onChange: (index: number, patch: Partial<Transactions.ImportRowState>) => void;
  sharedAccountOptions: { value: string; label: string }[];
  summary: string;
}

function SplitPopover({
  row,
  index,
  disabled,
  onChange,
  sharedAccountOptions,
  summary,
}: SplitPopoverProps) {
  const [opened, setOpened] = useState(false);

  const current = row.split_settings?.[0] ?? null;
  const connectionId = current ? String(current.connection_id) : null;
  const percentage = current?.percentage ?? 50;

  function handleConnectionChange(val: string | null) {
    if (!val) {
      onChange(index, { split_settings: null });
      return;
    }
    onChange(index, {
      split_settings: [{ connection_id: Number(val), percentage }],
    });
  }

  function handlePercentageChange(val: number | string) {
    if (typeof val !== "number" || !connectionId) return;
    onChange(index, {
      split_settings: [{ connection_id: Number(connectionId), percentage: val }],
    });
  }

  return (
    <Popover opened={opened} onChange={setOpened} withinPortal>
      <Popover.Target>
        <Button
          size="xs"
          variant={current ? "light" : "default"}
          disabled={disabled}
          fullWidth
          onClick={() => setOpened(true)}
        >
          {summary}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={220}>
          <Select
            label="Dividir com"
            size="xs"
            data={sharedAccountOptions}
            value={connectionId}
            onChange={handleConnectionChange}
            clearable
            placeholder="Nenhum"
            withCheckIcon={false}
            comboboxProps={{ withinPortal: false }}
          />
          {connectionId && (
            <NumberInput
              label="Percentual do parceiro (%)"
              size="xs"
              min={1}
              max={99}
              suffix="%"
              value={percentage}
              onChange={handlePercentageChange}
            />
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
