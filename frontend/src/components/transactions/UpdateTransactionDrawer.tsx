import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Divider, Drawer, Stack } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useUpdateTransaction } from '@/hooks/useUpdateTransaction'
import { useAccounts } from '@/hooks/useAccounts'
import { useTags } from '@/hooks/useTags'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'
import { useDrawerContext } from '@/utils/renderDrawer'
import { buildTransactionPayload } from '@/utils/buildTransactionPayload'
import {
  transactionFormSchema,
  TransactionFormValues,
} from './form/transactionFormSchema'
import { TransactionForm, FocusField } from './form/TransactionForm'
import { UpdatePropagationSelector, PropagationValue } from './UpdatePropagationSelector'

interface Props {
  transaction: Transactions.Transaction
  focusField?: FocusField
}

export function UpdateTransactionDrawer({ transaction, focusField }: Props) {
  const { opened, close } = useDrawerContext<void>()
  const [propagation, setPropagation] = useState<PropagationValue>('current')
  const [submitError, setSubmitError] = useState<string | undefined>()

  const { query: accountsQuery } = useAccounts()
  const accounts = accountsQuery.data ?? []

  const { query: tagsQuery } = useTags()
  const existingTags = tagsQuery.data ?? []

  const initialSplitSettings = (transaction.linked_transactions ?? [])
    .filter((lt) => lt.user_id !== transaction.user_id)
    .flatMap((lt) => {
      const acc = accounts.find((a) => a.id === lt.account_id)
      if (!acc?.user_connection) return []
      return [{ connection_id: acc.user_connection.id, amount: lt.amount }]
    })

  const methods = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      transaction_type: transaction.type,
      date: transaction.date.slice(0, 10),
      description: transaction.description,
      amount: transaction.amount,
      account_id: transaction.account_id,
      category_id: transaction.category_id ?? null,
      destination_account_id: null,
      tags: (transaction.tags ?? []).map((t) => t.name),
      split_settings: initialSplitSettings,
      recurrenceEnabled: !!transaction.transaction_recurrence?.id,
      recurrenceType: transaction.transaction_recurrence?.type ?? 'monthly',
      recurrenceEndDateMode: false,
      recurrenceEndDate: null,
      recurrenceRepetitions: transaction.transaction_recurrence?.installments ?? null,
    },
  })

  const queryClient = useQueryClient()
  const { mutation } = useUpdateTransaction()

  const isRecurring = transaction.transaction_recurrence_id != null

  function handleSubmitPayload(values: TransactionFormValues) {
    setSubmitError(undefined)
    const payload = buildTransactionPayload(values, existingTags)
    mutation.mutate(
      {
        id: transaction.id,
        payload: {
          ...payload,
          propagation_settings: isRecurring ? propagation : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] })
          close()
        },
        onError: () => {
          setSubmitError('Erro ao salvar transação')
        },
      },
    )
  }

  return (
    <Drawer
      opened={opened}
      onClose={close}
      title="Editar transação"
      position="right"
      size="md"
    >
      <Stack gap="md">
        <FormProvider {...methods}>
          <TransactionForm
            focusField={focusField}
            onSubmitPayload={handleSubmitPayload}
            isPending={mutation.isPending}
            submitError={submitError}
          />
        </FormProvider>

        {isRecurring && (
          <>
            <Divider />
            <UpdatePropagationSelector value={propagation} onChange={setPropagation} />
          </>
        )}
      </Stack>
    </Drawer>
  )
}
