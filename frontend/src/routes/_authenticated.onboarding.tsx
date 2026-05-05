import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchOnboardingStatus } from '@/api/onboarding'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { QueryKeys } from '@/utils/queryKeys'

export const Route = createFileRoute('/_authenticated/onboarding')({
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient
      .ensureQueryData({
        queryKey: [QueryKeys.Onboarding],
        queryFn: fetchOnboardingStatus,
      })
      .catch(() => ({ completed: false }))
    if (status.completed) {
      throw redirect({ to: '/transactions' })
    }
  },
  component: OnboardingPage,
})
