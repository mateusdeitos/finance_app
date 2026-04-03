import { Suspense, lazy } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { queryClient } from './queryClient'

const ReactQueryDevtools = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({
        default: m.ReactQueryDevtools,
      }))
    )

const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import('@tanstack/router-devtools').then((m) => ({
        default: m.TanStackRouterDevtools,
      }))
    )

export default function App() {
  return (
    <>
      <RouterProvider router={router} context={{ queryClient }} />
      <Suspense>
        <ReactQueryDevtools initialIsOpen={false} />
        <TanStackRouterDevtools router={router} initialIsOpen={false} />
      </Suspense>
    </>
  )
}
