import { useId, useState } from "react";
import { useForm, FormProvider, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Divider, Stack } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUpdateTransaction } from "@/hooks/useUpdateTransaction";
import { useAccounts } from "@/hooks/useAccounts";
import { useTags } from "@/hooks/useTags";
import { Transactions } from "@/types/transactions";
import { QueryKeys } from "@/utils/queryKeys";
import { useDrawerContext } from "@/utils/renderDrawer";
import { buildTransactionPayload } from "@/utils/buildTransactionPayload";
import {
  updateTransactionFormSchema,
  UpdateTransactionFormValues,
  TransactionFormValues,
} from "./form/transactionFormSchema";
import { TransactionForm, FocusField, type LockedAccountInfo } from "./form/TransactionForm";
import { useMe } from "@/hooks/useMe";
import { MobileFormHeader } from "./form/MobileFormHeader";
import { UpdatePropagationSelector } from "./UpdatePropagationSelector";
import { parseDate, localDateStr } from "@/utils/parseDate";
import { TransactionsTestIds } from "@/testIds";

interface Props {
  transaction: Transactions.Transaction;
  focusField?: FocusField;
}

export function UpdateTransactionDrawer({ transaction, focusField }: Props) {
  const { opened, close } = useDrawerContext<void>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const isMobile = useIsMobile();
  const formId = useId();

  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];
  const accountsLoaded = !accountsQuery.isLoading;

  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data;

  const { query: tagsQuery } = useTags();
  const existingTags = tagsQuery.data ?? [];

  // Index settlements by parent_transaction_id so each split row can be
  // hydrated with the existing settlement.date (drives the calendar
  // override button on the form).
  const settlementByParentId = new Map<number, Transactions.Settlement>(
    (transaction.settlements_from_source ?? [])
      .filter((s) => s.parent_transaction_id != null)
      .map((s) => [s.parent_transaction_id, s]),
  );

  // Resolve the transaction's own ("from") account, matching shared accounts by
  // their underlying connection account ids the same way the destination does.
  const sourceAccount = accounts.find((a) => {
    const ids = [a.id];
    if (a.user_connection) {
      ids.push(a.user_connection.from_account_id, a.user_connection.to_account_id);
    }
    return ids.includes(transaction.account_id);
  });

  // A transaction created on a shared (connection) account is mirrored to the
  // partner, so it carries partner-owned linked_transactions on the connection
  // account. Those mirrors are NOT splits — a shared-account transaction can
  // never have splits (the backend rejects them) — so never seed split_settings
  // from them. Only private-account transactions get their real splits hydrated.
  const initialSplitSettings = sourceAccount?.user_connection
    ? []
    : (transaction.linked_transactions ?? [])
        .filter((lt) => lt.user_id !== transaction.user_id)
        .flatMap((lt) => {
          const acc = accounts.find(
            (a) =>
              a.user_connection?.from_account_id === lt.account_id ||
              a.user_connection?.to_account_id === lt.account_id,
          );
          if (!acc?.user_connection) return [];
          const settlement = settlementByParentId.get(lt.id);
          const date = settlement?.date ? localDateStr(parseDate(settlement.date)) : null;
          return [{ connection_id: acc.user_connection.id, amount: lt.amount, date }];
        });

  const {
    query: { data: destinationAccount },
  } = useAccounts((accounts) => {
    if (transaction.type !== "transfer") return null;
    return accounts.find((a) => {
      const ids = [a.id];
      if (a.user_connection) {
        ids.push(a.user_connection?.from_account_id, a.user_connection?.to_account_id);
      }

      return ids.includes(transaction.linked_transactions![0].account_id);
    });
  });

  // When a transaction's account belongs to a partner (e.g. the credit side
  // of a cross-user transfer created by accepting a charge), it isn't in our
  // `useAccounts()` list and the Mantine Select would display blank. Resolve
  // the partner via the user_connection that wraps the other user_id and
  // surface it as a read-only display.
  const findPartnerInfo = (partnerUserId: number): LockedAccountInfo | null => {
    if (!currentUserId || partnerUserId === currentUserId) return null;
    const conn = accounts.find(
      (a) =>
        a.user_connection &&
        (a.user_connection.from_user_id === partnerUserId ||
          a.user_connection.to_user_id === partnerUserId),
    )?.user_connection;
    if (!conn) return null;
    const partnerIsTo = conn.to_user_id === partnerUserId;
    return {
      avatarUrl: partnerIsTo ? conn.to_user_avatar_url : conn.from_user_avatar_url,
      name: (partnerIsTo ? conn.to_user_name : conn.from_user_name) ?? "Parceiro(a)",
      description: "Conta de outro usuário",
    };
  };

  // A shared account (one wrapping a user_connection) can't be represented in
  // the transfer source Select, which offers personal accounts only (see
  // `personalAccountOptions` in TransactionForm). Surface it as a read-only
  // display using the same partner avatar shown elsewhere for shared accounts.
  const buildSharedAccountInfo = (account: Transactions.Account): LockedAccountInfo | null => {
    const conn = account.user_connection;
    if (!conn || !currentUserId) return null;
    const isFromUser = conn.from_user_id === currentUserId;
    return {
      avatarUrl: isFromUser ? conn.to_user_avatar_url : conn.from_user_avatar_url,
      name: account.name,
      description: "Conta compartilhada",
    };
  };

  const ownsSourceAccount = accounts.some((a) => a.id === transaction.account_id);
  const lockedSourceAccount =
    // Transfers created from a charge can have a shared source account, which
    // the personal-only Select would render blank — show it read-only instead.
    accountsLoaded && transaction.type === "transfer" && sourceAccount?.user_connection
      ? buildSharedAccountInfo(sourceAccount)
      : accountsLoaded && !ownsSourceAccount && transaction.user_id !== currentUserId
        ? findPartnerInfo(transaction.user_id)
        : null;

  const linkedTx = transaction.linked_transactions?.[0];
  const lockedDestinationAccount =
    accountsLoaded &&
    transaction.type === "transfer" &&
    !destinationAccount &&
    linkedTx &&
    linkedTx.user_id !== currentUserId
      ? findPartnerInfo(linkedTx.user_id)
      : null;

  const isRecurring = transaction.transaction_recurrence_id != null;

  const methods = useForm<UpdateTransactionFormValues>({
    resolver: zodResolver(updateTransactionFormSchema),
    defaultValues: {
      transaction_type: transaction.type,
      date: localDateStr(parseDate(transaction.date)),
      description: transaction.description,
      amount: transaction.amount,
      account_id: transaction.account_id,
      category_id: transaction.category_id ?? null,
      destination_account_id: destinationAccount?.id ?? null,
      tags: (transaction.tags ?? []).map((t) => t.name),
      split_settings: initialSplitSettings,
      recurrenceEnabled: !!transaction.transaction_recurrence?.id,
      recurrenceType: transaction.transaction_recurrence?.type ?? "monthly",
      recurrenceCurrentInstallment: transaction.installment_number ?? null,
      recurrenceTotalInstallments: transaction.transaction_recurrence?.installments ?? null,
      propagation_settings: "current",
    },
  });

  const queryClient = useQueryClient();
  const { mutation } = useUpdateTransaction();

  function submitTransaction(values: UpdateTransactionFormValues, onSuccess: () => void) {
    setSubmitError(undefined);
    const payload = buildTransactionPayload(values, existingTags);

    mutation.mutate(
      {
        id: transaction.id,
        payload: {
          ...payload,
          propagation_settings: isRecurring ? values.propagation_settings : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] });
          onSuccess();
        },
        onError: () => {
          setSubmitError("Erro ao salvar transação");
        },
      },
    );
  }

  function handleSubmitPayload(values: UpdateTransactionFormValues) {
    submitTransaction(values, close);
  }

  function handleSaveAndCreateAnother(values: UpdateTransactionFormValues) {
    submitTransaction(values, () => methods.reset());
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={close}
      title={
        isMobile ? (
          <MobileFormHeader
            title="Editar transação"
            onCancel={close}
            formId={formId}
            loading={mutation.isPending}
          />
        ) : (
          "Editar transação"
        )
      }
      withCloseButton={!isMobile}
      size="lg"
      // On mobile the header bar (MobileFormHeader) must span the full width so
      // "Salvar" sits flush right; Mantine's Drawer.Title otherwise shrinks to
      // its content. flex:1 lets it fill the header row.
      styles={isMobile ? { title: { flex: 1 } } : undefined}
      data-testid={TransactionsTestIds.DrawerUpdate}
    >
      <FormProvider {...methods}>
        <TransactionForm
          focusField={focusField}
          formId={formId}
          onSubmitPayload={handleSubmitPayload as (values: TransactionFormValues) => void}
          onSaveAndCreateAnother={handleSaveAndCreateAnother as (values: TransactionFormValues) => void}
          isPending={mutation.isPending}
          submitError={submitError}
          isUpdate={isRecurring}
          lockedSourceAccount={lockedSourceAccount ?? undefined}
          lockedDestinationAccount={lockedDestinationAccount ?? undefined}
          lockTransactionType={transaction.charge_id != null}
          hideRecurrence={transaction.charge_id != null}
          headerContent={
            transaction.charge_id != null ? (
              <Alert
                color="blue"
                variant="light"
                icon={<IconInfoCircle size={18} />}
                data-testid={TransactionsTestIds.AlertChargeInfo}
              >
                Esta transferência foi gerada por uma cobrança.
              </Alert>
            ) : undefined
          }
          extraContent={
            isRecurring ? (
              <Stack gap="md" mt="md">
                <Divider />
                <Controller
                  control={methods.control}
                  name="propagation_settings"
                  render={({ field }) => <UpdatePropagationSelector value={field.value} onChange={field.onChange} />}
                />
              </Stack>
            ) : undefined
          }
        />
      </FormProvider>
    </ResponsiveDrawer>
  );
}
