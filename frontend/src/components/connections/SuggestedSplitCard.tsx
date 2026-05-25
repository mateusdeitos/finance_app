import { Box, Group, Stack, Text } from '@mantine/core'
import { IconSparkles } from '@tabler/icons-react'

interface SuggestedSplitCardProps {
  inviterPct: number
  inviterName: string
}

export function SuggestedSplitCard({ inviterPct, inviterName }: SuggestedSplitCardProps) {
  const youPct = 100 - inviterPct
  return (
    <Stack
      gap="xs"
      p="sm"
      style={{
        borderRadius: 10,
        background: 'rgba(244, 162, 97, 0.10)',
        border: '1px solid rgba(244, 162, 97, 0.35)',
      }}
    >
      <Group gap={8}>
        <IconSparkles size={14} />
        <Text size="sm" fw={700}>
          {inviterName} sugeriu uma divisão diferente
        </Text>
      </Group>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: `${inviterPct}fr ${youPct}fr`,
          gap: 4,
          height: 36,
        }}
      >
        <SplitChunk
          background="var(--mantine-color-blue-light)"
          borderColor="var(--mantine-color-blue-6)"
          textColor="var(--mantine-color-blue-7)"
          label={`${inviterName} · ${inviterPct}%`}
        />
        <SplitChunk
          background="rgba(156,106,222,0.15)"
          borderColor="#9c6ade"
          textColor="#7048b8"
          label={`Você · ${youPct}%`}
        />
      </Box>
      <Text size="xs" c="dimmed">
        Você pode aceitar esta sugestão ou usar o padrão 50/50.
      </Text>
    </Stack>
  )
}

function SplitChunk({
  background,
  borderColor,
  textColor,
  label,
}: {
  background: string
  borderColor: string
  textColor: string
  label: string
}) {
  return (
    <Box
      style={{
        borderRadius: 6,
        background,
        border: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        color: textColor,
      }}
    >
      {label}
    </Box>
  )
}
