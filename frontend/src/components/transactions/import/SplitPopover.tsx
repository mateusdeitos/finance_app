import { Transactions } from "@/types/transactions";
import { Popover, Button, Stack } from "@mantine/core";
import { useFormContext, useForm, FormProvider } from "react-hook-form";
import { SplitSettingsFields } from "../form/SplitSettingsFields";

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
}
export function SplitPopover({ namePrefix, summary, hasSplit, disabled, rowAmount }: SplitPopoverProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parentForm = useFormContext<any>();

  const localForm = useForm<SplitLocalValues>({
    defaultValues: {
      amount: rowAmount,
      split_settings: [],
    },
  });

  function handleOpen() {
    const rowPath = namePrefix.slice(0, -1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowValues = parentForm.getValues(rowPath) as any;
    localForm.reset({
      amount: rowValues.amount ?? rowAmount,
      split_settings: rowValues.split_settings ?? [],
    });
  }

  function handleClose() {
    const values = localForm.getValues();
    const rowPath = namePrefix.slice(0, -1);
    parentForm.setValue(`${rowPath}.split_settings`, values.split_settings);
  }

  return (
    <FormProvider {...localForm}>
      <Popover trapFocus closeOnClickOutside withinPortal closeOnEscape onClose={handleClose} onOpen={handleOpen}>
        <Popover.Target>
          <Button size="xs" variant={hasSplit ? "light" : "default"} disabled={disabled} fullWidth>
            {summary}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={320}>
            <SplitSettingsFields namePrefix="" comboboxWithinPortal={false} />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </FormProvider>
  );
}
