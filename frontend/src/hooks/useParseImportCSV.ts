import { useMutation } from '@tanstack/react-query'
import { parseImportCSV } from '@/api/transactions'

export function useParseImportCSV() {
  const mutation = useMutation({
    mutationFn: ({ file, accountId }: { file: File; accountId: number }) =>
      parseImportCSV(file, accountId),
  })
  return { mutation }
}
