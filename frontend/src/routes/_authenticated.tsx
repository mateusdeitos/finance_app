import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchMe } from '@/api/auth'
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
  },
  component: AppLayout,
})
