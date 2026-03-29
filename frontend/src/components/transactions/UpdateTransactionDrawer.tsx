import { useState } from 'react'
import { Divider, Drawer, Stack } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useUpdateTransaction } from '@/hooks/useUpdateTransaction'
import { useMe } from '@/hooks/useMe'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'
import { useDrawerContext } from '@/utils/renderDrawer'
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

  const { query: meQuery } = useMe((me) => me.id)
  const currentUserId = meQuery.data ?? 0

  const queryClient = useQueryClient()
  const { mutation } = useUpdateTransaction()

  const isRecurring = transaction.transaction_recurrence_id != null

  function handleSubmitPayload(payload: Transactions.CreateTransactionPayload) {
    setSubmitError(undefined)
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
        <TransactionForm
          key={transaction.id}
          currentUserId={currentUserId}
          transaction={transaction}
          focusField={focusField}
          onSuccess={close}
          onSavePrefill={() => {}}
          onSubmitPayload={handleSubmitPayload}
          isPending={mutation.isPending}
          submitError={submitError}
        />

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
