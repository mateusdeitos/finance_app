import { useMutation } from '@tanstack/react-query'
import { updateAccount, AccountPayload } from '@/api/accounts'

interface Options {
  onSuccess?: () => void
}

export function useUpdateAccount({ onSuccess }: Options = {}) {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AccountPayload }) =>
      updateAccount(id, payload),
    onSuccess,
  })
  return { mutation }
}
