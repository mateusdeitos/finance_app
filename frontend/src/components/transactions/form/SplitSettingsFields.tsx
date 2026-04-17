import { useState, useEffect } from "react";
import {
  Group,
  Avatar,
  ActionIcon,
  Text,
  Alert,
  Stack,
  Divider,
  Box,
  NumberInput,
  Tooltip,
  Switch,
  Select,
  Anchor,
} from "@mantine/core";
import { IconX, IconPercentage, IconCurrencyReal } from "@tabler/icons-react";
import { CurrencyInput } from "./CurrencyInput";
import { useWatch, useFieldArray, useFormContext } from "react-hook-form";
import { Transactions } from "@/types/transactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useMe } from "@/hooks/useMe";
import { getInitials } from "@/utils/getInitials";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any;

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── SplitRowControls ─────────────────────────────────────────────────────────

interface SplitRowControlsProps {
  account: Transactions.Account;
  currentUserId: number;
  totalAmount: number;
  rowPath: string; // full RHF path to this row's `amount` field
  error?: string;
  onlyPercentage: boolean;
}

function SplitRowControls({
  account,
  currentUserId,
  totalAmount,
  onlyPercentage,
  rowPath,
  error,
}: SplitRowControlsProps) {
  const { control, register, setValue } = useFormContext<AnyFormValues>();

  const amountFieldName = `${rowPath}.amount`;
  const percentageFieldName = `${rowPath}.percentage`;

  const { ref: inputRef } = register(amountFieldName);
  const fieldValue = (useWatch({ control, name: amountFieldName }) as number | undefined) ?? 0;

  const conn = account.user_connection!;
  const isFrom = conn.from_user_id === currentUserId;
  const defaultPercentage = isFrom ? conn.from_default_split_percentage : conn.to_default_split_percentage;

  const [mode, setMode] = useState<"percentage" | "amount">(() =>
    fieldValue > 0 && !onlyPercentage ? "amount" : "percentage",
  );
  const [percentage, setPercentage] = useState(defaultPercentage);

  const calculatedAmount = Math.round((totalAmount * percentage) / 100);

  useEffect(() => {
    if (mode === "percentage") {
      setValue(amountFieldName, calculatedAmount);
      setValue(percentageFieldName, percentage);
    }
  }, [calculatedAmount, mode, amountFieldName, setValue, percentageFieldName, percentage]);

  function toggleMode() {
    const next = mode === "percentage" ? "amount" : "percentage";
    if (next === "amount") setValue(amountFieldName, calculatedAmount);
    setMode(next);
  }

  return (
    <>
      {!onlyPercentage && (
        <Tooltip label={mode === "percentage" ? "Mudar para valor fixo" : "Mudar para percentual"} withArrow>
          <Switch
            size="md"
            checked={mode === "amount"}
            onChange={toggleMode}
            thumbIcon={
              mode === "percentage" ? (
                <IconPercentage size={10} stroke={3} color="var(--mantine-color-blue-6)" />
              ) : (
                <IconCurrencyReal size={10} stroke={3} color="var(--mantine-color-teal-6)" />
              )
            }
            styles={{ track: { cursor: "pointer" } }}
          />
        </Tooltip>
      )}

      {mode === "percentage" ? (
        <Group gap="xs" align="center" wrap="nowrap" style={{ flex: 1 }}>
          <NumberInput
            min={1}
            max={100}
            suffix="%"
            value={percentage}
            onChange={(val) => setPercentage(Number(val))}
            style={{ width: 90 }}
            size="sm"
          />
          {totalAmount > 0 && (
            <Text size="sm" c="dimmed">
              = R$ {formatCurrency(calculatedAmount)}
            </Text>
          )}
        </Group>
      ) : (
        <Box style={{ flex: 1 }}>
          <CurrencyInput
            ref={inputRef}
            value={fieldValue}
            onChange={(v) => setValue(amountFieldName, v)}
            error={error}
            data-testid="input_split_amount"
          />
        </Box>
      )}
    </>
  );
}

// ─── SplitRow ─────────────────────────────────────────────────────────────────

interface SplitRowProps {
  /** Full RHF path to this split row, e.g. `"split_settings.0"` or `"rows.2.split_settings.0"`. */
  rowPath: string;
  connectedAccounts: Transactions.Account[];
  usedConnectionIds: number[];
  currentUserId: number;
  totalAmount: number;
  onRemove: () => void;
  error?: string;
  comboboxWithinPortal?: boolean;
  onlyPercentage?: boolean;
}

