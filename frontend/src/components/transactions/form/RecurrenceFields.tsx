import { Select, NumberInput, Stack, Group, Text } from "@mantine/core";
import { Controller, useFormContext, type FieldValues } from "react-hook-form";
import { getFieldErrorMessage } from "@/utils/getFieldErrorMessage";

interface RecurrenceFieldsProps {
  /**
   * Prefix prepended to every field name, e.g. `"rows.2."`.
   * Defaults to `""` (top-level), which is the transaction form usage.
   */
  namePrefix?: string;
  /**
   * Whether the type Select's dropdown renders inside a portal.
   * Set to `false` when RecurrenceFields is rendered inside a Popover to
   * prevent the combobox from closing the containing popover.
   */
  comboboxWithinPortal?: boolean;
  /**
   * Disables the current installment input.
   * Used in the update form where changing the installment number has no effect.
   */
  disableCurrentInstallment?: boolean;
}

export function RecurrenceFields({
  namePrefix = "",
  comboboxWithinPortal = true,
  disableCurrentInstallment = false,
}: RecurrenceFieldsProps) {
  // FieldValues (RHF's base form-values type) because this component is
  // mounted inside both the transaction form and the import form and must
  // accept either shape through useFormContext.
  const {
    control,
    formState: { errors },
  } = useFormContext<FieldValues>();

  const fieldError = (suffix: string) => getFieldErrorMessage(errors, `${namePrefix}${suffix}`);

  return (
    <Stack gap="sm">
      <Controller
        control={control}
        name={`${namePrefix}recurrenceType`}
        render={({ field }) => (
          <Select
            label="Frequência"
            data={[
              { value: "daily", label: "Diário" },
              { value: "weekly", label: "Semanal" },
              { value: "monthly", label: "Mensal" },
              { value: "yearly", label: "Anual" },
            ]}
            value={(field.value as string | null) ?? null}
            onChange={field.onChange}
            error={fieldError("recurrenceType")}
            comboboxProps={{ withinPortal: comboboxWithinPortal }}
            clearable
          />
        )}
      />

      <Stack gap={4}>
        <Text size="sm" fw={500}>Parcelamento</Text>
        <Group gap="xs" align="center">
          <Text size="sm">Parcela</Text>
          <Controller
            control={control}
            name={`${namePrefix}recurrenceCurrentInstallment`}
            render={({ field }) => (
              <NumberInput
                aria-label="Parcela atual"
                min={1}
                w={64}
                hideControls
                disabled={disableCurrentInstallment}
                value={(field.value as number | null) ?? ""}
                onChange={(val) => field.onChange(val === "" ? null : Number(val))}
                error={!!fieldError("recurrenceCurrentInstallment")}
              />
            )}
          />
          <Text size="sm">de</Text>
          <Controller
            control={control}
            name={`${namePrefix}recurrenceTotalInstallments`}
            render={({ field }) => (
              <NumberInput
                aria-label="Total de parcelas"
                min={1}
                w={64}
                hideControls
                value={(field.value as number | null) ?? ""}
                onChange={(val) => field.onChange(val === "" ? null : Number(val))}
                error={!!fieldError("recurrenceTotalInstallments")}
              />
            )}
          />
        </Group>
        {(fieldError("recurrenceCurrentInstallment") || fieldError("recurrenceTotalInstallments")) && (
          <Text size="xs" c="red">
            {fieldError("recurrenceCurrentInstallment") ?? fieldError("recurrenceTotalInstallments")}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
