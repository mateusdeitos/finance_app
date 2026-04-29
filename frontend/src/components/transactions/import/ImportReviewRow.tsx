import { forwardRef, memo } from "react";
import { ActionIcon, Box, Button, Checkbox, Group, Loader, Popover, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconAlertCircle, IconCheck, IconPlus, IconX } from "@tabler/icons-react";
import { useFormContext, useWatch, Controller, useForm, FormProvider } from "react-hook-form";
import { useFlattenCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useDuplicateTransactionCheck } from "@/hooks/import/useDuplicateTransactionCheck";
import { Transactions } from "@/types/transactions";
import { type ImportFormValues, type ImportRowFormValues } from "@/components/transactions/form/importFormSchema";
import { parseDate, localDateStr } from "@/utils/parseDate";
import { CurrencyInput } from "@/components/transactions/form/CurrencyInput";
import { RecurrenceFields } from "@/components/transactions/form/RecurrenceFields";
import classes from "./ImportReviewRow.module.css";
import { SplitPopover } from "./SplitPopover";
import { useSplitSummary } from "@/hooks/import/useSplitSummary";
import { renderDrawer } from "@/utils/renderDrawer";
import { CreateCategoryDrawer } from "./CreateCategoryDrawer";
import { AccountDrawer } from "@/components/accounts/AccountDrawer";
import { ImportTestIds, type ImportRowAction, type ImportRowTransactionType } from '@/testIds'

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
  onToggleSelect: (index: number, shiftKey: boolean) => void;
}

