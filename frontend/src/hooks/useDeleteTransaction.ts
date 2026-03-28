import { useMutation } from '@tanstack/react-query'
import { deleteTransaction } from '@/api/transactions'

interface DeleteTransactionVariables {
  id: number
  propagationSettings?: 'current' | 'current_and_future' | 'all' // defaults to 'current' at the API level
}

export function useDeleteTransaction() {
  const mutation = useMutation({
    mutationFn: ({ id, propagationSettings }: DeleteTransactionVariables) =>
      deleteTransaction(id, propagationSettings),
  })

  return { mutation }
}
