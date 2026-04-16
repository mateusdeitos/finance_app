import { useMutation } from '@tanstack/react-query'
import { createCharge } from '@/api/charges'
import { Charges } from '@/types/charges'

export function useCreateCharge() {
  const mutation = useMutation({
    mutationFn: (payload: Charges.CreateChargePayload) => createCharge(payload),
  })
  return { mutation }
}
