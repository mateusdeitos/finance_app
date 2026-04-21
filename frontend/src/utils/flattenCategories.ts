import { Transactions } from '@/types/transactions'

export function flattenCategories(
  cats: Transactions.Category[],
  excludeId: number,
): { value: string; label: string }[] {
  const result: { value: string; label: string }[] = []
  for (const cat of cats) {
    if (cat.id !== excludeId) {
      result.push({
        value: String(cat.id),
        label: `${cat.emoji ? cat.emoji + ' ' : ''}${cat.name}`,
      })
    }
    for (const child of cat.children ?? []) {
      if (child.id !== excludeId) {
        result.push({
          value: String(child.id),
          label: `  ${child.emoji ? child.emoji + ' ' : ''}${child.name}`,
        })
      }
    }
  }
  return result
}
