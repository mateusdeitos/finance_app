import { type ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Accordion, Badge, Group, Stack, Switch, TagsInput, Text } from "@mantine/core";
import { useTags } from "@/hooks/useTags";
import { useAccounts } from "@/hooks/useAccounts";
import { useMe } from "@/hooks/useMe";
import { getInitials } from "@/utils/getInitials";
import { TransactionsTestIds, type TransactionExtraPanel } from "@/testIds";
import { RecurrenceFields } from "./RecurrenceFields";
import { SplitSettingsFields } from "./SplitSettingsFields";
import { TransactionFormValues } from "./transactionFormSchema";

interface Props {
  /** Which panel is open. `null` means all collapsed. */
  activePanel: TransactionExtraPanel | null;
  onPanelChange: (panel: TransactionExtraPanel | null) => void;
  /** Whether the "Divisão" panel applies (non-transfer, personal account, has connections). */
  splitApplicable: boolean;
  /** Forwarded to RecurrenceFields — disables the current installment input on updates. */
  isUpdate: boolean;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function HeaderSummary({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" c="dimmed" lineClamp={1} style={{ marginLeft: "auto", maxWidth: "55%" }}>
      {children}
    </Text>
  );
}

function HeaderTitle({
  title,
  panel,
  count,
  hasError,
}: {
  title: string;
  panel: TransactionExtraPanel;
  count?: number;
  hasError: boolean;
}) {
  const color = hasError ? "red" : "blue";
  return (
    <Group gap={8} wrap="nowrap">
      <Text size="sm" fw={600} data-testid={TransactionsTestIds.SegmentExtraSection(panel)}>
        {title}
      </Text>
      {(count ?? 0) > 0 && (
        <Badge size="xs" circle variant="filled" color={color}>
          {count}
        </Badge>
      )}
      {!count && hasError && (
        <Badge size="xs" circle variant="filled" color="red">
          !
        </Badge>
      )}
    </Group>
  );
}

function RecurrenceSummary() {
  const { control } = useFormContext<TransactionFormValues>();
  const [enabled, totalInstallments, recurrenceType, amount] = useWatch({
    control,
    name: ["recurrenceEnabled", "recurrenceTotalInstallments", "recurrenceType", "amount"],
  });

  if (!enabled) return "Não é recorrente";
  if (totalInstallments && totalInstallments > 0) {
    const cadence =
      recurrenceType === "monthly"
        ? "mensais"
        : recurrenceType === "weekly"
        ? "semanais"
        : recurrenceType === "yearly"
        ? "anuais"
        : recurrenceType === "daily"
        ? "diárias"
        : "";
    if (amount && amount > 0) {
      return `${totalInstallments}× R$ ${formatCents(amount)} ${cadence}`.trim();
    }
    return `${totalInstallments}× ${cadence}`.trim();
  }
  return "Recorrente";
}

function SplitSummary() {
  const { control } = useFormContext<TransactionFormValues>();
  const splitSettings = useWatch({ control, name: "split_settings" }) ?? [];
  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];
  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data ?? 0;

  if (splitSettings.length === 0) return "Sem divisão";

  if (splitSettings.length === 1) {
    const conn = splitSettings[0];
    const acc = accounts.find((a) => a.user_connection?.id === conn.connection_id);
    if (acc?.user_connection) {
      const isFromCurrentUser = acc.user_connection.from_user_id === currentUserId;
      const partnerName = isFromCurrentUser
        ? acc.user_connection.to_user_name
        : acc.user_connection.from_user_name;
      const initials = getInitials(partnerName ?? acc.description ?? acc.name);
      return `Dividido com ${partnerName ?? initials}`;
    }
  }

  return `Dividido entre ${splitSettings.length} pessoas`;
}

function TagsSummary() {
  const { control } = useFormContext<TransactionFormValues>();
  const tags = useWatch({ control, name: "tags" }) ?? [];
  if (tags.length === 0) return "Nenhuma tag";
  if (tags.length <= 2) return tags.map((t) => `#${t}`).join(" ");
  return `#${tags[0]} #${tags[1]} +${tags.length - 2}`;
}

export function TransactionAccordionSections({
  activePanel,
  onPanelChange,
  splitApplicable,
  isUpdate,
}: Props) {
  const {
    control,
    formState: { errors },
  } = useFormContext<TransactionFormValues>();

  const recurrenceEnabled = useWatch({ control, name: "recurrenceEnabled" });
  const tags = useWatch({ control, name: "tags" });
  const splitSettings = useWatch({ control, name: "split_settings" });

  const { query: tagsQuery } = useTags();
  const tagNames = (tagsQuery.data ?? []).map((t) => t.name);

  const recurrenceError = !!(
    errors.recurrenceType ||
    errors.recurrenceCurrentInstallment ||
    errors.recurrenceTotalInstallments
  );
  const tagsError = !!errors.tags;
  const splitError = !!errors.split_settings;

  // Show the Divisão accordion when the user *can* create splits OR when
  // the form already carries existing splits (Update flow for an expense
  // whose linked partner connection is now inactive, shared account, etc.).
  // Without the second condition, editing an old split-bearing transaction
  // would silently hide its rows.
  const splitVisible = splitApplicable || (splitSettings?.length ?? 0) > 0;

  // If the active panel is "split" but the section isn't visible (e.g. user
  // switched to transfer), collapse everything instead of falling through.
  const effectivePanel: TransactionExtraPanel | null =
    activePanel === "split" && !splitVisible ? null : activePanel;

  return (
    <Accordion
      value={effectivePanel}
      onChange={(value) => onPanelChange((value as TransactionExtraPanel | null) ?? null)}
      variant="separated"
      chevronPosition="left"
      data-testid={TransactionsTestIds.SegmentedExtraSections}
    >
      <Accordion.Item value="recurrence">
        <Accordion.Control>
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <HeaderTitle
              title="Recorrência"
              panel="recurrence"
              count={recurrenceEnabled ? 1 : 0}
              hasError={recurrenceError}
            />
            <HeaderSummary>
              <RecurrenceSummary />
            </HeaderSummary>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <Controller
              control={control}
              name="recurrenceEnabled"
              render={({ field }) => (
                <Switch
                  label="Recorrência"
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.currentTarget.checked)}
                  data-testid={TransactionsTestIds.SwitchRecurrenceEnabled}
                />
              )}
            />
            {recurrenceEnabled && <RecurrenceFields disableCurrentInstallment={isUpdate} />}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {splitVisible && (
        <Accordion.Item value="split">
          <Accordion.Control>
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <HeaderTitle
                title="Divisão"
                panel="split"
                count={splitSettings?.length ?? 0}
                hasError={splitError}
              />
              <HeaderSummary>
                <SplitSummary />
              </HeaderSummary>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <SplitSettingsFields />
          </Accordion.Panel>
        </Accordion.Item>
      )}

      <Accordion.Item value="tags">
        <Accordion.Control>
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <HeaderTitle title="Tags" panel="tags" count={tags?.length ?? 0} hasError={tagsError} />
            <HeaderSummary>
              <TagsSummary />
            </HeaderSummary>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <TagsInput
                label="Tags"
                placeholder="Adicionar tag"
                data={tagNames}
                value={field.value}
                onChange={field.onChange}
                error={errors.tags?.message}
                clearable
                data-testid={TransactionsTestIds.TagsInput}
              />
            )}
          />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
