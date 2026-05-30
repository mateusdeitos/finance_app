export namespace Notifications {
  export type NotificationType =
    | 'charge_received'
    | 'charge_accepted'
    | 'split_created'
    | 'split_updated'

  export type EntityType = 'charge' | 'transaction'

  export type Notification = {
    id: number
    type: NotificationType
    entity_type: EntityType
    entity_id: number
    read: boolean
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
