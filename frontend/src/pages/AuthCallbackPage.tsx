import { Stack, Loader, Text, Button } from '@mantine/core'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMe } from '@/hooks/useMe'
import { useRedirectOnAuthSuccess } from '@/hooks/useRedirectOnAuthSuccess'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const { redirect: redirectTo } = useSearch({ from: '/auth/callback' })
  const { query } = useMe()

  useRedirectOnAuthSuccess(query.isSuccess, redirectTo)

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
