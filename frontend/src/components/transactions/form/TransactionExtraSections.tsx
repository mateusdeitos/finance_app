import { type ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Badge, Box, Group, SegmentedControl, Stack, Switch, TagsInput } from "@mantine/core";
import { useTags } from "@/hooks/useTags";
import { TransactionsTestIds, type TransactionExtraPanel } from "@/testIds";
import { RecurrenceFields } from "./RecurrenceFields";
import { SplitSettingsFields } from "./SplitSettingsFields";
import { TransactionFormValues } from "./transactionFormSchema";

interface Props {
  activePanel: TransactionExtraPanel;
  onPanelChange: (panel: TransactionExtraPanel) => void;
  /** Whether the "Divisão" panel applies (non-transfer, personal account, has connections). */
  splitApplicable: boolean;
  /** Forwarded to RecurrenceFields — disables the current installment input on updates. */
  isUpdate: boolean;
}

function SegmentIndicator({ count, dot, error }: { count?: number; dot?: boolean; error: boolean }) {
  const showCount = (count ?? 0) > 0;
  const showDot = !showCount && (!!dot || error);
  if (!showCount && !showDot) return null;
  const color = error ? "red" : "blue";
  if (showCount) {
    return (
      <Badge size="xs" circle variant="filled" color={color}>
        {count}
      </Badge>
    );
  }
  return (
    <Box w={8} h={8} style={{ borderRadius: "50%", backgroundColor: `var(--mantine-color-${color}-6)` }} />
  );
}

export function TransactionExtraSections({ activePanel, onPanelChange, splitApplicable, isUpdate }: Props) {
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

  const segmentLabel = (panel: TransactionExtraPanel, text: string, indicator: ReactNode) => (
    <Group gap={6} wrap="nowrap" justify="center">
      <span data-testid={TransactionsTestIds.SegmentExtraSection(panel)}>{text}</span>
      {indicator}
    </Group>
  );

  const panels: { value: TransactionExtraPanel; label: ReactNode }[] = [
    {
      value: "recurrence",
      label: segmentLabel(
        "recurrence",
        "Recorrência",
        <SegmentIndicator dot={!!recurrenceEnabled} error={recurrenceError} />,
      ),
    },
    ...(splitApplicable
      ? [
          {
            value: "split" as const,
            label: segmentLabel(
              "split",
              "Divisão",
              <SegmentIndicator count={splitSettings?.length ?? 0} error={splitError} />,
            ),
          },
        ]
      : []),
    {
      value: "tags",
      label: segmentLabel("tags", "Tags", <SegmentIndicator count={tags?.length ?? 0} error={tagsError} />),
    },
  ];

  const effectivePanel = panels.some((p) => p.value === activePanel) ? activePanel : "recurrence";

  return (
    <Stack gap="sm">
      <SegmentedControl
        fullWidth
        value={effectivePanel}
        onChange={(value) => onPanelChange(value as TransactionExtraPanel)}
        data={panels}
        data-testid={TransactionsTestIds.SegmentedExtraSections}
      />

      <Box style={{ display: effectivePanel === "recurrence" ? undefined : "none" }}>
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
      </Box>

      {splitApplicable && (
        <Box style={{ display: effectivePanel === "split" ? undefined : "none" }}>
          <SplitSettingsFields />
        </Box>
      )}

      <Box style={{ display: effectivePanel === "tags" ? undefined : "none" }}>
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
      </Box>
    </Stack>
  );
}
