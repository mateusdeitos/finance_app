import { useState } from "react";
import { useSyncSplitAmount } from "@/hooks/useSyncSplitAmount";
import { getFieldErrorMessage } from "@/utils/getFieldErrorMessage";
import {
  Group,
  Avatar,
  ActionIcon,
  Text,
  Alert,
  Stack,
  NumberInput,
  Tooltip,
  SegmentedControl,
  Select,
  UnstyledButton,
} from "@mantine/core";
import { IconX, IconPlus, IconCheck, IconCalendar } from "@tabler/icons-react";
import { CurrencyInput } from "./CurrencyInput";
import { ResponsiveDateInput } from "@/components/ResponsiveDateInput";
import {
  Controller,
  useWatch,
  useFormContext,
  type FieldValues,
} from "react-hook-form";
import { Transactions } from "@/types/transactions";
import type { TransactionFormValues } from "./transactionFormSchema";
import { useAccounts } from "@/hooks/useAccounts";
import { useMe } from "@/hooks/useMe";
import { getInitials } from "@/utils/getInitials";
import { TransactionsTestIds } from "@/testIds";
import classes from "./SplitSettingsFields.module.css";

type SplitMode = "percentage" | "amount";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── SplitRowControls (inputs + date) ────────────────────────────────────────

interface SplitRowControlsProps {
  account: Transactions.Account;
  currentUserId: number;
  totalAmount: number;
  rowPath: string;
  rowIndex: number;
  error?: string;
  mode: SplitMode;
  templateMode: boolean;
}

function SplitRowControls({
  account,
  currentUserId,
  totalAmount,
  mode,
  rowPath,
  rowIndex,
  error,
  templateMode,
}: SplitRowControlsProps) {
  const { control, setValue } = useFormContext<FieldValues>();

  const amountFieldName = `${rowPath}.amount`;
  const percentageFieldName = `${rowPath}.percentage`;
  const dateFieldName = `${rowPath}.date`;

  const conn = account.user_connection!;
  const isFrom = conn.from_user_id === currentUserId;
  // This row represents the *partner's* share, so use the other side's default.
  const defaultPercentage = isFrom ? conn.to_default_split_percentage : conn.from_default_split_percentage;

  const storedPercentage = useWatch({
    control,
    name: percentageFieldName,
  }) as number | undefined;
  const percentage = storedPercentage ?? defaultPercentage;

  const calculatedAmount = Math.round((totalAmount * percentage) / 100);

  useSyncSplitAmount(
    setValue,
    amountFieldName,
    percentageFieldName,
    mode,
    calculatedAmount,
    percentage,
    !templateMode,
  );

  return (
    <div className={classes.controlsRow}>
      {mode === "percentage" ? (
        <NumberInput
          min={1}
          max={100}
          suffix="%"
          hideControls
          value={percentage}
          onChange={(val) => {
            const next = Number(val);
            if (Number.isFinite(next)) {
              setValue(percentageFieldName, Math.min(100, Math.max(1, next)));
            }
          }}
          size="sm"
          classNames={{ input: classes.pctInput }}
          data-testid={TransactionsTestIds.InputSplitPercentage}
        />
      ) : (
        <Controller
          control={control}
          name={amountFieldName}
          render={({ field }) => (
            <CurrencyInput
              ref={field.ref}
              value={(field.value as number | undefined) ?? 0}
              onChange={field.onChange}
              error={error}
              data-testid={TransactionsTestIds.InputSplitAmount}
            />
          )}
        />
      )}

      <Text
        size="sm"
        c="dimmed"
        className={classes.preview}
        data-testid={TransactionsTestIds.SplitRowPreview(rowIndex)}
      >
        {mode === "percentage" && totalAmount > 0 && !templateMode
          ? `= R$ ${formatCurrency(calculatedAmount)}`
          : ""}
      </Text>

      {!templateMode && (
        <Controller
          control={control}
          name={dateFieldName}
          render={({ field }) => (
            <ResponsiveDateInput
              value={(field.value as string | null) ?? null}
              onChange={(value) => field.onChange(value || null)}
              desktopVariant="input"
              placeholder="Acerto"
              leftSection={<IconCalendar size={14} />}
              clearable
              size="sm"
              inputClassName={classes.dateInput}
              data-testid={TransactionsTestIds.InputSplitDate(rowIndex)}
            />
          )}
        />
      )}
    </div>
  );
}

// ─── SplitRow (card per partner) ─────────────────────────────────────────────

interface SplitRowProps {
  rowPath: string;
  rowIndex: number;
  connectedAccounts: Transactions.Account[];
  usedConnectionIds: number[];
  currentUserId: number;
  totalAmount: number;
  onRemove: () => void;
  error?: string;
  comboboxWithinPortal?: boolean;
  mode: SplitMode;
  templateMode: boolean;
}

