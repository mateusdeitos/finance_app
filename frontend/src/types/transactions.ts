export namespace Transactions {
  export type TransactionType = 'expense' | 'income' | 'transfer'
  export type OperationType = 'credit' | 'debit'
  export type RecurrenceType = 'monthly' | 'weekly' | 'daily' | 'yearly'
  export type GroupBy = 'date' | 'category' | 'account'

  export interface Tag {
    id: number
    user_id: number
    name: string
    created_at?: string
    updated_at?: string
  }

  export interface UserConnection {
    id: number
    from_user_id: number
    from_account_id: number
    from_default_split_percentage: number
    to_user_id: number
    to_account_id: number
    to_default_split_percentage: number
    connection_status: 'pending' | 'accepted' | 'rejected'
    created_at?: string
    updated_at?: string
  }

  export interface Account {
    id: number
    user_id: number
    name: string
    description?: string
    initial_balance: number
    is_active: boolean
    created_at?: string
    updated_at?: string
    user_connection?: UserConnection
  }

  export interface Category {
    id: number
    user_id: number
    name: string
    emoji?: string
    parent_id?: number
    parent?: Category
    children?: Category[]
    created_at?: string
    updated_at?: string
  }

  export interface TransactionRecurrence {
    id: number
    user_id: number
    type: RecurrenceType
    installments: number
    created_at?: string
    updated_at?: string
  }

  export interface Settlement {
    id: number
    user_id: number
    amount: number
    type: 'credit' | 'debit'
    account_id: number
    source_transaction_id: number
    parent_transaction_id: number
    created_at?: string
    updated_at?: string
  }

  export interface Transaction {
    id: number
    transaction_recurrence_id?: number
    installment_number?: number
    user_id: number
    original_user_id?: number
    type: TransactionType
    account_id: number
    category_id?: number
    amount: number
    operation_type: OperationType
    date: string
    description: string
    tags?: Tag[]
    linked_transactions?: Transaction[]
    transaction_recurrence?: TransactionRecurrence
    settlements_from_source?: Settlement[]
    created_at?: string
    updated_at?: string
  }

  export interface TransactionGroup {
    key: string
    label: string
    transactions: Transaction[]
  }

  export interface FetchParams {
    month: number
    year: number
    accountIds?: number[]
    categoryIds?: number[]
    tagIds?: number[]
    types?: TransactionType[]
    query?: string
  }

  export interface ActiveFilters {
    accountIds: number[]
    categoryIds: number[]
    tagIds: number[]
    types: TransactionType[]
  }

  export interface FetchBalanceParams {
    month: number
    year: number
    accumulated: boolean
    accountIds?: number[]
    categoryIds?: number[]
    tagIds?: number[]
  }

  export interface BalanceResult {
    balance: number
  }

  export interface TransactionSuggestion {
    id: number
    description: string
    type: TransactionType
    amount: number
    account_id: number
    category_id?: number
    tags?: Tag[]
  }

  export interface RecurrenceSettings {
    type: RecurrenceType
    repetitions?: number
    end_date?: string
  }

  export interface SplitSetting {
    connection_id: number
    percentage?: number
    amount?: number
  }

  export interface CreateTransactionPayload {
    transaction_type: TransactionType
    account_id: number
    category_id?: number
    amount: number
    date: string
    description: string
    destination_account_id?: number
    tags?: { id?: number; name: string }[]
    recurrence_settings?: RecurrenceSettings
    split_settings?: SplitSetting[]
  }

  type PropagationSettings = 'current' | 'current_and_future' | 'all'

  export interface UpdateTransactionPayload {
    transaction_type?: TransactionType
    account_id?: number
    category_id?: number | null
    amount?: number
    date?: string
    description?: string
    destination_account_id?: number
    tags?: { id?: number; name: string }[]
    recurrence_settings?: RecurrenceSettings
    split_settings?: SplitSetting[]
    propagation_settings?: PropagationSettings
  }
}
