import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { queryClient } from './queryClient'

export default function App() {
  return <RouterProvider router={router} context={{ queryClient }} />
}
