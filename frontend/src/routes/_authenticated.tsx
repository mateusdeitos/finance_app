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
        throw redirect({ to: '/onboarding' })
      }
    }
  },
  component: AppLayout,
})
