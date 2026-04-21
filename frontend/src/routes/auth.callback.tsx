import { createFileRoute } from '@tanstack/react-router'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const result: { redirect?: string } = {}
    if (typeof search.redirect === 'string') result.redirect = search.redirect
    return result
  },
  component: AuthCallbackPage,
})
