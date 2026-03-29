import { useState, useRef, useLayoutEffect, useEffect } from "react";
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
} from "@mantine/core";
import { CurrencyInput } from "./CurrencyInput";
import {
  Control,
  useWatch,
  useFieldArray,
  useController,
} from "react-hook-form";
import { Transactions } from "@/types/transactions";
import type { TransactionFormValues } from "./TransactionForm";

interface Props {
  control: Control<TransactionFormValues>;
  accounts: Transactions.Account[];
  currentUserId: number;
  errors?: Record<string, string>;
  initialSplitSettings?: TransactionFormValues["split_settings"];
}

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

// ─── SplitRowControls ────────────────────────────────────────────────────────
// Rendered only when the row is enabled. Uses useController so the amount
// field is individually registered with react-hook-form, enabling setFocus.

interface SplitRowControlsProps {
  account: Transactions.Account;
  currentUserId: number;
  totalAmount: number;
  fieldIndex: number;
  control: Control<TransactionFormValues>;
  error?: string;
  initialMode?: "percentage" | "amount";
}

function SplitRowControls({
  account,
  currentUserId,
  totalAmount,
  fieldIndex,
  control,
  error,
  initialMode,
}: SplitRowControlsProps) {
  const { field } = useController({
    control,
    name: `split_settings.${fieldIndex}.amount` as `split_settings.0.amount`,
  });

  const conn = account.user_connection!;
  const isFrom = conn.from_user_id === currentUserId;
  const defaultPercentage = isFrom
    ? conn.from_default_split_percentage
    : conn.to_default_split_percentage;

  const [mode, setMode] = useState<"percentage" | "amount">(
    initialMode ?? "percentage"
  );
  const [percentage, setPercentage] = useState(defaultPercentage);

  const calculatedAmount = Math.round((totalAmount * percentage) / 100);

  const onChangeRef = useRef(field.onChange);
  useLayoutEffect(() => {
    onChangeRef.current = field.onChange;
  });

  useEffect(() => {
    if (mode === "percentage") {
      onChangeRef.current(calculatedAmount);
    }
  }, [calculatedAmount, mode]);

  function toggleMode() {
    const next = mode === "percentage" ? "amount" : "percentage";
    if (next === "amount") field.onChange(calculatedAmount);
    setMode(next);
  }

  return (
    <>
      <ActionIcon
        size="md"
        radius="xl"
        variant="light"
        onClick={toggleMode}
        title={
          mode === "percentage"
            ? "Mudar para valor fixo"
            : "Mudar para percentual"
        }
        style={{ flexShrink: 0, fontWeight: 700, fontSize: "0.7rem" }}
      >
        {mode === "percentage" ? "%" : "R$"}
      </ActionIcon>

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
            ref={field.ref}
            value={field.value ?? 0}
            onChange={field.onChange}
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
  account: Transactions.Account;
  currentUserId: number;
  totalAmount: number;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  fieldIndex: number;
  control: Control<TransactionFormValues>;
  error?: string;
  initialMode?: "percentage" | "amount";
}

function SplitRow({
  account,
  currentUserId,
  totalAmount,
  enabled,
  onToggle,
  fieldIndex,
  control,
  error,
  initialMode,
}: SplitRowProps) {
  const label = account.description || account.name;
  const initials = getInitials(label);
  const tooltipLabel = account.description ?? account.name;

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

        <Switch
          checked={enabled}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        />

        {enabled && (
          <SplitRowControls
            account={account}
            currentUserId={currentUserId}
            totalAmount={totalAmount}
            fieldIndex={fieldIndex}
            control={control}
            error={error}
            initialMode={initialMode}
          />
        )}
      </Group>

      {error && enabled && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}

// ─── SplitSettingsFields ─────────────────────────────────────────────────────

export function SplitSettingsFields({
  control,
  accounts,
  currentUserId,
  errors,
  initialSplitSettings,
}: Props) {
  const totalAmount = useWatch({ control, name: "amount" }) ?? 0;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "split_settings",
  });

  const connectedAccounts = accounts.filter(
    (a) =>
      a.user_connection && a.user_connection.connection_status === "accepted"
  );

  if (connectedAccounts.length === 0) return null;

  const generalError = errors?.["split_settings"];

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
        {connectedAccounts.map((account) => {
          const conn = account.user_connection!;
          const connectionId = conn.id;
          const fieldIndex = fields.findIndex(
            (f) => f.connection_id === connectionId
          );
          const enabled = fieldIndex >= 0;

          const indexErrors =
            fieldIndex >= 0
              ? Object.fromEntries(
                  Object.entries(errors ?? {})
                    .filter(([k]) =>
                      k.startsWith(`split_settings.${fieldIndex}.`)
                    )
                    .map(([k, v]) => [
                      k.replace(`split_settings.${fieldIndex}.`, ""),
                      v,
                    ])
                )
              : {};

          const initSplit = (initialSplitSettings ?? []).find(
            (s) => s.connection_id === connectionId
          );
          const initialMode =
            initSplit?.amount !== undefined ? "amount" : "percentage";

          function handleToggle(on: boolean) {
            if (on) {
              append({ connection_id: connectionId, amount: 0 });
            } else {
              remove(fieldIndex);
            }
          }

          return (
            <SplitRow
              key={connectionId}
              account={account}
              currentUserId={currentUserId}
              totalAmount={totalAmount}
              enabled={enabled}
              onToggle={handleToggle}
              fieldIndex={fieldIndex}
              control={control}
              error={
                indexErrors["amount"] ??
                errors?.[`split_settings.${fieldIndex}`]
              }
              initialMode={enabled ? initialMode : "percentage"}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}
