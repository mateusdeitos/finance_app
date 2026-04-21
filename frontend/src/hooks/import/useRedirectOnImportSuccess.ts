import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'

export function useRedirectOnImportSuccess(allImportedSuccess: boolean, delayMs = 3000) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!allImportedSuccess) return
    const timer = setTimeout(() => void navigate({ to: '/transactions' }), delayMs)
    return () => clearTimeout(timer)
  }, [allImportedSuccess, navigate, delayMs])
}
