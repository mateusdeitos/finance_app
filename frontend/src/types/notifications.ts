export namespace Notifications {
  export type NotificationType =
    | 'charge_received'
    | 'charge_accepted'
    | 'split_created'
    | 'split_updated'
    | 'transfer_received'
    | 'shared_transaction_deleted'

  export type EntityType = 'charge' | 'transaction'

  export type Notification = {
    id: number
    type: NotificationType
    entity_type: EntityType
    entity_id: number
    read: boolean
    /** Persisted entity description (transaction/charge); omitted when null. */
    description?: string
    /**
     * Persisted amount in cents; omitted when null. Used when the referenced
     * entity can't (or shouldn't) be resolved for the amount — e.g. a partner
     * deleting a shared transaction, where the source may be gone or carry a
     * different (full) amount than the removed share.
     */
    amount?: number
    /**
     * Underlying transaction type ('expense' | 'income' | 'transfer'); omitted
     * when null. Used to render the gendered noun (despesa/receita) in the inbox
     * copy, matching the push notification.
     */
    tx_type?: 'expense' | 'income' | 'transfer'
    created_at: string // ISO 8601
  }

  export type NotificationListResponse = {
    notifications: Notification[]
    next_cursor: string
    has_more: boolean
  }

  export type UnreadCountResponse = {
    count: number
  }
}
