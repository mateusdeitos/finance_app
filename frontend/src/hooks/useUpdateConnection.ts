import { useMutation } from '@tanstack/react-query'
import { updateConnection, UpdateConnectionPayload } from '@/api/userConnections'

interface Options {
  onSuccess?: () => void
}

export function useUpdateConnection({ onSuccess }: Options = {}) {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateConnectionPayload }) =>
      updateConnection(id, payload),
    onSuccess,
  })
  return { mutation }
}
