import { forwardRef, memo } from "react";
import { ActionIcon, Box, Button, Checkbox, Group, Loader, Popover, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconAlertCircle, IconAlertTriangle, IconCheck, IconPlus, IconX } from "@tabler/icons-react";
import { useFormContext, useWatch, Controller, useForm, FormProvider } from "react-hook-form";
import { useCategoryOptions, useAccountOptions, usePersonalAccountOptions, useSharedAccounts } from "@/hooks/import/useImportOptions";
import { useDuplicateTransactionCheck } from "@/hooks/import/useDuplicateTransactionCheck";
import { Transactions } from "@/types/transactions";
import { type ImportFormValues, type ImportRowFormValues } from "@/components/transactions/form/importFormSchema";
import { CurrencyInput } from "@/components/transactions/form/CurrencyInput";
import { RecurrenceFields } from "@/components/transactions/form/RecurrenceFields";
import classes from "./ImportReviewRow.module.css";
import { SplitPopover } from "./SplitPopover";
import { useSplitSummary } from "@/hooks/import/useSplitSummary";
import { renderDrawer } from "@/utils/renderDrawer";
import { CreateCategoryDrawer } from "./CreateCategoryDrawer";
import { DuplicateTransactionsDrawer } from "./DuplicateTransactionsDrawer";
import { AccountDrawer } from "@/components/accounts/AccountDrawer";
import { useSelectionStore } from "./selectionStore";
import { ImportTestIds, type ImportRowAction, type ImportRowTransactionType } from '@/testIds'

const TRANSACTION_TYPE_OPTIONS = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

const ACTION_OPTIONS = [
  { value: "import", label: "Importar" },
  { value: "skip", label: "Não importar" },
];

const RECURRENCE_TYPE_LABELS: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

interface Props {
  rowIndex: number;
  fieldId: string;
  disabled: boolean;
  onToggleSelect: (index: number, shiftKey: boolean) => void;
}

