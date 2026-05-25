import { useMutation } from '@tanstack/react-query'
import { acceptInvite, type AcceptInviteResult } from '@/api/userConnections'

type AcceptArgs = { externalId: string; splitPercentage?: number }

export function useAcceptInvite(options?: { onSuccess?: (result: AcceptInviteResult) => void }) {
  const mutation = useMutation({
    mutationFn: ({ externalId, splitPercentage }: AcceptArgs) =>
      acceptInvite(externalId, splitPercentage),
    onSuccess: options?.onSuccess,
  })
  return { mutation }
}
