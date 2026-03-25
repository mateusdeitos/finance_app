import { useMutation } from '@tanstack/react-query'
import { activateAccount } from '@/api/accounts'

interface Options {
  onSuccess?: () => void
}

export function useActivateAccount({ onSuccess }: Options = {}) {
  const mutation = useMutation({
    mutationFn: (id: number) => activateAccount(id),
    onSuccess,
  })
  return { mutation }
}
