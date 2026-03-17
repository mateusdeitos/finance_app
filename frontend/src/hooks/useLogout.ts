import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { logout } from '@/api/auth'
import { QueryKeys } from '@/utils/queryKeys'

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [QueryKeys.Me] })
      navigate({ to: '/login' })
    },
  })

  return { mutation }
}
