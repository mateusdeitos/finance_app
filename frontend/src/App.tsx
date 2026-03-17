import { RouterProvider } from '@tanstack/react-router'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { router } from './router'
import { queryClient } from './queryClient'

export default function App() {
  return (
    <>
      <RouterProvider router={router} context={{ queryClient }} />
      <ReactQueryDevtools initialIsOpen={false} />
      <TanStackRouterDevtools router={router} initialIsOpen={false} />
    </>
  )
}