export const ImportReviewRow = memo(
  forwardRef<HTMLTableRowElement, Props>(function ImportReviewRow(
    { rowIndex, selected, disabled, onToggleSelect },
    ref,
  ) {
    const namePrefix = `rows.${rowIndex}.` as const;
    const form = useFormContext<ImportFormValues>();

    const { query: categoriesQuery } = useFlattenCategories();
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

    const sharedAccounts = accounts.filter((a) => a.user_connection?.connection_status === "accepted");

    const [
      action,
      transactionType,
      recurrenceType,
      recurrenceTotalInstallments,
      splitSettings,
      importStatus,
      importError,
      parseErrors,
      date,
      description,
      amount,
    ] = useWatch({
      control: form.control,
      name: [
        `rows.${rowIndex}.action`,
        `rows.${rowIndex}.transaction_type`,
        `rows.${rowIndex}.recurrenceType`,
        `rows.${rowIndex}.recurrenceTotalInstallments`,
        `rows.${rowIndex}.split_settings`,
        `rows.${rowIndex}.import_status`,
        `rows.${rowIndex}.import_error`,
        `rows.${rowIndex}.parse_errors`,
        `rows.${rowIndex}.date`,
        `rows.${rowIndex}.description`,
        `rows.${rowIndex}.amount`,
      ],
    });

    // ─── Duplicate re-detection ─────────────────────────────────────────────────

    useDuplicateTransactionCheck({
      date: date as string,
      amount: amount as number,
      accountId: form.getValues("accountId"),
      getCurrentAction: () => form.getValues(`rows.${rowIndex}.action`),
      setAction: (next) => form.setValue(`rows.${rowIndex}.action`, next),
    });

    const rowErrors = form.formState.errors.rows?.[rowIndex];

    // ─── Display helpers ────────────────────────────────────────────────────────

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
      return recurrenceTotalInstallments ? `${recurrenceTotalInstallments}x (${label})` : label;
    }

    const splitSummary = useSplitSummary(splitSettings);

    const statusCell = () => {
      if (importStatus === "loading") return <Loader size="xs" />;
      if (importStatus === "success") return <IconCheck size={16} color="var(--mantine-color-green-6)" />;
      if (importStatus === "error") {
        return (
          <Tooltip label={importError ?? "Erro ao importar"} withArrow>
            <IconX size={16} color="var(--mantine-color-red-6)" />
          </Tooltip>
        );
      }
      if (parseErrors?.length) {
        return (
          <Tooltip label={parseErrors.join("; ")} withArrow multiline maw={300}>
            <IconAlertCircle size={16} color="var(--mantine-color-orange-6)" />
          </Tooltip>
        );
      }
      return null;
    };

    return (
      <Table.Tr ref={ref} className={rowClass()} data-row-index={rowIndex} data-testid={ImportTestIds.Row(rowIndex)}>
        {/* Checkbox */}
        <Table.Td style={{ cursor: "pointer" }}>
          <Checkbox
            styles={{ input: { cursor: "pointer" } }}
            checked={selected}
            onClick={(e) => onToggleSelect(rowIndex, e.shiftKey)}
            disabled={disabled}
            size="xs"
            data-testid={ImportTestIds.RowCheckbox(rowIndex)}
          />
        </Table.Td>

        {/* Status */}
        <Table.Td>
          <Box
            className={classes.statusIcon}
            data-testid={ImportTestIds.RowStatus(rowIndex)}
            data-status={importStatus}
          >
            {statusCell()}
          </Box>
        </Table.Td>

        {/* Date */}
        <Table.Td miw={130}>
          <Controller
            name={`rows.${rowIndex}.date`}
            render={({ field }) => (
              <DatePickerInput
                ref={field.ref}
                size="xs"
                valueFormat="DD/MM/YYYY"
                value={field.value ? parseDate(field.value as string) : null}
                onChange={(d) => field.onChange(d ? localDateStr(d) : "")}
                disabled={disabled || isSkipped}
                error={rowErrors?.date?.message}
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
                ref={field.ref}
                size="xs"
                value={field.value as string}
                onChange={field.onChange}
                disabled={disabled || isSkipped}
                error={rowErrors?.description?.message}
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
                ref={field.ref}
                value={field.value as number}
                onChange={field.onChange}
                error={rowErrors?.amount?.message}
                disabled={disabled || isSkipped}
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
                ref={field.ref}
                size="xs"
                data={TRANSACTION_TYPE_OPTIONS}
                value={field.value as string}
                onChange={(val) => {
                  field.onChange(val);
                  form.setValue(`rows.${rowIndex}.category_id`, null);
                  form.setValue(`rows.${rowIndex}.destination_account_id`, null);
                }}
                disabled={disabled || isSkipped}
                withCheckIcon={false}
                renderOption={({ option }) => (
                  <span
                    data-testid={ImportTestIds.RowOptionTransactionType(
                      rowIndex,
                      option.value as ImportRowTransactionType,
                    )}
                  >
                    {option.label}
                  </span>
                )}
                data-testid={ImportTestIds.RowSelectTransactionType(rowIndex)}
              />
            )}
          />
        </Table.Td>

        {/* Category (hidden for transfers) */}
        <Table.Td miw={140}>
          {!isTransfer ? (
            <Group gap={4} wrap="nowrap">
              <Controller
                name={`rows.${rowIndex}.category_id`}
                render={({ field }) => (
                  <Select
                    ref={field.ref}
                    size="xs"
                    data={categoryOptions}
                    error={rowErrors?.category_id?.message}
                    value={field.value ? String(field.value) : null}
                    onChange={(val) => field.onChange(val ? Number(val) : null)}
                    disabled={disabled || isSkipped}
                    searchable
                    clearable
                    placeholder="Selecionar..."
                    withCheckIcon={false}
                    renderOption={({ option }) => (
                      <span data-testid={ImportTestIds.RowOptionCategory(rowIndex, option.value)}>
                        {option.label}
                      </span>
                    )}
                    data-testid={ImportTestIds.RowSelectCategory(rowIndex)}
                    style={{ flex: 1 }}
                  />
                )}
              />
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  renderDrawer<import("@/types/transactions").Transactions.Category | void>(() => <CreateCategoryDrawer />)
                    .then((created) => {
                      if (created) form.setValue(`rows.${rowIndex}.category_id`, created.id);
                    })
                    .catch(() => {});
                }}
                disabled={disabled || isSkipped}
                aria-label="Criar categoria"
                data-testid={ImportTestIds.RowBtnCreateCategory(rowIndex)}
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Group>
          ) : (
            <Text fz="xs" c="dimmed">
              —
            </Text>
          )}
        </Table.Td>

        {/* Destination account (only for transfers) */}
        <Table.Td miw={140}>
          {isTransfer ? (
            <Group gap={4} wrap="nowrap">
              <Controller
                name={`rows.${rowIndex}.destination_account_id`}
                render={({ field }) => (
                  <Select
                    ref={field.ref}
                    size="xs"
                    data={accountOptions}
                    value={field.value ? String(field.value) : null}
                    onChange={(val) => field.onChange(val ? Number(val) : null)}
                    disabled={disabled || isSkipped}
                    searchable
                    placeholder="Selecionar..."
                    withCheckIcon={false}
                    error={rowErrors?.destination_account_id?.message}
                    renderOption={({ option }) => (
                      <span
                        data-testid={ImportTestIds.RowOptionDestinationAccount(rowIndex, option.value)}
                      >
                        {option.label}
                      </span>
                    )}
                    data-testid={ImportTestIds.RowSelectDestinationAccount(rowIndex)}
                    style={{ flex: 1 }}
                  />
                )}
              />
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  renderDrawer<import("@/types/transactions").Transactions.Account | void>(() => <AccountDrawer />)
                    .then((created) => {
                      if (created) form.setValue(`rows.${rowIndex}.destination_account_id`, created.id);
                    })
                    .catch(() => {});
                }}
                disabled={disabled || isSkipped}
                aria-label="Criar conta"
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Group>
          ) : (
            <Text fz="xs" c="dimmed">
              —
            </Text>
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
              summary={splitSummary}
              hasSplit={!!splitSettings?.length}
              disabled={disabled || isSkipped}
              rowAmount={amount as number}
              rowIndex={rowIndex}
            />
          ) : (
            <Text fz="xs" c="dimmed">
              —
            </Text>
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
                renderOption={({ option }) => (
                  <span
                    data-testid={ImportTestIds.RowOptionAction(
                      rowIndex,
                      option.value as ImportRowAction,
                    )}
                  >
                    {option.label}
                  </span>
                )}
                data-testid={ImportTestIds.RowSelectAction(rowIndex)}
              />
            )}
          />
        </Table.Td>
      </Table.Tr>
    );
  }),
);

