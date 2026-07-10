import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTransactionTemplate,
  deleteTransactionTemplate,
  fetchTransactionTemplates,
  updateTransactionTemplate,
} from '@/api/transactionTemplates'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'

export function useTransactionTemplates<T = Transactions.Template[]>(
  select?: (data: Transactions.Template[]) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.TransactionTemplates],
    queryFn: fetchTransactionTemplates,
    staleTime: 5 * 60 * 1000,
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.TransactionTemplates] })
  return { query, invalidate }
}

interface CreateOptions {
  onSuccess?: (template: Transactions.Template) => void
}

export function useCreateTransactionTemplate({ onSuccess }: CreateOptions = {}) {
  const mutation = useMutation({
    mutationFn: createTransactionTemplate,
    onSuccess,
  })
  return { mutation }
}

interface UpdateOptions {
  onSuccess?: () => void
}

export function useUpdateTransactionTemplate({ onSuccess }: UpdateOptions = {}) {
  const mutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number
      body: { name: string; payload: Transactions.TemplatePayload }
    }) => updateTransactionTemplate(id, body),
    onSuccess,
  })
  return { mutation }
}

interface DeleteOptions {
  onSuccess?: () => void
}

export function useDeleteTransactionTemplate({ onSuccess }: DeleteOptions = {}) {
  const mutation = useMutation({
    mutationFn: (id: number) => deleteTransactionTemplate(id),
    onSuccess,
  })
  return { mutation }
}
