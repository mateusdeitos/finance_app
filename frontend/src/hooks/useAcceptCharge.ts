import { useMutation } from '@tanstack/react-query'
import { acceptCharge } from '@/api/charges'
import { Charges } from '@/types/charges'

interface AcceptChargeVariables {
  id: number
  payload: Charges.AcceptChargePayload
}

export function useAcceptCharge() {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: AcceptChargeVariables) => acceptCharge(id, payload),
  })
  return { mutation }
}
