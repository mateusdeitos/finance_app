import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchMe } from '@/api/auth'
import { QueryKeys } from '@/utils/queryKeys'

export function createAuthenticatedRoute(path: Parameters<typeof createFileRoute>[0]) {
  const route = createFileRoute(path as any) // eslint-disable-line @typescript-eslint/no-explicit-any

  return (options: Parameters<typeof route>[0] = {} as any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    route({
      ...options,
      beforeLoad: async (ctx: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        try {
          await ctx.context.queryClient.ensureQueryData({
            queryKey: [QueryKeys.Me],
            queryFn: fetchMe,
          })
        } catch {
          throw redirect({ to: '/login' })
        }
        return options?.beforeLoad?.(ctx)
      },
    })
}
