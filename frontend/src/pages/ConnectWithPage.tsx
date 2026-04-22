import { Stack, Title, Text, Button, Loader, Alert, Avatar, Group, Paper } from '@mantine/core'
import { useNavigate, useParams } from '@tanstack/react-router'
import { IconAlertCircle, IconUsers } from '@tabler/icons-react'
import { useInviteInfo } from '@/hooks/useInviteInfo'
import { useAcceptInvite } from '@/hooks/useAcceptInvite'

export function ConnectWithPage() {
  const { externalId } = useParams({ from: '/_authenticated/connect-with/$externalId' })
  const navigate = useNavigate()
  const { query: inviteQuery } = useInviteInfo(externalId)
  const { mutation: acceptMutation } = useAcceptInvite()

  function handleAccept() {
    acceptMutation.mutate(externalId, {
      onSuccess: () => navigate({ to: '/' }),
    })
  }

  if (inviteQuery.isLoading) {
    return (
      <Stack align="center" justify="center" h="60vh" gap="md">
        <Loader size="lg" />
        <Text c="dimmed" size="sm">Carregando convite...</Text>
      </Stack>
    )
  }

  if (inviteQuery.isError || !inviteQuery.data) {
    return (
      <Stack align="center" justify="center" h="60vh" gap="md" p="xl">
        <Alert icon={<IconAlertCircle size={18} />} color="red" title="Convite inválido" maw={400} w="100%">
          Este link de convite não é válido ou expirou. Peça um novo link ao seu parceiro.
        </Alert>
        <Button variant="subtle" onClick={() => navigate({ to: '/' })}>
          Voltar para o início
        </Button>
      </Stack>
    )
  }

  const inviter = inviteQuery.data
  const initials = inviter.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <Stack align="center" justify="center" h="60vh" gap="xl" p="xl">
      <Paper withBorder p="xl" radius="md" maw={420} w="100%">
        <Stack gap="lg" align="center">
          <IconUsers size={40} color="var(--mantine-color-blue-6)" />

          <Stack gap="xs" align="center">
            <Title order={3} ta="center">Convite de conexão</Title>
            <Text c="dimmed" size="sm" ta="center">
              Você foi convidado para se conectar com:
            </Text>
          </Stack>

          <Group gap="sm">
            <Avatar color="blue" radius="xl" size="md">{initials}</Avatar>
            <Stack gap={2}>
              <Text fw={600}>{inviter.name}</Text>
              <Text size="xs" c="dimmed">{inviter.email}</Text>
            </Stack>
          </Group>

          <Text size="sm" c="dimmed" ta="center">
            Ao aceitar, vocês poderão gerenciar finanças compartilhadas juntos.
          </Text>

          {acceptMutation.isError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" w="100%">
              {acceptMutation.error?.message ?? 'Erro ao aceitar convite. Tente novamente.'}
            </Alert>
          )}

          <Stack gap="xs" w="100%">
            <Button
              fullWidth
              onClick={handleAccept}
              loading={acceptMutation.isPending}
            >
              Aceitar conexão
            </Button>
            <Button
              fullWidth
              variant="subtle"
              color="gray"
              onClick={() => navigate({ to: '/' })}
              disabled={acceptMutation.isPending}
            >
              Recusar
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}
