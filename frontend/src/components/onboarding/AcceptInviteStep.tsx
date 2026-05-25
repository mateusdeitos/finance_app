import {
  Alert,
  Avatar,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconArrowsHorizontal,
  IconReceipt,
  IconWallet,
} from '@tabler/icons-react'
import { useInviteInfo } from '@/hooks/useInviteInfo'
import { useAcceptInvite } from '@/hooks/useAcceptInvite'
import { getInitials } from '@/utils/getInitials'
import { CommonTestIds, OnboardingTestIds } from '@/testIds'
import { SuggestedSplitCard } from '@/components/connections/SuggestedSplitCard'

interface Props {
  externalId: string
  suggestedSplit?: number
  onAccepted: () => void
  onSkip: () => void
}

export function AcceptInviteStep({ externalId, suggestedSplit, onAccepted, onSkip }: Props) {
  const { query: inviteQuery } = useInviteInfo(externalId)
  const { mutation: acceptMutation } = useAcceptInvite({
    onSuccess: () => onAccepted(),
  })

  const hasSuggestion =
    typeof suggestedSplit === 'number' && suggestedSplit !== 50

  function handleAccept() {
    acceptMutation.mutate({ externalId, splitPercentage: suggestedSplit ?? 50 })
  }

  if (inviteQuery.isLoading) {
    return (
      <Stack align="center" gap="md" py="xl">
        <Loader />
        <Text c="dimmed" size="sm">Carregando convite...</Text>
      </Stack>
    )
  }

  if (inviteQuery.isError || !inviteQuery.data) {
    return (
      <Stack gap="md">
        <Alert icon={<IconAlertCircle size={18} />} color="red" title="Convite inválido">
          Não conseguimos carregar este convite. Você pode continuar a configuração e
          pedir um novo link depois.
        </Alert>
        <Button variant="subtle" onClick={onSkip}>Pular e continuar</Button>
      </Stack>
    )
  }

  const inviter = inviteQuery.data
  const inviterFirstName = inviter.name.split(' ')[0] ?? inviter.name

  return (
    <Stack gap="md" data-testid={OnboardingTestIds.StepAcceptInvite}>
      <Stack gap={4}>
        <Text fw={600} size="lg">Você recebeu um convite</Text>
        <Text c="dimmed" size="sm">
          Antes de configurar suas contas e categorias, aceite a conexão para já começar a
          dividir despesas com {inviterFirstName}.
        </Text>
      </Stack>

      <Stack
        align="center"
        gap="xs"
        p="md"
        style={{
          borderRadius: 10,
          background: 'var(--mantine-color-default-hover)',
          border: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Avatar size={68} radius="xl" color="blue">
          {getInitials(inviter.name)}
        </Avatar>
        <Text fw={700} size="lg">{inviter.name}</Text>
        <Text size="sm" c="dimmed">{inviter.email}</Text>
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
          size="md"
          onClick={handleAccept}
          loading={acceptMutation.isPending}
          data-testid={CommonTestIds.ConnectWithAccept}
        >
          Aceitar conexão
        </Button>
        <Button
          variant="subtle"
          color="gray"
          onClick={onSkip}
          disabled={acceptMutation.isPending}
          data-testid={OnboardingTestIds.BtnSkipInvite}
        >
          Pular por enquanto
        </Button>
      </Stack>
    </Stack>
  )
}

function Bullet({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <ThemeIcon size={22} radius={6} color="blue" variant="light" style={{ flexShrink: 0, marginTop: -1 }}>
        {icon}
      </ThemeIcon>
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>{children}</Text>
    </Group>
  )
}
