import { Transactions } from '@/types/transactions'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchBalance(
  params: Transactions.FetchBalanceParams,
): Promise<Transactions.BalanceResult> {
  const url = new URL(`${apiUrl}/api/transactions/balance`)

  url.searchParams.set('month', String(params.month))
  url.searchParams.set('year', String(params.year))
  url.searchParams.set('accumulated', String(params.accumulated))

  if (params.accountIds?.length) {
    params.accountIds.forEach((id) => url.searchParams.append('account_id[]', String(id)))
  }
  if (params.categoryIds?.length) {
    params.categoryIds.forEach((id) => url.searchParams.append('category_id[]', String(id)))
  }
  if (params.tagIds?.length) {
    params.tagIds.forEach((id) => url.searchParams.append('tag_id[]', String(id)))
  }

  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch balance')
  return res.json()
}

export async function fetchTransactions(
  params: Transactions.FetchParams,
): Promise<Transactions.Transaction[]> {
  const url = new URL(`${apiUrl}/api/transactions`)

  url.searchParams.set('month', String(params.month))
  url.searchParams.set('year', String(params.year))
  url.searchParams.set('with_settlements', 'true')

  if (params.accountIds?.length) {
    params.accountIds.forEach((id) => url.searchParams.append('account_id[]', String(id)))
  }
  if (params.categoryIds?.length) {
    params.categoryIds.forEach((id) => url.searchParams.append('category_id[]', String(id)))
  }
  if (params.tagIds?.length) {
    params.tagIds.forEach((id) => url.searchParams.append('tag_id[]', String(id)))
  }
  if (params.types?.length) {
    params.types.forEach((t) => url.searchParams.append('type[]', t))
  }
  if (params.query) {
    url.searchParams.set('description.query', params.query)
  }

  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch transactions')
  return res.json()
}
