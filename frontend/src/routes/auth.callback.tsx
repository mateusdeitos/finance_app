import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Stack, Loader, Text, Button } from '@mantine/core'
import { useEffect } from 'react'
import { useMe } from '@/hooks/useMe'

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const result: { redirect?: string } = {}
    if (typeof search.redirect === 'string') result.redirect = search.redirect
    return result
  },
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const navigate = useNavigate()
  const { redirect: redirectTo } = Route.useSearch()
  const { query } = useMe()

  useEffect(() => {
    if (query.isSuccess) {
      navigate({ to: redirectTo ?? '/' })
    }
  }, [query.isSuccess, navigate, redirectTo])

  if (query.isError) {
    return (
      <Stack align="center" justify="center" h="100vh" gap="md">
        <Text size="xl">😕</Text>
        <Text fw={600}>Falha ao autenticar</Text>
        <Text c="dimmed" size="sm" ta="center">
          Não foi possível verificar sua sessão. Tente novamente.
        </Text>
        <Button variant="subtle" onClick={() => navigate({ to: '/login' })}>
          Voltar para o login
        </Button>
      </Stack>
    )
  }

  return (
    <Stack align="center" justify="center" h="100vh" gap="md">
      <Loader size="lg" />
      <Text c="dimmed" size="sm">
        Entrando...
      </Text>
    </Stack>
  )
}
