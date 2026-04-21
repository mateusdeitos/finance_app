import { createFileRoute } from '@tanstack/react-router'
import { ImportTransactionsPage } from '@/pages/ImportTransactionsPage'

export const Route = createFileRoute('/_authenticated/transactions_/import')({
  component: ImportTransactionsPage,
})
