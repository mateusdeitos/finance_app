import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { CategoriesPage } from '@/pages/CategoriesPage'

const now = new Date()

export const categoriesSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(now.getMonth() + 1),
  year: z.coerce.number().int().default(now.getFullYear()),
})

export type CategoriesSearch = z.infer<typeof categoriesSearchSchema>

export const Route = createFileRoute('/_authenticated/categories')({
  validateSearch: zodValidator(categoriesSearchSchema),
  component: CategoriesPage,
})
