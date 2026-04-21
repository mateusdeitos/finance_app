import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, Drawer, NumberInput, Select, Skeleton, Stack, Text } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import "@mantine/dates/styles.css";
import { useDrawerContext } from "@/utils/renderDrawer";
import { useAcceptCharge } from "@/hooks/useAcceptCharge";
import { useCharges } from "@/hooks/useCharges";
import { useChargesPendingCount } from "@/hooks/useChargesPendingCount";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useMe } from "@/hooks/useMe";
import { fetchBalance } from "@/api/transactions";
import { parseApiError, mapTagsToFieldErrors } from "@/utils/apiErrors";
import { QueryKeys } from "@/utils/queryKeys";
import { formatBalance } from "@/utils/formatCents";
import { Charges } from "@/types/charges";
import { ChargesTestIds } from '@/testIds'

const acceptChargeSchema = z.object({
  account_id: z.number("Selecione uma conta"),
  date: z.date({ error: "Selecione uma data" }),
  amount: z.number().positive().optional(),
});

type AcceptChargeFormValues = z.infer<typeof acceptChargeSchema>;

interface AcceptChargeDrawerProps {
  charge: Charges.Charge;
  partnerName: string;
}

export function AcceptChargeDrawer({ charge, partnerName }: AcceptChargeDrawerProps) {
  const { opened, close, reject } = useDrawerContext<void>();
  const [submitError, setSubmitError] = useState<string | undefined>();

  const { mutation } = useAcceptCharge();
  const { invalidate: invalidateCharges } = useCharges({
    month: charge.period_month,
    year: charge.period_year,
  });
  const { invalidate: invalidatePendingCount } = useChargesPendingCount();
  const { invalidate: invalidateTransactions } = useTransactions({
    month: charge.period_month,
    year: charge.period_year,
  });
  const { query: accountsQuery } = useAccounts();
  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data ?? 0;

  const accounts = accountsQuery.data ?? [];

  // User's own active private accounts only — connection (shared) accounts
  // are the internal ledger and must not be used to settle a charge.
  const myAccounts = accounts
    .filter((a) => a.user_id === currentUserId && a.is_active && !a.user_connection)
    .map((a) => ({ label: a.name, value: String(a.id) }));

  // Balance preview query
  const balanceQuery = useQuery({
    queryKey: [QueryKeys.Balance, { month: charge.period_month, year: charge.period_year, accumulated: false }],
    queryFn: () => fetchBalance({ month: charge.period_month, year: charge.period_year, accumulated: false }),
  });

  const balanceAmount = balanceQuery.data?.balance ?? 0;

  const period = String(charge.period_month).padStart(2, "0") + "/" + charge.period_year;

  const form = useForm<AcceptChargeFormValues>({
    resolver: zodResolver(acceptChargeSchema),
    defaultValues: {
      account_id: undefined,
      date: new Date(),
      amount: undefined,
    },
  });

  function handleSubmit(values: AcceptChargeFormValues) {
    setSubmitError(undefined);
    const payload: Charges.AcceptChargePayload = {
      account_id: values.account_id,
      date: values.date.toISOString(),
      amount: values.amount ? Math.round(values.amount * 100) : undefined,
    };
    mutation.mutate(
      { id: charge.id, payload },
      {
        onSuccess: () => {
          invalidateCharges();
          invalidatePendingCount();
          invalidateTransactions();
          notifications.show({
            color: "teal",
            title: "Cobrança aceita",
            message: "Cobrança aceita com sucesso",
            autoClose: 3000,
          });
          close();
        },
        onError: async (err) => {
          if (err instanceof Response) {
            const apiError = await parseApiError(err);
            const errors = mapTagsToFieldErrors(apiError.tags, apiError.message);
            for (const [field, message] of Object.entries(errors)) {
              if (field === "_general") setSubmitError(message);
              else form.setError(field as keyof AcceptChargeFormValues, { message });
            }
          } else {
            setSubmitError("Erro ao aceitar cobrança");
          }
        },
      },
    );
  }

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      title="Aceitar Cobrança"
      position="right"
      size="md"
      data-testid={ChargesTestIds.DrawerAccept}
    >
      <form onSubmit={form.handleSubmit(handleSubmit)} noValidate>
        <Stack gap="md">
          {submitError && (
            <Alert color="red" title="Erro" variant="light">
              {submitError}
            </Alert>
          )}

          {/* Charge summary (read-only) */}
          <Stack gap={2}>
            <Text size="sm" fw={600}>
              {partnerName}
            </Text>
            <Text size="sm" c="dimmed">
              {period}
            </Text>
            {charge.description && (
              <Text size="sm" c="dimmed">
                {charge.description}
              </Text>
            )}
          </Stack>

          {/* Balance preview */}
          {balanceQuery.isLoading ? (
            <Skeleton height={40} />
          ) : balanceQuery.data ? (
            <Text size="sm" c="dimmed">
              {balanceAmount < 0
                ? `Voce deve ${formatBalance(Math.abs(balanceAmount))}`
                : `Devem a voce ${formatBalance(balanceAmount)}`}
            </Text>
          ) : null}

          <Controller
            name="account_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <Select
                label="Conta"
                placeholder="Selecione uma conta"
                data={myAccounts}
                value={field.value != null ? String(field.value) : null}
                onChange={(val) => field.onChange(val != null ? Number(val) : undefined)}
                error={fieldState.error?.message}
                required
                data-testid={ChargesTestIds.SelectAcceptAccount}
              />
            )}
          />

          <Controller
            name="date"
            control={form.control}
            render={({ field, fieldState }) => (
              <DateInput
                label="Data da transferencia"
                placeholder="Selecione uma data"
                value={field.value}
                onChange={(date) => field.onChange(date)}
                error={fieldState.error?.message}
                required
              />
            )}
          />

          <Controller
            name="amount"
            control={form.control}
            render={({ field, fieldState }) => (
              <NumberInput
                label="Valor (opcional)"
                placeholder={balanceQuery.data ? formatBalance(Math.abs(balanceAmount)) : ""}
                value={field.value ?? ""}
                onChange={(val) => field.onChange(typeof val === "number" ? val : undefined)}
                error={fieldState.error?.message}
                decimalScale={2}
                min={0}
              />
            )}
          />

          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={mutation.isPending}
            fullWidth
            data-testid={ChargesTestIds.BtnSubmitAccept}
          >
            Confirmar aceitacao
          </Button>
        </Stack>
      </form>
    </Drawer>
  );
}
