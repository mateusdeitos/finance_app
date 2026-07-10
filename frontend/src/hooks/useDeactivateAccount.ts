import { useMutation } from '@tanstack/react-query'
import { deactivateAccount } from '@/api/accounts'

interface Options {
  onSuccess?: () => void
}

export function useDeactivateAccount({ onSuccess }: Options = {}) {
  const mutation = useMutation({
    mutationFn: (id: number) => deactivateAccount(id),
    onSuccess,
  })
  return { mutation }
}