function SplitRow({
  rowPath,
  rowIndex,
  connectedAccounts,
  usedConnectionIds,
  currentUserId,
  totalAmount,
  onRemove,
  error,
  comboboxWithinPortal = true,
  mode,
  templateMode,
}: SplitRowProps) {
  const { control, setValue } = useFormContext<FieldValues>();
  const connectionId = useWatch({
    control,
    name: `${rowPath}.connection_id`,
  }) as number | undefined;

  const selectedAccount = connectedAccounts.find((a) => a.user_connection?.id === connectionId);

  const selectData = connectedAccounts
    .filter(
      (a) =>
        a.user_connection &&
        (a.user_connection.id === connectionId || !usedConnectionIds.includes(a.user_connection.id)),
    )
    .map((a) => ({
      value: String(a.user_connection!.id),
      label: a.description || a.name,
    }));

  if (!connectionId || connectionId === 0) {
    return (
      <div className={classes.card}>
        <Group gap="sm" align="center" wrap="nowrap">
          <Select
            placeholder="Selecionar conta"
            data={selectData}
            size="sm"
            style={{ flex: 1 }}
            comboboxProps={{ withinPortal: comboboxWithinPortal }}
            onChange={(val) => {
              if (val) setValue(`${rowPath}.connection_id`, Number(val));
            }}
          />
          <ActionIcon variant="subtle" color="gray" onClick={onRemove} title="Remover divisão">
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </div>
    );
  }

  const partnerName = selectedAccount?.description || selectedAccount?.name || "";

  return (
    <Stack gap={4}>
      <div className={classes.card}>
        <div className={classes.headerRow}>
          {selectedAccount && (
            <Avatar
              size={22}
              radius="xl"
              color="grape"
              src={
                selectedAccount.user_connection
                  ? selectedAccount.user_connection.from_user_id === selectedAccount.user_id
                    ? selectedAccount.user_connection.to_user_avatar_url
                    : selectedAccount.user_connection.from_user_avatar_url
                  : undefined
              }
              imageProps={{ referrerPolicy: "no-referrer" }}
            >
              {getInitials(partnerName)}
            </Avatar>
          )}
          <Tooltip label={partnerName} withArrow disabled={partnerName.length <= 30}>
            <Text size="sm" fw={500} className={classes.name}>
              {partnerName}
            </Text>
          </Tooltip>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onRemove}
            title="Remover divisão"
            className={classes.removeBtn}
          >
            <IconX size={14} />
          </ActionIcon>
        </div>

        {selectedAccount && (
          <SplitRowControls
            account={selectedAccount}
            currentUserId={currentUserId}
            totalAmount={totalAmount}
            rowPath={rowPath}
            rowIndex={rowIndex}
            error={error}
            mode={mode}
            templateMode={templateMode}
          />
        )}
      </div>

      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}

// ─── SplitSettingsFields ─────────────────────────────────────────────────────

interface SplitSettingsFieldsProps {
  /** Prefix prepended to every field name, e.g. `"rows.2."`. */
  namePrefix?: string;
  /** Whether the connection Select's dropdown renders inside a portal. */
  comboboxWithinPortal?: boolean;
  /** Force percentage-only mode (used by Bulk + Import flows). */
  onlyPercentage?: boolean;
  /** No-amount context (template form): suppress derived-value previews. */
  templateMode?: boolean;
  /** Current rows when the parent already subscribes before an accordion panel mounts. */
  splitSettings?: TransactionFormValues["split_settings"];
}

