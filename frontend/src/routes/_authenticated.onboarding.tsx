import { createFileRoute, redirect } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { fetchOnboardingStatus } from '@/api/onboarding'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { QueryKeys } from '@/utils/queryKeys'

const onboardingSearchSchema = z.object({
  invite: z.string().optional(),
  split: z.coerce.number().int().min(1).max(99).optional(),
})

export const Route = createFileRoute('/_authenticated/onboarding')({
  validateSearch: zodValidator(onboardingSearchSchema),
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
