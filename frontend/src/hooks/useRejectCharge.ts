import { useMutation } from '@tanstack/react-query'
import { rejectCharge } from '@/api/charges'

export function useRejectCharge() {
  const mutation = useMutation({
    mutationFn: (id: number) => rejectCharge(id),
  })
  return { mutation }
}