export function SplitSettingsFields({
  namePrefix = "",
  comboboxWithinPortal = true,
  onlyPercentage = false,
  templateMode = false,
  splitSettings: suppliedSplitSettings,
}: SplitSettingsFieldsProps) {
  const {
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<FieldValues>();
  const totalAmount = (useWatch({ control, name: `${namePrefix}amount` }) as number) ?? 0;

  const fieldName = `${namePrefix}split_settings`;

  // Lifted toggle: a single %/R$ mode applies to every row in the section.
  const [mode, setMode] = useState<SplitMode>("percentage");

  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data ?? 0;

  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const connectedAccounts = accounts.filter(
    (a) => a.user_connection && a.user_connection.connection_status === "accepted",
  );

  const watchedSplitSettings =
    (useWatch({
      control,
      name: fieldName,
      // The accordion panel can mount after a template is applied. Supplying
      // the current form value prevents useWatch from falling back to the
      // original empty default in that late-subscription case.
      defaultValue: getValues(fieldName),
    }) as TransactionFormValues["split_settings"] | undefined) ?? [];
  const splitSettings = suppliedSplitSettings ?? watchedSplitSettings;
  const usedConnectionIds = splitSettings.map((split) => split.connection_id).filter(Boolean);

  // Template application replaces split_settings after this component has
  // mounted. Derive a concrete saved mode synchronously so row effects never
  // get a chance to overwrite a fixed template with the connection default.
  const savedMode: SplitMode | undefined = splitSettings.some((split) => split.percentage != null)
    ? "percentage"
    : splitSettings.some((split) => (split.amount ?? 0) > 0)
      ? "amount"
      : undefined;
  const effectiveMode: SplitMode = onlyPercentage ? "percentage" : (savedMode ?? mode);

  function handleModeChange(nextMode: SplitMode) {
    setMode(nextMode);
    if (nextMode === "amount") {
      splitSettings.forEach((_, index) => {
        setValue(`${fieldName}.${index}.percentage`, undefined);
      });
      return;
    }
    if (templateMode) {
      splitSettings.forEach((_, index) => {
        setValue(`${fieldName}.${index}.amount`, undefined);
      });
    }
  }

  // Sum of partners' shares — used to surface the implicit user remainder.
  const partnerSum = splitSettings.reduce((sum, split) => sum + (split.amount ?? 0), 0);
  const sumPct = totalAmount > 0 ? Math.round((partnerSum * 100) / totalAmount) : 0;
  const isHundred = totalAmount > 0 && partnerSum === totalAmount;

  if (connectedAccounts.length === 0) return null;

  const hasAvailableConnections =
    connectedAccounts.filter((a) => a.user_connection && !usedConnectionIds.includes(a.user_connection.id))
      .length > 0;

  const fieldError = (suffix: string) => getFieldErrorMessage(errors, `${namePrefix}${suffix}`);
  const generalError = fieldError("split_settings");

  function removeSplit(index: number) {
    setValue(
      fieldName,
      splitSettings.filter((_, itemIndex) => itemIndex !== index),
      { shouldDirty: true },
    );
  }

  function addSplit() {
    const available = connectedAccounts.filter(
      (account) => account.user_connection && !usedConnectionIds.includes(account.user_connection.id),
    );
    const connectionId = available.length === 1 ? available[0].user_connection!.id : 0;
    const nextSplit = templateMode
      ? { connection_id: connectionId }
      : { connection_id: connectionId, amount: 0, date: null };
    setValue(fieldName, [...splitSettings, nextSplit], { shouldDirty: true });
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed" fw={500}>
          Divisão entre pessoas
        </Text>
        {!onlyPercentage && (
          <SegmentedControl
            size="xs"
            value={effectiveMode}
            onChange={(v) => handleModeChange(v as SplitMode)}
            data={[
              {
                value: "percentage",
                label: <span data-testid={TransactionsTestIds.SegmentSplitMode("percentage")}>%</span>,
              },
              {
                value: "amount",
                label: <span data-testid={TransactionsTestIds.SegmentSplitMode("amount")}>R$</span>,
              },
            ]}
            data-testid={TransactionsTestIds.SegmentedSplitMode}
          />
        )}
      </Group>

      {generalError && (
        <Alert color="red" variant="light" p="xs">
          {generalError}
        </Alert>
      )}

      <Stack gap="xs">
        {splitSettings.map((split, index) => {
          const othersUsed = splitSettings
            .filter((_, i) => i !== index)
            .map((setting) => setting.connection_id)
            .filter((id) => id > 0);

          const rowError = fieldError(`split_settings.${index}.amount`) ?? fieldError(`split_settings.${index}`);
          const handleRemove = () => removeSplit(index);

          return (
            <SplitRow
              key={`${split.connection_id}-${index}`}
              rowPath={`${namePrefix}split_settings.${index}`}
              rowIndex={index}
              connectedAccounts={connectedAccounts}
              usedConnectionIds={othersUsed}
              currentUserId={currentUserId}
              totalAmount={totalAmount}
              onRemove={handleRemove}
              error={rowError}
              comboboxWithinPortal={comboboxWithinPortal}
              mode={effectiveMode}
              templateMode={templateMode}
            />
          );
        })}
      </Stack>

      <Group justify="space-between" align="center" mt={4}>
        {hasAvailableConnections ? (
          <UnstyledButton
            type="button"
            className={classes.addBtn}
            onClick={addSplit}
            data-testid={TransactionsTestIds.BtnAddSplitRow}
          >
            <IconPlus size={13} />
            <span>Adicionar pessoa</span>
          </UnstyledButton>
        ) : (
          <span />
        )}
        {splitSettings.length > 0 && totalAmount > 0 && !templateMode && (
          <Group gap={4} align="center" data-testid={TransactionsTestIds.SplitSumFooter}>
            {isHundred && <IconCheck size={12} color="var(--mantine-color-teal-6)" stroke={3} />}
            <Text size="xs" fw={600} c={isHundred ? "teal" : "dimmed"}>
              {`Soma ${sumPct}% (R$ ${formatCurrency(partnerSum)})`}
            </Text>
          </Group>
        )}
      </Group>
    </Stack>
  );
}
