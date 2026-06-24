import { useMutation } from '@tanstack/react-query'
import { deleteCharge } from '@/api/charges'

export function useDeleteCharge() {
  const mutation = useMutation({
    mutationFn: (id: number) => deleteCharge(id),
  })
  return { mutation }
}
