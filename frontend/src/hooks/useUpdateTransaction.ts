import { useMutation } from '@tanstack/react-query'
import { updateTransaction } from '@/api/transactions'
import { Transactions } from '@/types/transactions'
import { parseApiError, mapTagsToFieldErrors } from '@/utils/apiErrors'

interface UpdateTransactionVariables {
  id: number
  payload: Transactions.UpdateTransactionPayload
}

interface UseUpdateTransactionOptions {
  onFieldErrors?: (errors: Record<string, string>) => void
  onSuccess?: () => void
}

export function useUpdateTransaction(options: UseUpdateTransactionOptions = {}) {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: UpdateTransactionVariables) => updateTransaction(id, payload),
    onSuccess: () => {
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