export const ImportReviewRow = memo(
  forwardRef<HTMLTableRowElement, Props>(function ImportReviewRow(
    { rowIndex, fieldId, disabled, onToggleSelect },
    ref,
  ) {
    const namePrefix = `rows.${rowIndex}.` as const;
    const form = useFormContext<ImportFormValues>();

    const selected = useSelectionStore((s) => s.selected.has(fieldId));
    const categoryOptions = useCategoryOptions();
    const accountOptions = useAccountOptions();
    const personalAccountOptions = usePersonalAccountOptions();
    const sharedAccounts = useSharedAccounts();

    const [
      action,
      transactionType,
      recurrenceType,
      recurrenceTotalInstallments,
      recurrenceCurrentInstallment,
      splitSettings,
      importStatus,
      importError,
      parseErrors,
      sourceAccountId,
      destinationAccountId,
      duplicateMatches,
      settlementMatches,
    ] = useWatch({
      control: form.control,
      name: [
        `rows.${rowIndex}.action`,
        `rows.${rowIndex}.transaction_type`,
        `rows.${rowIndex}.recurrenceType`,
        `rows.${rowIndex}.recurrenceTotalInstallments`,
        `rows.${rowIndex}.recurrenceCurrentInstallment`,
        `rows.${rowIndex}.split_settings`,
        `rows.${rowIndex}.import_status`,
        `rows.${rowIndex}.import_error`,
        `rows.${rowIndex}.parse_errors`,
        `rows.${rowIndex}.account_id`,
        `rows.${rowIndex}.destination_account_id`,
        `rows.${rowIndex}.duplicate_matches`,
        `rows.${rowIndex}.settlement_matches`,
      ],
    });

    const rowErrors = form.formState.errors.rows?.[rowIndex];

    // ─── Display helpers ────────────────────────────────────────────────────────

    const isSkipped = action !== "import";
    const isTransfer = transactionType === "transfer";
    // Splits create a settlement on a connection account, so the main
    // transaction must live on a private account. When the row already
    // targets a shared account, the split option is not applicable.
    const isSharedAccount = sharedAccounts.some((a) => a.id === sourceAccountId);

    function rowClass() {
      if (isSkipped) return classes.rowSkipped;
      return undefined;
    }

    function openDuplicatesDrawer() {
      const row = form.getValues(`rows.${rowIndex}`);
      const criteria = form.getValues("duplicate_criteria");
      void renderDrawer<"skip" | void>(() => (
        <DuplicateTransactionsDrawer
          row={{ date: row.date, description: row.description, amount: row.amount }}
          matches={row.duplicate_matches ?? []}
          settlementMatches={row.settlement_matches ?? []}
          criteria={criteria ?? undefined}
        />
      ))
        .then((result) => {
          if (result === "skip") form.setValue(`rows.${rowIndex}.action`, "skip");
        })
        .catch(() => {});
    }

    function recurrenceSummary() {
      if (!recurrenceType) return "Parcelamento";
      const label = RECURRENCE_TYPE_LABELS[recurrenceType] ?? recurrenceType;
      if (recurrenceCurrentInstallment && recurrenceTotalInstallments) {
        return `${recurrenceCurrentInstallment} de ${recurrenceTotalInstallments} (${label})`;
      }
      return recurrenceTotalInstallments ? `${recurrenceTotalInstallments} (${label})` : label;
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
      if (duplicateMatches?.length || settlementMatches?.length) {
        return (
          <Tooltip label="Possível duplicidade detectada" withArrow>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="orange"
              onClick={openDuplicatesDrawer}
              aria-label="Possível duplicidade detectada"
              data-testid={ImportTestIds.RowDuplicateWarning(rowIndex)}
            >
              <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" />
            </ActionIcon>
          </Tooltip>
        );
      }
      return null;
    };

    return (
      <Table.Tr ref={ref} className={rowClass()} data-row-index={rowIndex} data-testid={ImportTestIds.Row(rowIndex)}>
        <RowDuplicateCheck rowIndex={rowIndex} />
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
                value={(field.value as string) || null}
                onChange={(d) => field.onChange(d ?? "")}
                disabled={disabled || isSkipped}
                error={rowErrors?.date?.message}
                popoverProps={{ withinPortal: true }}
                data-testid={ImportTestIds.RowInputDate(rowIndex)}
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
                title={(field.value as string) || undefined}
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
                data-testid={ImportTestIds.RowInputAmount(rowIndex)}
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
                    title={categoryOptions.find((o) => o.value === String(field.value))?.label}
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

        {/* Source + Destination accounts (only for transfers) */}
        <Table.Td miw={180}>
          {isTransfer ? (
            <Stack gap={4}>
              <Controller
                name={`rows.${rowIndex}.account_id`}
                render={({ field }) => (
                  <Select
                    ref={field.ref}
                    size="xs"
                    data={personalAccountOptions.filter(
                      (o) => !destinationAccountId || o.value !== String(destinationAccountId),
                    )}
                    value={field.value ? String(field.value) : null}
                    onChange={(val) => field.onChange(val ? Number(val) : null)}
                    disabled={disabled || isSkipped}
                    searchable
                    placeholder="Conta de origem..."
                    title={personalAccountOptions.find((o) => o.value === String(field.value))?.label}
                    withCheckIcon={false}
                    error={rowErrors?.account_id?.message}
                    renderOption={({ option }) => (
                      <span
                        data-testid={ImportTestIds.RowOptionSourceAccount(rowIndex, option.value)}
                      >
                        {option.label}
                      </span>
                    )}
                    data-testid={ImportTestIds.RowSelectSourceAccount(rowIndex)}
                  />
                )}
              />
              <Group gap={4} wrap="nowrap">
                <Controller
                  name={`rows.${rowIndex}.destination_account_id`}
                  render={({ field }) => (
                    <Select
                      ref={field.ref}
                      size="xs"
                      data={accountOptions.filter(
                        (o) => !sourceAccountId || o.value !== String(sourceAccountId),
                      )}
                      value={field.value ? String(field.value) : null}
                      onChange={(val) => field.onChange(val ? Number(val) : null)}
                      disabled={disabled || isSkipped}
                      searchable
                      placeholder="Conta de destino..."
                      title={accountOptions.find((o) => o.value === String(field.value))?.label}
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
            </Stack>
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
          {!isTransfer && !isSharedAccount && sharedAccounts.length > 0 ? (
            <SplitPopover
              namePrefix={namePrefix}
              summary={splitSummary}
              hasSplit={!!splitSettings?.length}
              disabled={disabled || isSkipped}
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
      // Default the type to monthly when the row has no recurrence yet, so the
      // user only needs to fill in the installment counts.
      recurrenceType: rowValues.recurrenceType ?? "monthly",
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

// ─── RowDuplicateCheck ────────────────────────────────────────────────────────
// Subscribes to date/amount/description for a single row and re-runs the
// duplicate check, writing the result into the row's `duplicate_matches`.
// Returns null so it adds no DOM. Lives as a sibling of the row's table cells
// so field keystrokes do NOT re-render the row outer.

function RowDuplicateCheck({ rowIndex }: { rowIndex: number }) {
  const form = useFormContext<ImportFormValues>();
  const [date, amount, description, type, action] = useWatch({
    control: form.control,
    name: [
      `rows.${rowIndex}.date`,
      `rows.${rowIndex}.amount`,
      `rows.${rowIndex}.description`,
      `rows.${rowIndex}.transaction_type`,
      `rows.${rowIndex}.action`,
    ],
  });

  useDuplicateTransactionCheck({
    date: date as string,
    amount: amount as number,
    description: description as string,
    type: type as Transactions.TransactionType,
    accountId: form.getValues("accountId"),
    enabled: action === "import",
    onResult: ({ matches, settlement_matches }) => {
      form.setValue(`rows.${rowIndex}.duplicate_matches`, matches);
      form.setValue(`rows.${rowIndex}.settlement_matches`, settlement_matches);
    },
  });

  return null;
}
