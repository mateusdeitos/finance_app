import { Stack, Title, Text, Button, Box } from '@mantine/core'
import { useSearch } from '@tanstack/react-router'
import { FeatureItem } from '@/components/login/FeatureItem'
import { GoogleIcon } from '@/components/login/GoogleIcon'
import classes from './LoginPage.module.css'

export function LoginPage() {
  const { redirect: redirectTo } = useSearch({ from: '/login' })

  function handleGoogleLogin() {
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
    const url = new URL(`${apiUrl}/auth/google`)
    if (redirectTo) url.searchParams.set('redirect', redirectTo)
    url.searchParams.set('origin', window.location.origin)
    window.location.href = url.toString()
  }

  return (
    <Box className={classes.container}>
      <Stack align="center" gap="xl" className={classes.content}>
        <Stack align="center" gap="xs">
          <Text className={classes.emoji}>💰</Text>
          <Title order={1} className={classes.title}>
            Finança a dois
          </Title>
          <Text className={classes.subtitle}>
            Gerencie as finanças do casal de forma simples e transparente
          </Text>
        </Stack>

        <Stack align="center" gap="md" className={classes.features}>
          <FeatureItem emoji="📊" text="Visão compartilhada das despesas" />
          <FeatureItem emoji="🔄" text="Transações recorrentes automáticas" />
          <FeatureItem emoji="🎯" text="Controle de metas juntos" />
        </Stack>

        <Button
          size="lg"
          variant="default"
          leftSection={<GoogleIcon />}
          onClick={handleGoogleLogin}
          className={classes.googleButton}
          fullWidth
        >
          Entrar com Google
        </Button>
      </Stack>
    </Box>
  )
}