// ─── RecurrencePopover ────────────────────────────────────────────────────────

interface RecurrenceLocalValues {
  recurrenceType: Transactions.RecurrenceType | null;
  recurrenceCurrentInstallment: number | null;
  recurrenceTotalInstallments: number | null;
}

interface RecurrencePopoverProps {
  namePrefix: string;
  summary: string;
  hasRecurrence: boolean;
  disabled: boolean;
}

function RecurrencePopover({ namePrefix, summary, hasRecurrence, disabled }: RecurrencePopoverProps) {
  const parentForm = useFormContext<ImportFormValues>();

  const localForm = useForm<RecurrenceLocalValues>({
    defaultValues: {
      recurrenceType: null,
      recurrenceCurrentInstallment: null,
      recurrenceTotalInstallments: null,
    },
  });

  function handleOpen() {
    const rowPath = namePrefix.slice(0, -1); // "rows.0." → "rows.0"
    // Dynamic path: RHF cannot statically prove rowPath points to a row; the
    // caller (the component owning namePrefix) guarantees it.
    const rowValues = parentForm.getValues(rowPath as `rows.${number}`) as ImportRowFormValues;
    localForm.reset({
      recurrenceType: rowValues.recurrenceType ?? null,
      recurrenceCurrentInstallment: rowValues.recurrenceCurrentInstallment ?? null,
      recurrenceTotalInstallments: rowValues.recurrenceTotalInstallments ?? null,
    });
  }

  function handleClose() {
    const values = localForm.getValues();
    const rowPath = namePrefix.slice(0, -1);
    // Sync recurrenceEnabled so buildPayload includes the settings in the import payload.
    parentForm.setValue(
      `${rowPath}.recurrenceEnabled` as `rows.${number}.recurrenceEnabled`,
      values.recurrenceType != null,
    );
    parentForm.setValue(
      `${rowPath}.recurrenceType` as `rows.${number}.recurrenceType`,
      values.recurrenceType,
    );
    parentForm.setValue(
      `${rowPath}.recurrenceCurrentInstallment` as `rows.${number}.recurrenceCurrentInstallment`,
      values.recurrenceCurrentInstallment,
    );
    parentForm.setValue(
      `${rowPath}.recurrenceTotalInstallments` as `rows.${number}.recurrenceTotalInstallments`,
      values.recurrenceTotalInstallments,
    );
  }

  const rowIdx = namePrefix.match(/rows\.(\d+)\./)?.[1] ?? '0';

  return (
    <FormProvider {...localForm}>
      <Popover trapFocus withinPortal onOpen={handleOpen} onClose={handleClose}>
        <Popover.Target>
          <Button
            size="xs"
            variant={hasRecurrence ? "light" : "default"}
            disabled={disabled}
            fullWidth
            data-testid={ImportTestIds.RowBtnRecurrencePopover(Number(rowIdx))}
          >
            {summary}
          </Button>
        </Popover.Target>
        <Popover.Dropdown data-testid={ImportTestIds.RecurrencePopoverDropdown(Number(rowIdx))}>
          <Stack gap="xs" w={300}>
            <RecurrenceFields namePrefix="" comboboxWithinPortal={false} />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </FormProvider>
  );
}
