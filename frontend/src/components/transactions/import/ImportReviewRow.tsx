import { forwardRef, memo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Loader,
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
import { useFormContext, useWatch, Controller } from "react-hook-form";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { Transactions } from "@/types/transactions";
import { parseDate, localDateStr } from "@/utils/parseDate";
import { CurrencyInput } from "@/components/transactions/form/CurrencyInput";
import { RecurrenceFields } from "@/components/transactions/form/RecurrenceFields";
import { SplitSettingsFields } from "@/components/transactions/form/SplitSettingsFields";
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

const RECURRENCE_TYPE_LABELS: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

interface Props {
  rowIndex: number;
  selected: boolean;
  disabled: boolean;
  onToggleSelect: (index: number) => void;
}

export const ImportReviewRow = memo(
  forwardRef<HTMLTableRowElement, Props>(function ImportReviewRow(
    { rowIndex, selected, disabled, onToggleSelect },
    ref
  ) {
    const namePrefix = `rows.${rowIndex}.` as const;
    const form = useFormContext<Transactions.ImportFormValues>();

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

    const sharedAccounts = accounts.filter(
      (a) => a.user_connection?.connection_status === "accepted"
    );

    // Watch only the fields we need for this row
    const action = useWatch({ name: `rows.${rowIndex}.action` }) as Transactions.ImportRowAction;
    const importStatus = useWatch({ name: `rows.${rowIndex}.import_status` }) as string;
    const importError = useWatch({ name: `rows.${rowIndex}.import_error` }) as string;
    const parseErrors = useWatch({ name: `rows.${rowIndex}.parse_errors` }) as string[];
    const transactionType = useWatch({ name: `rows.${rowIndex}.transaction_type` }) as Transactions.TransactionType;
    const date = useWatch({ name: `rows.${rowIndex}.date` }) as string;
    const description = useWatch({ name: `rows.${rowIndex}.description` }) as string;
    const amount = useWatch({ name: `rows.${rowIndex}.amount` }) as number;
    const destinationAccountId = useWatch({ name: `rows.${rowIndex}.destination_account_id` }) as number | null;
    const splitSettings = useWatch({ name: `rows.${rowIndex}.split_settings` }) as Transactions.SplitSetting[];
    const recurrenceType = useWatch({ name: `rows.${rowIndex}.recurrenceType` }) as Transactions.RecurrenceType | null;
    const recurrenceRepetitions = useWatch({ name: `rows.${rowIndex}.recurrenceRepetitions` }) as number | null;

    const isSkipped = action !== "import";
    const isTransfer = transactionType === "transfer";

    function rowClass() {
      if (action === "duplicate") return classes.rowDuplicate;
      if (isSkipped) return classes.rowSkipped;
      return undefined;
    }

    function recurrenceSummary() {
      if (!recurrenceType) return "Parcelamento";
      const label = RECURRENCE_TYPE_LABELS[recurrenceType] ?? recurrenceType;
      return recurrenceRepetitions ? `${recurrenceRepetitions}x (${label})` : label;
    }

    function splitSummary() {
      if (!splitSettings?.length) return "Sem divisão";
      const s = splitSettings[0];
      const acct = sharedAccounts.find((a) => a.user_connection?.id === s.connection_id);
      const label = acct?.name ?? `#${s.connection_id}`;
      if (s.percentage != null) return `${s.percentage}% — ${label}`;
      if (s.amount != null) return `R$${(s.amount / 100).toFixed(2)} — ${label}`;
      return label;
    }

    const statusCell = () => {
      if (importStatus === "loading") return <Loader size="xs" />;
      if (importStatus === "success")
        return <IconCheck size={16} color="var(--mantine-color-green-6)" />;
      if (importStatus === "error") {
        return (
          <Tooltip label={importError ?? "Erro ao importar"} withArrow>
            <IconX size={16} color="var(--mantine-color-red-6)" />
          </Tooltip>
        );
      }
      if (parseErrors?.length) {
        return (
          <Tooltip
            label={parseErrors.join("; ")}
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
      <Table.Tr ref={ref} className={rowClass()} data-row-index={rowIndex}>
        {/* Checkbox */}
        <Table.Td>
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelect(rowIndex)}
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
          <Controller
            name={`rows.${rowIndex}.date`}
            render={({ field }) => (
              <DatePickerInput
                size="xs"
                valueFormat="DD/MM/YYYY"
                value={field.value ? parseDate(field.value as string) : null}
                onChange={(d) => field.onChange(d ? localDateStr(d) : "")}
                disabled={disabled || isSkipped}
                error={!date && action === "import" ? "Obrigatório" : undefined}
                popoverProps={{ withinPortal: true }}
              />
            )}
          />
        </Table.Td>

        {/* Description */}
        <Table.Td miw={160}>
          <Controller
            name={`rows.${rowIndex}.description`}
            render={({ field }) => (
              <TextInput
                size="xs"
                value={field.value as string}
                onChange={field.onChange}
                disabled={disabled || isSkipped}
                error={!description && action === "import" ? "Obrigatório" : undefined}
              />
            )}
          />
        </Table.Td>

        {/* Amount */}
        <Table.Td miw={120}>
          <Controller
            name={`rows.${rowIndex}.amount`}
            render={({ field }) => (
              <CurrencyInput
                value={field.value as number}
                onChange={field.onChange}
                error={!amount && action === "import" ? "Obrigatório" : undefined}
              />
            )}
          />
        </Table.Td>

        {/* Type */}
        <Table.Td miw={120}>
          <Controller
            name={`rows.${rowIndex}.transaction_type`}
            render={({ field }) => (
              <Select
                size="xs"
                data={TRANSACTION_TYPE_OPTIONS}
                value={field.value as string}
                onChange={(val) => {
                  field.onChange(val)
                  form.setValue(`rows.${rowIndex}.category_id`, null)
                  form.setValue(`rows.${rowIndex}.destination_account_id`, null)
                }}
                disabled={disabled || isSkipped}
                withCheckIcon={false}
              />
            )}
          />
        </Table.Td>

        {/* Category (hidden for transfers) */}
        <Table.Td miw={140}>
          {!isTransfer ? (
            <Controller
              name={`rows.${rowIndex}.category_id`}
              render={({ field }) => (
                <Select
                  size="xs"
                  data={categoryOptions}
                  value={field.value ? String(field.value) : null}
                  onChange={(val) => field.onChange(val ? Number(val) : null)}
                  disabled={disabled || isSkipped}
                  searchable
                  clearable
                  placeholder="Selecionar..."
                  withCheckIcon={false}
                />
              )}
            />
          ) : (
            <Text fz="xs" c="dimmed">—</Text>
          )}
        </Table.Td>

        {/* Destination account (only for transfers) */}
        <Table.Td miw={140}>
          {isTransfer ? (
            <Controller
              name={`rows.${rowIndex}.destination_account_id`}
              render={({ field }) => (
                <Select
                  size="xs"
                  data={accountOptions}
                  value={field.value ? String(field.value) : null}
                  onChange={(val) => field.onChange(val ? Number(val) : null)}
                  disabled={disabled || isSkipped}
                  searchable
                  placeholder="Selecionar..."
                  withCheckIcon={false}
                  error={!destinationAccountId && action === "import" ? "Obrigatório" : undefined}
                />
              )}
            />
          ) : (
            <Text fz="xs" c="dimmed">—</Text>
          )}
        </Table.Td>

        {/* Recurrence */}
        <Table.Td miw={130}>
          <RecurrencePopover
            namePrefix={namePrefix}
            summary={recurrenceSummary()}
            hasRecurrence={!!recurrenceType}
            disabled={disabled || isSkipped}
          />
        </Table.Td>

        {/* Split */}
        <Table.Td miw={140}>
          {!isTransfer && sharedAccounts.length > 0 ? (
            <SplitPopover
              namePrefix={namePrefix}
              summary={splitSummary()}
              hasSplit={!!splitSettings?.length}
              disabled={disabled || isSkipped}
            />
          ) : (
            <Text fz="xs" c="dimmed">—</Text>
          )}
        </Table.Td>

        {/* Action — last */}
        <Table.Td miw={120}>
          <Controller
            name={`rows.${rowIndex}.action`}
            render={({ field }) => (
              <Select
                size="xs"
                data={ACTION_OPTIONS}
                value={field.value as string}
                onChange={field.onChange}
                disabled={disabled}
                withCheckIcon={false}
              />
            )}
          />
        </Table.Td>
      </Table.Tr>
    );
  })
);

// ─── RecurrencePopover ────────────────────────────────────────────────────────

interface RecurrencePopoverProps {
  namePrefix: string;
  summary: string;
  hasRecurrence: boolean;
  disabled: boolean;
}

function RecurrencePopover({ namePrefix, summary, hasRecurrence, disabled }: RecurrencePopoverProps) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      closeOnClickOutside={false}
      withinPortal
    >
      <Popover.Target>
        <Button
          size="xs"
          variant={hasRecurrence ? "light" : "default"}
          disabled={disabled}
          fullWidth
          onClick={() => setOpened((o) => !o)}
        >
          {summary}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={220}>
          <RecurrenceFields
            namePrefix={namePrefix}
            comboboxWithinPortal={false}
          />
          <Button size="xs" variant="subtle" onClick={() => setOpened(false)}>
            Fechar
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

// ─── SplitPopover ─────────────────────────────────────────────────────────────

interface SplitPopoverProps {
  namePrefix: string;
  summary: string;
  hasSplit: boolean;
  disabled: boolean;
}

function SplitPopover({ namePrefix, summary, hasSplit, disabled }: SplitPopoverProps) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      closeOnClickOutside={false}
      withinPortal
    >
      <Popover.Target>
        <Button
          size="xs"
          variant={hasSplit ? "light" : "default"}
          disabled={disabled}
          fullWidth
          onClick={() => setOpened((o) => !o)}
        >
          {summary}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={260}>
          <SplitSettingsFields
            namePrefix={namePrefix}
            comboboxWithinPortal={false}
          />
          <Button size="xs" variant="subtle" onClick={() => setOpened(false)}>
            Fechar
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
