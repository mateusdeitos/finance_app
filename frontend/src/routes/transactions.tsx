// eslint-disable-next-line unused-imports/no-unused-imports
import { createFileRoute } from '@tanstack/react-router'
import { Stack, Title, Text } from '@mantine/core'
import { AppLayout } from '@/components/AppLayout'
import { createAuthenticatedRoute } from '@/utils/createAuthenticatedRoute'

export const Route = createAuthenticatedRoute('/transactions')({
  component: TransactionsPage,
})

function TransactionsPage() {
  return (
    <AppLayout>
      <Stack align="center" justify="center" h="100%">
        <Title>Transações</Title>
        <Text c="dimmed">Em breve...</Text>
      </Stack>
    </AppLayout>
  )
}
