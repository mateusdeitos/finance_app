import { useMutation } from '@tanstack/react-query'
import { reorderAccounts } from '@/api/accounts'

interface Options {
  onSuccess?: () => void
}

export function useReorderAccounts({ onSuccess }: Options = {}) {
  const mutation = useMutation({
    mutationFn: (accountIds: number[]) => reorderAccounts(accountIds),
    onSuccess,
  })
  return { mutation }
}
