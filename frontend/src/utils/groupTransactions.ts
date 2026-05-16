import { Transactions } from '@/types/transactions'
import { parseDate } from './parseDate'

// Offset applied to a settlement.id to derive a stable synthetic Transaction.id
// for an inline settlement that was promoted to a standalone row when
// groupBy === 'date'. Negative so it never collides with real (positive)
// transaction ids; large offset so it never collides with the backend's
// orphan-settlement synthetic ids (which use a much smaller offset).
const PROMOTED_INLINE_SETTLEMENT_ID_OFFSET = 2_000_000_000

function dateKey(iso: string | undefined | null): string {
  return iso ? iso.slice(0, 10) : ''
}

/**
 * When grouping by date, an inline settlement whose date differs from its
 * source transaction's date must appear in its own date group rather than
 * riding along with the source. Build a Transaction-shaped synthetic row
 * (mirroring the orphan-settlement shape produced by the backend) for each
 * such settlement and remove it from the source's `settlements_from_source`
 * so it isn't rendered twice.
 *
 * A settlement belongs to its connection account. When an account filter is
 * active, a settlement whose account is outside the filter must NOT be
 * promoted to a standalone row — that row bypasses the per-account filter in
 * TransactionGroup / groupNetTotal and would leak the settlement into a
 * filtered (e.g. private) account view. Such a settlement is left inline,
 * where those filters already exclude it from render and totals.
 */
function expandInlineSettlementsForDateGrouping(
  txs: Transactions.Transaction[],
  accountFilter: number[],
): Transactions.Transaction[] {
  const result: Transactions.Transaction[] = []
  for (const tx of txs) {
    const sameDate: Transactions.Settlement[] = []
    const promoted: Transactions.Settlement[] = []
    for (const s of tx.settlements_from_source ?? []) {
      const inScope =
        accountFilter.length === 0 || accountFilter.includes(s.account_id)
      const sKey = dateKey(s.date ?? s.created_at)
      const tKey = dateKey(tx.date)
      if (inScope && sKey && tKey && sKey !== tKey) {
        promoted.push(s)
      } else {
        sameDate.push(s)
      }
    }
    if (promoted.length === 0) {
      result.push(tx)
      continue
    }
    result.push({ ...tx, settlements_from_source: sameDate })
    for (const s of promoted) {
      result.push({
        id: -(s.id + PROMOTED_INLINE_SETTLEMENT_ID_OFFSET),
        origin_settlement_id: s.id,
        source_transaction_id: tx.id,
        user_id: s.user_id,
        original_user_id: tx.original_user_id,
        type: tx.type,
        operation_type: s.type === 'credit' ? 'credit' : 'debit',
        account_id: s.account_id,
        amount: s.amount,
        date: s.date ?? tx.date,
        description: tx.description,
        created_at: s.created_at,
        updated_at: s.updated_at,
        // Settlements never carry their own settlements/links/recurrence.
        linked_transactions: [],
        settlements_from_source: [],
      })
    }
  }
  return result
}

export function groupTransactions(
  transactions: Transactions.Transaction[],
  groupBy: Transactions.GroupBy,
  accounts: Transactions.Account[],
  categories: Transactions.Category[],
  accountFilter: number[],
): Transactions.TransactionGroup[] {
  const groups = new Map<string, Transactions.TransactionGroup>()

  const input =
    groupBy === 'date'
      ? expandInlineSettlementsForDateGrouping(transactions, accountFilter)
      : transactions

  for (const tx of input) {
    let label: string

    if (groupBy === 'date') {
      const date = parseDate(tx.date)
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
      return parseDate(a.transactions[0].date).getTime() - parseDate(b.transactions[0].date).getTime()
    })
  } else {
    result.sort((a, b) => a.label.localeCompare(b.label))
  }

  return result
}
