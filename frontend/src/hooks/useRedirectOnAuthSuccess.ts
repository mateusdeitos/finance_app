import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'

export function useRedirectOnAuthSuccess(isSuccess: boolean, redirectTo: string | undefined) {
  const navigate = useNavigate()
  useEffect(() => {
    if (isSuccess) {
      navigate({ to: redirectTo ?? '/' })
    }
  }, [isSuccess, navigate, redirectTo])
}
