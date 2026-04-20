export namespace Charges {
  export type ChargeStatus = 'pending' | 'paid' | 'rejected' | 'cancelled'
  export type Direction = 'sent' | 'received'

  export interface Charge {
    id: number
    charger_user_id: number
    payer_user_id: number
    charger_account_id: number | null
    payer_account_id: number | null
    connection_id: number
    period_month: number
    period_year: number
    description: string | null
    status: ChargeStatus
    date: string | null
    created_at: string | null
    updated_at: string | null
  }

  export interface FetchParams {
    month: number
    year: number
    direction?: Direction
  }

  export interface ListResponse {
    charges: Charge[]
  }

  export type InitiatorRole = 'charger' | 'payer'

  export interface CreateChargePayload {
    connection_id: number
    my_account_id: number
    period_month: number
    period_year: number
    description?: string
    amount?: number
    role: InitiatorRole
    date: string
  }

  export interface AcceptChargePayload {
    account_id: number
    date: string
    amount?: number
  }
}
