import { Avatar, Box, Group, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { UserAvatar } from '@/components/UserAvatar'
import { PARTNER_COLOR } from './SplitSelector'

interface SplitFlowDiagramProps {
  split: number
  userName: string
  userAvatarUrl?: string
  partnerName: string
  partnerHasName: boolean
}

const formatBrl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

export function SplitFlowDiagram({
  split,
  userName,
  userAvatarUrl,
  partnerName,
  partnerHasName,
}: SplitFlowDiagramProps) {
  const userPct = split
  const partnerPct = 100 - split

  return (
    <Box
      style={{
        borderRadius: 10,
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-default-hover)',
        overflow: 'hidden',
      }}
    >
      <Box
        px="sm"
        py={8}
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-body)',
        }}
      >
        <Group gap={7}>
          <IconInfoCircle size={12} />
          <Text
            size="xs"
            fw={700}
            c="dimmed"
            tt="uppercase"
            style={{ letterSpacing: '0.04em' }}
          >
            Como funciona · exemplo de R$ 100,00
          </Text>
        </Group>
      </Box>

      <Stack gap={4} p="sm">
        <FlowRow
          avatar={<UserAvatar name={userName} avatarUrl={userAvatarUrl} size="sm" color="blue" />}
          title={<><Text component="span" fw={700}>{userName}</Text> paga a despesa</>}
          amount={formatBrl(100)}
          amountColor="var(--mantine-color-text)"
        />

        <FlowArrow />

        <Box
          p="xs"
          style={{
            borderRadius: 8,
            background: 'var(--mantine-color-body)',
            border: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Text size="xs" c="dimmed" mb={6}>
            App sugere divisão
          </Text>
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: `${userPct}fr ${partnerPct}fr`,
              gap: 3,
              height: 22,
              marginBottom: 8,
              transition: 'grid-template-columns 180ms ease',
            }}
          >
            <BarSegment color="var(--mantine-color-blue-6)" pct={userPct} />
            <BarSegment
              color={partnerHasName ? PARTNER_COLOR : 'var(--mantine-color-default-border)'}
              pct={partnerPct}
            />
          </Box>
          <Group justify="space-between" gap="xs">
            <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Text component="span" fw={700} style={{ color: 'var(--mantine-color-text)' }}>{userName}:</Text>{' '}
              {formatBrl(userPct)}
            </Text>
            <Text size="xs" c="dimmed" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Text component="span" fw={700} style={{ color: 'var(--mantine-color-text)' }}>{partnerName}:</Text>{' '}
              {formatBrl(partnerPct)}
            </Text>
          </Group>
        </Box>

        <FlowArrow />

        <FlowRow
          avatar={
            <Avatar
              size="sm"
              radius="xl"
              color={partnerHasName ? 'grape' : 'gray'}
              variant={partnerHasName ? 'filled' : 'outline'}
              style={!partnerHasName ? { borderStyle: 'dashed' } : undefined}
            >
              {partnerHasName ? partnerName.charAt(0).toUpperCase() : '?'}
            </Avatar>
          }
          title={
            <>
              <Text component="span" fw={700}>{partnerName}</Text> fica devendo {userName}
              <Text size="xs" c="dimmed" mt={2}>entra no acerto do mês</Text>
            </>
          }
          amount={formatBrl(partnerPct)}
          amountColor={PARTNER_COLOR}
        />
      </Stack>
    </Box>
  )
}

function BarSegment({ color, pct }: { color: string; pct: number }) {
  return (
    <Box
      style={{
        background: color,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10.5,
        fontWeight: 700,
        color: '#fff',
        fontVariantNumeric: 'tabular-nums',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {pct}%
    </Box>
  )
}

interface FlowRowProps {
  avatar: React.ReactNode
  title: React.ReactNode
  amount: string
  amountColor: string
}

function FlowRow({ avatar, title, amount, amountColor }: FlowRowProps) {
  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
      }}
    >
      {avatar}
      <Text size="xs" c="dimmed" style={{ lineHeight: 1.35 }}>
        {title}
      </Text>
      <Text fw={700} style={{ color: amountColor, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
        {amount}
      </Text>
    </Box>
  )
}

function FlowArrow() {
  return (
    <Box
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        paddingLeft: 13,
        color: 'var(--mantine-color-dimmed)',
        height: 14,
        alignItems: 'center',
      }}
    >
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden>
        <path
          d="M5 0v12M1 9l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Box>
  )
}
