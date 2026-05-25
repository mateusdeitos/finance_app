import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchMe } from '@/api/auth'
import { fetchOnboardingStatus } from '@/api/onboarding'
import { QueryKeys } from '@/utils/queryKeys'
import { AppLayout } from '@/components/AppLayout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: [QueryKeys.Me],
        queryFn: fetchMe,
      })
    } catch {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }

    if (location.pathname !== '/onboarding') {
      const status = await context.queryClient
        .ensureQueryData({
          queryKey: [QueryKeys.Onboarding],
          queryFn: fetchOnboardingStatus,
        })
        .catch(() => ({ completed: true }))
      if (!status.completed) {
        const connectWithMatch = location.pathname.match(/^\/connect-with\/([^/]+)\/?$/)
        if (connectWithMatch) {
          const splitParam = (location.search as { split?: number }).split
          throw redirect({
            to: '/onboarding',
            search: {
              invite: connectWithMatch[1],
              ...(typeof splitParam === 'number' ? { split: splitParam } : {}),
            },
          })
        }
        throw redirect({ to: '/onboarding' })
      }
    }
  },
  component: AppLayout,
})
