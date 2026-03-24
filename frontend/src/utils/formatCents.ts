const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Formats an unsigned cent amount with a +/- prefix based on operation type. */
export function formatCents(amount: number, operationType: 'credit' | 'debit'): string {
  const formatted = currencyFormatter.format(Math.abs(amount) / 100)
  return operationType === 'credit' ? `+${formatted}` : `-${formatted}`
}

/** Formats a signed cent amount as currency (negative amounts include the minus sign). */
export function formatBalance(amount: number): string {
  return currencyFormatter.format(amount / 100)
}

/** Formats a signed cent amount with an explicit +/- prefix. */
export function formatSignedCents(amount: number): string {
  const formatted = currencyFormatter.format(Math.abs(amount) / 100)
  return amount >= 0 ? `+${formatted}` : `-${formatted}`
}
