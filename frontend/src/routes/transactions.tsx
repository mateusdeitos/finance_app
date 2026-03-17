// eslint-disable-next-line unused-imports/no-unused-imports
import { createFileRoute } from '@tanstack/react-router'
import { Stack, Title, Text } from '@mantine/core'
import { createAuthenticatedRoute } from '@/utils/createAuthenticatedRoute'

export const Route = createAuthenticatedRoute('/transactions')({
  component: TransactionsPage,
})

function TransactionsPage() {
  return (
    <Stack align="center" justify="center" h="100vh">
      <Title>Transações</Title>
      <Text c="dimmed">Em breve...</Text>
    </Stack>
  )
}
