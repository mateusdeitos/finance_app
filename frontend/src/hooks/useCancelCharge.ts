import { useMutation } from '@tanstack/react-query'
import { cancelCharge } from '@/api/charges'

export function useCancelCharge() {
  const mutation = useMutation({
    mutationFn: (id: number) => cancelCharge(id),
  })
  return { mutation }
}
