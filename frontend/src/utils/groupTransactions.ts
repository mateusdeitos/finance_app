import { Transactions } from '@/types/transactions'

export function groupTransactions(
  transactions: Transactions.Transaction[],
  groupBy: Transactions.GroupBy,
  accounts: Transactions.Account[],
  categories: Transactions.Category[],
): Transactions.TransactionGroup[] {
  const groups = new Map<string, Transactions.TransactionGroup>()

  for (const tx of transactions) {
    let label: string

    if (groupBy === 'date') {
      const date = new Date(tx.date)
      label = date.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } else if (groupBy === 'category') {
      const category = tx.category_id
        ? categories.find((c) => c.id === tx.category_id)
        : null
      label = category ? category.name : 'Sem categoria'
    } else {
      // For transfers, always group by the from_account (debit side)
      const fromAccountId =
        tx.type === 'transfer' && tx.operation_type === 'credit' && (tx.linked_transactions ?? []).length > 0
          ? tx.linked_transactions![0].account_id
          : tx.account_id
      const account = accounts.find((a) => a.id === fromAccountId)
      label = account ? account.name : `Conta ${fromAccountId}`
    }

    if (!groups.has(label)) {
      groups.set(label, { key: label, label, transactions: [] })
    }
    groups.get(label)!.transactions.push(tx)
  }

  const result = Array.from(groups.values())

  if (groupBy === 'date') {
    result.sort((a, b) => {
      const dateA = new Date(a.transactions[0].date)
      const dateB = new Date(b.transactions[0].date)
      return dateB.getTime() - dateA.getTime()
    })
  } else {
    result.sort((a, b) => a.label.localeCompare(b.label))
  }

  return result
}
