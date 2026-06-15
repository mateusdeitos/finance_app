import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Box, Button, Divider, Group, Stack, TextInput } from "@mantine/core";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { DatePickerInput } from "@mantine/dates";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateTransaction } from "@/hooks/useUpdateTransaction";
import { Transactions } from "@/types/transactions";
import { QueryKeys } from "@/utils/queryKeys";
import { useDrawerContext } from "@/utils/renderDrawer";
import { parseDate, localDateStr } from "@/utils/parseDate";
import { CurrencyInput } from "./form/CurrencyInput";
import { UpdatePropagationSelector } from "./UpdatePropagationSelector";
import { TransactionsTestIds } from "@/testIds";

const schema = z.object({
  date: z.string().min(1, "Data é obrigatória"),
  amount: z.number().int().positive("Valor deve ser maior que zero"),
  description: z.string().min(1, "Descrição é obrigatória"),
  propagation_settings: z.enum(["current", "current_and_future", "all"]),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  transaction: Transactions.Transaction;
}

export function UpdateLinkedTransferDrawer({ transaction }: Props) {
  const { opened, close } = useDrawerContext<void>();
  const [submitError, setSubmitError] = useState<string>();

  const isRecurring = transaction.transaction_recurrence_id != null;

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: localDateStr(parseDate(transaction.date)),
      amount: transaction.amount,
      description: transaction.description ?? "",
      propagation_settings: "current",
    },
  });

  const queryClient = useQueryClient();
  const { mutation } = useUpdateTransaction();

  function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    const payload: Transactions.UpdateTransactionPayload = {
      amount: values.amount,
      date: values.date,
      description: values.description,
      propagation_settings: isRecurring ? values.propagation_settings : undefined,
    };

    mutation.mutate(
      { id: transaction.id, payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] });
          close();
        },
        onError: () => {
          setSubmitError("Erro ao salvar transação");
        },
      },
    );
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={close}
      title="Editar transação"
      data-testid={TransactionsTestIds.DrawerUpdateLinkedTransfer}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap="md">
          {submitError && (
            <Alert color="red" title="Erro" variant="light" data-testid={TransactionsTestIds.AlertFormError}>
              {submitError}
            </Alert>
          )}

          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <DatePickerInput
                ref={field.ref}
                label="Data"
                required
                value={field.value || null}
                onChange={(date) => field.onChange(date ?? "")}
                error={errors.date?.message}
                valueFormat="DD/MM/YYYY"
              />
            )}
          />

          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <CurrencyInput
                ref={field.ref}
                label="Valor (R$)"
                required
                value={field.value}
                onChange={field.onChange}
                error={errors.amount?.message}
                data-testid={TransactionsTestIds.InputAmount}
              />
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <TextInput
                ref={field.ref}
                label="Descrição"
                required
                value={field.value}
                onChange={(e) => field.onChange(e.currentTarget.value)}
                error={errors.description?.message}
                data-testid={TransactionsTestIds.InputDescription}
              />
            )}
          />

          {isRecurring && (
            <>
              <Divider />
              <Controller
                control={control}
                name="propagation_settings"
                render={({ field }) => (
                  <UpdatePropagationSelector value={field.value} onChange={field.onChange} />
                )}
              />
            </>
          )}
        </Stack>

        <Box
          style={{
            position: "sticky",
            bottom: 0,
            background: "var(--mantine-color-body)",
            borderTop: "1px solid var(--mantine-color-default-border)",
            paddingTop: "var(--mantine-spacing-md)",
            paddingBottom: "var(--mantine-spacing-md)",
            marginTop: "var(--mantine-spacing-md)",
          }}
        >
          <Group justify="flex-end">
            <Button type="submit" loading={isSubmitting || mutation.isPending} data-testid={TransactionsTestIds.BtnSave}>
              Salvar
            </Button>
          </Group>
        </Box>
      </form>
    </ResponsiveDrawer>
  );
}
