import { useMutation } from '@tanstack/react-query'
import { acceptInvite } from '@/api/userConnections'

export function useAcceptInvite() {
  const mutation = useMutation({
    mutationFn: (externalId: string) => acceptInvite(externalId),
  })
  return { mutation }
}
