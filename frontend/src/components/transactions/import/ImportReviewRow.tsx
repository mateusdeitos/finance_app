import { forwardRef, memo, useEffect, useRef } from "react";
import { ActionIcon, Box, Button, Checkbox, Group, Loader, Popover, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { DatePickerInput } from "@mantine/dates";
import { IconAlertCircle, IconCheck, IconPlus, IconX } from "@tabler/icons-react";
import { useFormContext, useWatch, Controller, useForm, FormProvider } from "react-hook-form";
import { useFlattenCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { Transactions } from "@/types/transactions";
import { type ImportFormValues } from "@/components/transactions/form/importFormSchema";
import { parseDate, localDateStr } from "@/utils/parseDate";
import { CurrencyInput } from "@/components/transactions/form/CurrencyInput";
import { RecurrenceFields } from "@/components/transactions/form/RecurrenceFields";
import { checkDuplicateTransaction } from "@/api/transactions";
import classes from "./ImportReviewRow.module.css";
import { SplitPopover } from "./SplitPopover";
import { useSplitSummary } from "@/hooks/import/useSplitSummary";
import { renderDrawer } from "@/utils/renderDrawer";
import { CreateCategoryDrawer } from "./CreateCategoryDrawer";
import { AccountDrawer } from "@/components/accounts/AccountDrawer";

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

    const [debouncedDate] = useDebouncedValue(date, 500);
    const [debouncedDescription] = useDebouncedValue(description, 500);
    const [debouncedAmount] = useDebouncedValue(amount, 500);

    // Skip duplicate check on initial mount (backend already checked)
    const isFirstRender = useRef(true);
    useEffect(() => {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }
      if (!debouncedDate || !debouncedDescription || !debouncedAmount || debouncedAmount <= 0) return;
      void checkDuplicateTransaction({
        date: debouncedDate as string,
        description: debouncedDescription as string,
        amount: debouncedAmount as number,
        account_id: form.getValues("accountId"),
      })
        .then((result) => {
          const currentAction = form.getValues(`rows.${rowIndex}.action`);
          if (result.is_duplicate && currentAction === "import") {
            form.setValue(`rows.${rowIndex}.action`, "duplicate");
          } else if (!result.is_duplicate && currentAction === "duplicate") {
            form.setValue(`rows.${rowIndex}.action`, "import");
          }
        })
        .catch(() => {
          /* ignore network errors */
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedDate, debouncedDescription, debouncedAmount]);

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
      <Table.Tr ref={ref} className={rowClass()} data-row-index={rowIndex} data-testid={`import_row_${rowIndex}`}>
        {/* Checkbox */}
        <Table.Td style={{ cursor: "pointer" }}>
          <Checkbox
            styles={{ input: { cursor: "pointer" } }}
            checked={selected}
            onClick={(e) => onToggleSelect(rowIndex, e.shiftKey)}
            disabled={disabled}
            size="xs"
          />
        </Table.Td>

        {/* Status */}
        <Table.Td>
          <Box className={classes.statusIcon} data-testid={`import_status_${rowIndex}`}>
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
                    data-testid={`select_category_${rowIndex}`}
                    style={{ flex: 1 }}
                  />
                )}
              />
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => void renderDrawer(() => <CreateCategoryDrawer />)}
                disabled={disabled || isSkipped}
                aria-label="Criar categoria"
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
                data-testid={`select_import_action_${rowIndex}`}
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parentForm = useFormContext<any>();

  const localForm = useForm<RecurrenceLocalValues>({
    defaultValues: {
      recurrenceType: null,
      recurrenceCurrentInstallment: null,
      recurrenceTotalInstallments: null,
    },
  });

  function handleOpen() {
    const rowPath = namePrefix.slice(0, -1); // "rows.0." → "rows.0"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowValues = parentForm.getValues(rowPath) as any;
    localForm.reset({
      recurrenceType: rowValues.recurrenceType ?? null,
      recurrenceCurrentInstallment: rowValues.recurrenceCurrentInstallment ?? null,
      recurrenceTotalInstallments: rowValues.recurrenceTotalInstallments ?? null,
    });
  }

  function handleClose() {
    const values = localForm.getValues();
    const rowPath = namePrefix.slice(0, -1);
    parentForm.setValue(`${rowPath}.recurrenceType`, values.recurrenceType);
    parentForm.setValue(`${rowPath}.recurrenceCurrentInstallment`, values.recurrenceCurrentInstallment);
    parentForm.setValue(`${rowPath}.recurrenceTotalInstallments`, values.recurrenceTotalInstallments);
  }

  return (
    <FormProvider {...localForm}>
      <Popover trapFocus withinPortal onOpen={handleOpen} onClose={handleClose}>
        <Popover.Target>
          <Button size="xs" variant={hasRecurrence ? "light" : "default"} disabled={disabled} fullWidth>
            {summary}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={300}>
            <RecurrenceFields namePrefix="" comboboxWithinPortal={false} />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </FormProvider>
  );
}
