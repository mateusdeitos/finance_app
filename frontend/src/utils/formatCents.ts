export function formatCents(amount: number, operationType: 'credit' | 'debit'): string {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Math.abs(amount) / 100)

  return operationType === 'credit' ? `+${formatted}` : `-${formatted}`
}
