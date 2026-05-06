import { useMutation } from '@tanstack/react-query'
import { updateSettlement } from '@/api/settlements'
import { Transactions } from '@/types/transactions'

interface UpdateSettlementVariables {
  id: number
  payload: Transactions.UpdateSettlementPayload
}

export function useUpdateSettlement() {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: UpdateSettlementVariables) => updateSettlement(id, payload),
  })

  return { mutation }
}
