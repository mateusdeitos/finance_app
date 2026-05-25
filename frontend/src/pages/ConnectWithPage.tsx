import {
  Alert,
  Avatar,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
  IconAlertCircle,
  IconArrowsHorizontal,
  IconReceipt,
  IconWallet,
} from '@tabler/icons-react'
import { useInviteInfo } from '@/hooks/useInviteInfo'
import { useAcceptInvite } from '@/hooks/useAcceptInvite'
import { useUserConnections } from '@/hooks/useUserConnections'
import { getInitials } from '@/utils/getInitials'
import { CommonTestIds } from '@/testIds'
import { SuggestedSplitCard } from '@/components/connections/SuggestedSplitCard'
import { ConnectedAlreadyCard } from '@/components/connections/ConnectedAlreadyCard'

export function ConnectWithPage() {
  const { externalId } = useParams({ from: '/_authenticated/connect-with/$externalId' })
  const search = useSearch({ from: '/_authenticated/connect-with/$externalId' })
  const navigate = useNavigate()
  const { query: inviteQuery } = useInviteInfo(externalId)
  const inviterId = inviteQuery.data?.id
  const { query: existingConnectionQuery } = useUserConnections((connections) =>
    inviterId
      ? connections.find(
          (c) => c.from_user_id === inviterId && c.connection_status === 'accepted',
        )
      : undefined,
  )
  const { mutation: acceptMutation } = useAcceptInvite({
    onSuccess: (result) => {
      if (!result.alreadyConnected) {
        void navigate({ to: '/' })
      }
    },
  })

  const suggestedSplit = search.split
  const hasSuggestion =
    typeof suggestedSplit === 'number' && suggestedSplit !== 50

  function handleAccept() {
    acceptMutation.mutate({ externalId, splitPercentage: suggestedSplit ?? 50 })
  }

  function goHome() {
    void navigate({ to: '/' })
  }

  if (inviteQuery.isLoading) {
    return (
      <PageShell>
        <Stack align="center" justify="center" gap="md" mih={240}>
          <Loader size="lg" />
          <Text c="dimmed" size="sm">Carregando convite...</Text>
        </Stack>
      </PageShell>
    )
  }

  if (inviteQuery.isError || !inviteQuery.data) {
    return (
      <PageShell>
        <Stack align="center" gap="md">
          <Alert
            icon={<IconAlertCircle size={18} />}
            color="red"
            title="Convite inválido"
            maw={460}
            w="100%"
          >
            Este link de convite não é válido ou expirou. Peça um novo link ao seu parceiro.
          </Alert>
          <Button variant="subtle" onClick={goHome}>
            Voltar para o início
          </Button>
        </Stack>
      </PageShell>
    )
  }

  const inviter = inviteQuery.data
  const inviterFirstName = inviter.name.split(' ')[0] ?? inviter.name

  const alreadyConnected =
    acceptMutation.data?.alreadyConnected || Boolean(existingConnectionQuery.data)

  if (alreadyConnected) {
    return (
      <PageShell>
        <ConnectedAlreadyCard inviterName={inviter.name} onGoToApp={goHome} />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <Paper
        withBorder
        shadow="sm"
        radius="md"
        p="xl"
        maw={460}
        w="100%"
      >
        <Stack gap="lg">
          <Text
            size="xs"
            fw={700}
            c="dimmed"
            ta="center"
            tt="uppercase"
            style={{ letterSpacing: '0.05em' }}
          >
            Convite de conexão
          </Text>

          <Stack align="center" gap="xs">
            <Avatar size={76} radius="xl" color="blue">
              {getInitials(inviter.name)}
            </Avatar>
            <Stack gap={2} align="center">
              <Text size="xs" c="dimmed">
                Você foi convidado para se conectar com
              </Text>
              <Text fw={700} size="xl">
                {inviter.name}
              </Text>
              <Text size="sm" c="dimmed">
                {inviter.email}
              </Text>
            </Stack>
          </Stack>

          {hasSuggestion && (
            <SuggestedSplitCard
              inviterPct={suggestedSplit}
              inviterName={inviterFirstName}
            />
          )}

          <Box
            p="md"
            style={{
              borderRadius: 10,
              background: 'var(--mantine-color-default-hover)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Stack gap="xs">
              <Text
                size="xs"
                fw={700}
                c="dimmed"
                tt="uppercase"
                style={{ letterSpacing: '0.04em' }}
              >
                Ao aceitar
              </Text>
              <Bullet icon={<IconWallet size={13} />}>
                Duas contas compartilhadas serão criadas — uma em cada app.
              </Bullet>
              <Bullet icon={<IconArrowsHorizontal size={13} />}>
                Vocês poderão dividir transações com split{' '}
                {hasSuggestion ? (
                  <Text component="span" fw={700}>
                    {suggestedSplit}/{100 - suggestedSplit} sugerido
                  </Text>
                ) : (
                  <>
                    de <Text component="span" fw={700}>50/50</Text> por padrão
                  </>
                )}
                .
              </Bullet>
              <Bullet icon={<IconReceipt size={13} />}>
                Os acertos do mês passam a ser calculados automaticamente.
              </Bullet>
            </Stack>
          </Box>

          {acceptMutation.isError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red">
              {acceptMutation.error?.message ?? 'Erro ao aceitar convite. Tente novamente.'}
            </Alert>
          )}

          <Stack gap="xs">
            <Button
              fullWidth
              size="md"
              onClick={handleAccept}
              loading={acceptMutation.isPending}
              data-testid={CommonTestIds.ConnectWithAccept}
            >
              Aceitar conexão
            </Button>
            <Button
              fullWidth
              variant="subtle"
              color="gray"
              onClick={goHome}
              disabled={acceptMutation.isPending}
              data-testid={CommonTestIds.ConnectWithDecline}
            >
              Recusar
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Stack align="center" gap="xl" py="xl" px="md">
      <Group gap={10}>
        <img src="/icon.svg" width={28} height={28} alt="FinanceApp" />
        <Text fw={700} size="lg" c="blue.7">
          FinanceApp
        </Text>
      </Group>
      {children}
    </Stack>
  )
}

function Bullet({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <ThemeIcon
        size={22}
        radius={6}
        color="blue"
        variant="light"
        style={{ flexShrink: 0, marginTop: -1 }}
      >
        {icon}
      </ThemeIcon>
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
        {children}
      </Text>
    </Group>
  )
}
