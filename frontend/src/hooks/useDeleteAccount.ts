import { useMutation } from '@tanstack/react-query'
import { deleteAccount, type DeleteAccountOptions } from '@/api/accounts'

interface Options {
  onSuccess?: () => void
}

export interface DeleteAccountVariables extends DeleteAccountOptions {
  id: number
}

export function useDeleteAccount({ onSuccess }: Options = {}) {
  const mutation = useMutation({
    mutationFn: ({ id, ...options }: DeleteAccountVariables) => deleteAccount(id, options),
    onSuccess,
  })
  return { mutation }
}
