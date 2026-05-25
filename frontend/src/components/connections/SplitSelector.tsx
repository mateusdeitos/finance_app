import { Avatar, Box, Button, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconArrowsHorizontal, IconPlus } from '@tabler/icons-react'
import { UserAvatar } from '@/components/UserAvatar'
import { CommonTestIds } from '@/testIds'

const PRESETS = [50, 60, 70, 80] as const

export const PARTNER_COLOR = '#9c6ade'

interface SplitSelectorProps {
  value: number | 'custom'
  customValue: number
  userName: string
  userAvatarUrl?: string
  partnerName: string
  partnerHasName: boolean
  onChange: (next: number | 'custom') => void
  onCustomChange: (pct: number) => void
}

export function SplitSelector({
  value,
  customValue,
  userName,
  userAvatarUrl,
  partnerName,
  partnerHasName,
  onChange,
  onCustomChange,
}: SplitSelectorProps) {
  const isCustom = value === 'custom'
  const userPct = isCustom ? customValue : (value as number)
  const partnerPct = 100 - userPct

  return (
    <Stack gap="sm">
      <Group justify="space-between" gap="xs">
        <Group gap={6}>
          <IconArrowsHorizontal size={14} />
          <Text size="sm" fw={600}>Divisão padrão sugerida</Text>
        </Group>
        <Text size="xs" c="dimmed">Ajustável por transação</Text>
      </Group>

      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: `${userPct}fr ${partnerPct}fr`,
          gap: 4,
          height: 56,
          transition: 'grid-template-columns 180ms ease',
        }}
      >
        <SplitBar
          pct={userPct}
          label={userName}
          color="var(--mantine-color-blue-6)"
          colorSoft="var(--mantine-color-blue-light)"
          avatar={<UserAvatar name={userName} avatarUrl={userAvatarUrl} size="sm" color="blue" />}
        />
        <SplitBar
          pct={partnerPct}
          label={partnerName}
          color={PARTNER_COLOR}
          colorSoft="rgba(156, 106, 222, 0.15)"
          placeholder={!partnerHasName}
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
        />
      </Box>

      <Group gap="xs">
        {PRESETS.map((pct) => {
          const active = !isCustom && value === pct
          return (
            <UnstyledButton
              key={pct}
              data-testid={CommonTestIds.InviteSplitChip(pct)}
              onClick={() => onChange(pct)}
              px={11}
              py={5}
              style={{
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: active ? 'var(--mantine-color-blue-6)' : 'transparent',
                color: active ? '#fff' : 'var(--mantine-color-dimmed)',
                border: `1px solid ${active ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-default-border)'}`,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {pct}/{100 - pct}
            </UnstyledButton>
          )
        })}
        <UnstyledButton
          data-testid={CommonTestIds.InviteSplitChipCustom}
          onClick={() => onChange('custom')}
          px={11}
          py={5}
          style={{
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: isCustom ? 'var(--mantine-color-blue-light)' : 'transparent',
            color: isCustom ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-dimmed)',
            border: `1px dashed ${isCustom ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-default-border)'}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {isCustom ? (
            <>Personalizado · {customValue}/{100 - customValue}</>
          ) : (
            <>
              <IconPlus size={11} /> Personalizar
            </>
          )}
        </UnstyledButton>
      </Group>

      {isCustom && (
        <CustomSplitEditor
          userName={userName}
          value={customValue}
          onChange={onCustomChange}
        />
      )}
    </Stack>
  )
}

interface SplitBarProps {
  pct: number
  label: string
  color: string
  colorSoft: string
  avatar: React.ReactNode
  placeholder?: boolean
}

function SplitBar({ pct, label, color, colorSoft, avatar, placeholder }: SplitBarProps) {
  return (
    <Box
      px="xs"
      py={8}
      style={{
        borderRadius: 8,
        background: colorSoft,
        border: `1px ${placeholder ? 'dashed' : 'solid'} ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minWidth: 0,
        overflow: 'hidden',
        opacity: placeholder ? 0.9 : 1,
      }}
    >
      <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
        {avatar}
        <Text size="xs" fw={600} truncate>
          {label}
        </Text>
      </Group>
      <Text fw={700} style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {pct}%
      </Text>
    </Box>
  )
}

interface CustomSplitEditorProps {
  value: number
  userName: string
  onChange: (pct: number) => void
}

function CustomSplitEditor({ value, userName, onChange }: CustomSplitEditorProps) {
  const clamp = (n: number) => Math.max(1, Math.min(99, n))

  return (
    <Box
      p="sm"
      style={{
        borderRadius: 8,
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Group justify="space-between" gap="md">
        <Text size="xs" fw={600}>
          {userName} paga
        </Text>
        <Group gap={0} style={{
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 6,
          height: 30,
          overflow: 'hidden',
        }}>
          <Button
            data-testid={CommonTestIds.InviteSplitCustomDec}
            variant="subtle"
            color="gray"
            size="xs"
            radius={0}
            onClick={() => onChange(clamp(value - 5))}
            style={{
              width: 28,
              height: '100%',
              borderRight: '1px solid var(--mantine-color-default-border)',
              fontSize: 14,
              fontWeight: 600,
            }}
            px={0}
          >
            −
          </Button>
          <Box style={{
            width: 50,
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {value}%
          </Box>
          <Button
            data-testid={CommonTestIds.InviteSplitCustomInc}
            variant="subtle"
            color="gray"
            size="xs"
            radius={0}
            onClick={() => onChange(clamp(value + 5))}
            style={{
              width: 28,
              height: '100%',
              borderLeft: '1px solid var(--mantine-color-default-border)',
              fontSize: 14,
              fontWeight: 600,
            }}
            px={0}
          >
            +
          </Button>
        </Group>
      </Group>
    </Box>
  )
}
