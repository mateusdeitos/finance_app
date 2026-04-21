import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/pages/LoginPage'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const result: { redirect?: string } = {}
    if (typeof search.redirect === 'string') result.redirect = search.redirect
    return result
  },
  component: LoginPage,
})
