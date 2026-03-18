import { createFileRoute } from '@tanstack/react-router'
import { Title, Text, Stack } from '@mantine/core'

export const Route = createFileRoute('/_authenticated/transactions')({
  component: TransactionsPage,
})

function TransactionsPage() {
  return (
    <Stack p="md">
      <Title order={2}>Transações</Title>
      <Text c="dimmed">Em breve...</Text>
    </Stack>
  )
}
