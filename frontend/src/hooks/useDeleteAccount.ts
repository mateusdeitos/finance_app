import { useMutation } from '@tanstack/react-query'
import { deleteAccount } from '@/api/accounts'

interface Options {
  onSuccess?: () => void
}

export function useDeleteAccount({ onSuccess }: Options = {}) {
  const mutation = useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess,
  })
  return { mutation }
}
