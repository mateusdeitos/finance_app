import { Transactions } from "@/types/transactions";
import { Popover, Button, Stack } from "@mantine/core";
import { useFormContext, useForm, FormProvider } from "react-hook-form";
import type { ImportFormValues, ImportRowFormValues } from "@/components/transactions/form/importFormSchema";
import { SplitSettingsFields } from "../form/SplitSettingsFields";
import { ImportTestIds } from "@/testIds";

// ─── SplitPopover ─────────────────────────────────────────────────────────────
interface SplitLocalValues {
  amount: number;
  split_settings: Transactions.SplitSetting[];
}
interface SplitPopoverProps {
  namePrefix: string;
  summary: string;
  hasSplit: boolean;
  disabled: boolean;
  rowAmount: number;
  rowIndex: number;
}
export function SplitPopover({ namePrefix, summary, hasSplit, disabled, rowAmount, rowIndex }: SplitPopoverProps) {
  const parentForm = useFormContext<ImportFormValues>();

  const localForm = useForm<SplitLocalValues>({
    defaultValues: {
      amount: rowAmount,
      split_settings: [],
    },
  });

  function handleOpen() {
    const rowPath = namePrefix.slice(0, -1); // "rows.0." → "rows.0"
    // Dynamic path: RHF cannot statically prove that rowPath points to a row;
    // the caller (ImportReviewRow) guarantees it. Cast narrows the unknown-ish
    // getValues result to the row schema.
    const rowValues = parentForm.getValues(rowPath as `rows.${number}`) as ImportRowFormValues;
    localForm.reset({
      amount: rowValues.amount ?? rowAmount,
      split_settings: rowValues.split_settings ?? [],
    });
  }

  function handleClose() {
    const values = localForm.getValues();
    const rowPath = namePrefix.slice(0, -1);
    parentForm.setValue(`${rowPath}.split_settings` as `rows.${number}.split_settings`, values.split_settings);
  }

  return (
    <FormProvider {...localForm}>
      <Popover trapFocus closeOnClickOutside withinPortal closeOnEscape onClose={handleClose} onOpen={handleOpen}>
        <Popover.Target>
          <Button size="xs" variant={hasSplit ? "light" : "default"} disabled={disabled} fullWidth data-testid={ImportTestIds.RowBtnSplitPopover(rowIndex)}>
            {summary}
          </Button>
        </Popover.Target>
        <Popover.Dropdown data-testid={ImportTestIds.SplitPopoverDropdown(rowIndex)}>
          <Stack gap="xs" w={320}>
            <SplitSettingsFields namePrefix="" comboboxWithinPortal={false} />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </FormProvider>
  );
}
