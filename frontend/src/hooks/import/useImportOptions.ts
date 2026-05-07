import { useAccounts } from '@/hooks/useAccounts'
import { useFlattenCategories } from '@/hooks/useCategories'
import { Transactions } from '@/types/transactions'

type Option = { value: string; label: string }

const toCategoryOptions = (categories: Transactions.Category[]): Option[] =>
  categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }))

const toAccountOptions = (accounts: Transactions.Account[]): Option[] =>
  accounts.map((a) => ({ value: String(a.id), label: a.name }))

const toSharedAccounts = (accounts: Transactions.Account[]): Transactions.Account[] =>
  accounts.filter((a) => a.user_connection?.connection_status === 'accepted')

const EMPTY_OPTIONS: Option[] = []
const EMPTY_ACCOUNTS: Transactions.Account[] = []

export function useCategoryOptions(): Option[] {
  const { query } = useFlattenCategories(toCategoryOptions)
  return query.data ?? EMPTY_OPTIONS
}

export function useAccountOptions(): Option[] {
  const { query } = useAccounts(toAccountOptions)
  return query.data ?? EMPTY_OPTIONS
}

export function useSharedAccounts(): Transactions.Account[] {
  const { query } = useAccounts(toSharedAccounts)
  return query.data ?? EMPTY_ACCOUNTS
}
