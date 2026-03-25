import { useMutation } from '@tanstack/react-query'
import { createAccount, AccountPayload } from '@/api/accounts'

interface Options {
  onSuccess?: () => void
}

export function useCreateAccount({ onSuccess }: Options = {}) {
  const mutation = useMutation({
    mutationFn: (payload: AccountPayload) => createAccount(payload),
    onSuccess,
  })
  return { mutation }
}
