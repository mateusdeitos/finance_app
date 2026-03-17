import { createFileRoute } from '@tanstack/react-router'
import { Title, Text, Stack } from '@mantine/core'

export const Route = createFileRoute('/')({
  component: HelloWorldPage,
})

function HelloWorldPage() {
  return (
    <Stack align="center" justify="center" h="100vh">
      <Title>Hello World</Title>
      <Text c="gray.9">Finance App is up and running.</Text>
    </Stack>
  )
}
