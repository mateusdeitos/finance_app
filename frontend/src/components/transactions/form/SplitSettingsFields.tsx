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
import {
  useWatch,
  useFieldArray,
  useFormContext,
} from "react-hook-form";
import { Transactions } from "@/types/transactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useMe } from "@/hooks/useMe";
import type { TransactionFormValues } from "./transactionFormSchema";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getInitials(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── SplitRowControls ─────────────────────────────────────────────────────────

interface SplitRowControlsProps {
  account: Transactions.Account;
  currentUserId: number;
  totalAmount: number;
  fieldIndex: number;
  error?: string;
}

function SplitRowControls({
  account,
  currentUserId,
  totalAmount,
  fieldIndex,
  error,
}: SplitRowControlsProps) {
  const { control, register, setValue } = useFormContext<TransactionFormValues>();
  const fieldName = `split_settings.${fieldIndex}.amount` as `split_settings.0.amount`;
  const { ref: inputRef } = register(fieldName);
  const fieldValue = (useWatch({ control, name: fieldName }) as number | undefined) ?? 0;

  const conn = account.user_connection!;
  const isFrom = conn.from_user_id === currentUserId;
  const defaultPercentage = isFrom
    ? conn.from_default_split_percentage
    : conn.to_default_split_percentage;

  // If the field is pre-populated (amount > 0), start in fixed-amount mode.
  const [mode, setMode] = useState<"percentage" | "amount">(() =>
    fieldValue > 0 ? "amount" : "percentage"
  );
  const [percentage, setPercentage] = useState(defaultPercentage);

  const calculatedAmount = Math.round((totalAmount * percentage) / 100);

  useEffect(() => {
    if (mode === "percentage") {
      setValue(fieldName, calculatedAmount);
    }
  }, [calculatedAmount, mode, fieldName, setValue]);

  function toggleMode() {
    const next = mode === "percentage" ? "amount" : "percentage";
    if (next === "amount") setValue(fieldName, calculatedAmount);
    setMode(next);
  }

  return (
    <>
      <Tooltip
        label={mode === "percentage" ? "Mudar para valor fixo" : "Mudar para percentual"}
        withArrow
      >
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

      {mode === "percentage" ? (
        <Group gap="xs" align="center" style={{ flex: 1 }}>
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
            onChange={(v) => setValue(fieldName, v)}
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
  fieldIndex: number;
  connectedAccounts: Transactions.Account[];
  usedConnectionIds: number[];
  currentUserId: number;
  totalAmount: number;
  onRemove: () => void;
  error?: string;
}

function SplitRow({
  fieldIndex,
  connectedAccounts,
  usedConnectionIds,
  currentUserId,
  totalAmount,
  onRemove,
  error,
}: SplitRowProps) {
  const { control, setValue } = useFormContext<TransactionFormValues>();
  const connectionId = useWatch({
    control,
    name: `split_settings.${fieldIndex}.connection_id` as `split_settings.0.connection_id`,
  }) as number | undefined;

  const selectedAccount = connectedAccounts.find(
    (a) => a.user_connection?.id === connectionId
  );

  // Available accounts for selection: all connected accounts not used in OTHER rows
  const selectData = connectedAccounts
    .filter(
      (a) =>
        a.user_connection &&
        (a.user_connection.id === connectionId ||
          !usedConnectionIds.includes(a.user_connection.id))
    )
    .map((a) => ({
      value: String(a.user_connection!.id),
      label: a.description || a.name,
    }));

  // Row not yet assigned a connection — show a select
  if (!connectionId || connectionId === 0) {
    return (
      <Group gap="sm" align="center" wrap="nowrap">
        <Select
          placeholder="Selecionar conta"
          data={selectData}
          size="sm"
          style={{ flex: 1 }}
          onChange={(val) => {
            if (val) {
              setValue(
                `split_settings.${fieldIndex}.connection_id` as `split_settings.0.connection_id`,
                Number(val)
              );
            }
          }}
        />
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          title="Remover divisão"
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>
    );
  }

  const label = selectedAccount
    ? selectedAccount.description || selectedAccount.name
    : String(connectionId);
  const initials = getInitials(label);
  const tooltipLabel = selectedAccount?.description ?? selectedAccount?.name ?? label;

  return (
    <Stack gap={4}>
      <Group gap="sm" align="center" wrap="nowrap">
        <Tooltip label={tooltipLabel} withArrow>
          <Avatar
            size="sm"
            radius="xl"
            color="blue"
            style={{ cursor: "default" }}
          >
            {initials}
          </Avatar>
        </Tooltip>

        {selectedAccount && (
          <SplitRowControls
            account={selectedAccount}
            currentUserId={currentUserId}
            totalAmount={totalAmount}
            fieldIndex={fieldIndex}
            error={error}
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

export function SplitSettingsFields() {
  const { control, formState: { errors } } = useFormContext<TransactionFormValues>();
  const totalAmount = useWatch({ control, name: "amount" }) ?? 0;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "split_settings",
  });

  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data ?? 0;

  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const connectedAccounts = accounts.filter(
    (a) =>
      a.user_connection && a.user_connection.connection_status === "accepted"
  );

  if (connectedAccounts.length === 0) return null;

  // Connection IDs already used across all rows
  const usedConnectionIds = fields
    .map((f) => f.connection_id)
    .filter((id) => id > 0);

  // Only show "add" button if there are still available connections
  const hasAvailableConnections =
    connectedAccounts.filter(
      (a) => a.user_connection && !usedConnectionIds.includes(a.user_connection.id)
    ).length > 0;

  const splitErrors = Object.fromEntries(
    Object.entries(errors as Record<string, { message?: string }>)
      .filter(([k]) => k.startsWith("split_settings"))
      .map(([k, v]) => [k, v?.message ?? ""])
  );
  const generalError = splitErrors["split_settings"];

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
          // For this row, usedConnectionIds excluding its own
          const othersUsed = fields
            .filter((_, i) => i !== index)
            .map((f) => f.connection_id)
            .filter((id) => id > 0);

          const indexErrors =
            Object.fromEntries(
              Object.entries(splitErrors)
                .filter(([k]) => k.startsWith(`split_settings.${index}.`))
                .map(([k, v]) => [
                  k.replace(`split_settings.${index}.`, ""),
                  v,
                ])
            );

          return (
            <SplitRow
              key={field.id}
              fieldIndex={index}
              connectedAccounts={connectedAccounts}
              usedConnectionIds={othersUsed}
              currentUserId={currentUserId}
              totalAmount={totalAmount}
              onRemove={() => remove(index)}
              error={
                indexErrors["amount"] ??
                splitErrors[`split_settings.${index}`]
              }
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
