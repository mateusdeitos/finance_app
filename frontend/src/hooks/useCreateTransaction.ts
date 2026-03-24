import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTransaction } from '@/api/transactions'
import { Transactions } from '@/types/transactions'
import { parseApiError, mapTagsToFieldErrors } from '@/utils/apiErrors'
import { QueryKeys } from '@/utils/queryKeys'

interface UseCreateTransactionOptions {
  onFieldErrors?: (errors: Record<string, string>) => void
  onSuccess?: () => void
}

export function useCreateTransaction(options: UseCreateTransactionOptions = {}) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (payload: Transactions.CreateTransactionPayload) => createTransaction(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] })
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Tags] })
      options.onSuccess?.()
    },
    onError: async (err: unknown) => {
      if (err instanceof Response) {
        const apiError = await parseApiError(err)
        const fieldErrors = mapTagsToFieldErrors(apiError.tags, apiError.message)
        options.onFieldErrors?.(fieldErrors)
      }
    },
  })

  return { mutation }
}