function SplitRow({
  rowPath,
  connectedAccounts,
  usedConnectionIds,
  currentUserId,
  totalAmount,
  onRemove,
  error,
  comboboxWithinPortal = true,
  onlyPercentage = false,
}: SplitRowProps) {
  const { control, setValue } = useFormContext<AnyFormValues>();
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
      <Group gap="sm" align="center" wrap="nowrap">
        <Select
          placeholder="Selecionar conta"
          data={selectData}
          size="sm"
          style={{ flex: 1 }}
          comboboxProps={{ withinPortal: comboboxWithinPortal }}
          onChange={(val) => {
            if (val) {
              setValue(`${rowPath}.connection_id`, Number(val));
            }
          }}
        />
        <ActionIcon size="sm" variant="subtle" color="red" onClick={onRemove} title="Remover divisão">
          <IconX size={14} />
        </ActionIcon>
      </Group>
    );
  }

  return (
    <Stack gap={4}>
      <Group gap="sm" align="center" wrap="nowrap">
        {selectedAccount && (
          <Tooltip label={selectedAccount.description ?? selectedAccount.name} withArrow>
            <Avatar
              size="sm"
              radius="xl"
              color="blue"
              src={selectedAccount.user_connection?.partner_avatar_url}
              style={{ cursor: "default" }}
            >
              {getInitials(selectedAccount.description || selectedAccount.name)}
            </Avatar>
          </Tooltip>
        )}

        {selectedAccount && (
          <SplitRowControls
            account={selectedAccount}
            currentUserId={currentUserId}
            totalAmount={totalAmount}
            rowPath={rowPath}
            error={error}
            onlyPercentage={onlyPercentage}
          />
        )}

        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          title="Remover divisão"
          style={{ flexShrink: 0 }}
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>

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
  /**
   * Prefix prepended to every field name, e.g. `"rows.2."`.
   * Defaults to `""` (top-level), which is the transaction form usage.
   */
  namePrefix?: string;
  /**
   * Whether the connection Select's dropdown renders inside a portal.
   * Set to `false` when used inside a Popover.
   */
  comboboxWithinPortal?: boolean;

  /**
   * Whether to allow settings the split as amount
   */
  onlyPercentage?: boolean;
}

export function SplitSettingsFields({
  namePrefix = "",
  comboboxWithinPortal = true,
  onlyPercentage = false,
}: SplitSettingsFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<AnyFormValues>();
  const totalAmount = (useWatch({ control, name: `${namePrefix}amount` }) as number) ?? 0;

  const fieldName = `${namePrefix}split_settings`;
  const { fields, append, remove } = useFieldArray({
    control,
    name: fieldName,
  });

  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data ?? 0;

  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const connectedAccounts = accounts.filter(
    (a) => a.user_connection && a.user_connection.connection_status === "accepted",
  );

  const usedConnectionIds =
    useWatch({
      control,
      name: fieldName,
      compute: (settings: Transactions.SplitSetting[]): number[] => {
        return settings?.map((s) => s.connection_id).filter(Boolean);
      },
    }) ?? [];

  if (connectedAccounts.length === 0) return null;

  const hasAvailableConnections =
    connectedAccounts.filter((a) => a.user_connection && !usedConnectionIds.includes(a.user_connection.id)).length > 0;

  // Resolve errors for a dot-path under namePrefix
  function fieldError(suffix: string): string | undefined {
    const parts = `${namePrefix}${suffix}`.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cur: any = errors;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = /^\d+$/.test(p) ? cur[Number(p)] : cur[p];
    }
    return cur?.message as string | undefined;
  }

  const generalError = fieldError("split_settings");

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        Divisão
      </Text>

      {generalError && (
        <Alert color="red" variant="light" p="xs">
          {generalError}
        </Alert>
      )}

      <Divider />

      <Stack gap="sm">
        {fields.map((field, index) => {
          const othersUsed = (fields as unknown as { connection_id: number }[])
            .filter((_, i) => i !== index)
            .map((f) => f.connection_id)
            .filter((id) => id > 0);

          const rowError = fieldError(`split_settings.${index}.amount`) ?? fieldError(`split_settings.${index}`);

          return (
            <SplitRow
              key={field.id}
              rowPath={`${namePrefix}split_settings.${index}`}
              connectedAccounts={connectedAccounts}
              usedConnectionIds={othersUsed}
              currentUserId={currentUserId}
              totalAmount={totalAmount}
              onRemove={() => remove(index)}
              error={rowError}
              comboboxWithinPortal={comboboxWithinPortal}
              onlyPercentage={onlyPercentage}
            />
          );
        })}

        {hasAvailableConnections && (
          <Anchor
            component="button"
            type="button"
            size="sm"
            c="dimmed"
            onClick={() => append({ connection_id: 0, amount: 0 })}
            style={{ alignSelf: "flex-start" }}
          >
            + Adicionar divisão
          </Anchor>
        )}
      </Stack>
    </Stack>
  );
}
