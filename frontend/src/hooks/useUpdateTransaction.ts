import { useMutation } from '@tanstack/react-query'
import { updateTransaction } from '@/api/transactions'
import { Transactions } from '@/types/transactions'

interface UpdateTransactionVariables {
  id: number
  payload: Transactions.UpdateTransactionPayload
}

export function useUpdateTransaction() {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: UpdateTransactionVariables) => updateTransaction(id, payload),
  })
  return { mutation }
}
