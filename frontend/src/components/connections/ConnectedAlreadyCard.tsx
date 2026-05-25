import { Button, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { CommonTestIds } from '@/testIds'

interface ConnectedAlreadyCardProps {
  inviterName: string
  onGoToApp: () => void
}

export function ConnectedAlreadyCard({ inviterName, onGoToApp }: ConnectedAlreadyCardProps) {
  return (
    <Paper
      withBorder
      shadow="sm"
      radius="md"
      p="xl"
      maw={460}
      w="100%"
    >
      <Stack align="center" gap="md">
        <ThemeIcon size={56} radius="xl" color="teal" variant="light">
          <IconCheck size={28} />
        </ThemeIcon>
        <Stack gap={6} align="center">
          <Text fw={700} size="xl" ta="center">
            Vocês já estão conectados
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            Você e <Text component="span" fw={700}>{inviterName}</Text> já compartilham finanças.
            Não é preciso aceitar de novo.
          </Text>
        </Stack>
        <Button
          data-testid={CommonTestIds.ConnectWithGoToApp}
          onClick={onGoToApp}
          mt="xs"
        >
          Ir para o app
        </Button>
      </Stack>
    </Paper>
  )
}
