import { useState } from 'react'
import { Box, Button, Group, Text } from '@mantine/core'
import { IconEyeglass } from '@tabler/icons-react'
import { useMe } from '@/hooks/useMe'
import { useImpersonation } from '@/hooks/useImpersonation'
import { AdminTestIds } from '@/testIds'

/**
 * Inline notice shown while an admin is impersonating a user. Rendered in the
 * navigation chrome (desktop sidebar / mobile "more" menu) rather than as a
 * fixed overlay, so it never covers page content. Driven by
 * `/api/auth/me.impersonator`; offers the only exit control.
 */
export function ImpersonationNotice() {
  const { query } = useMe()
  const me = query.data
  const { stop } = useImpersonation()
  const [stopping, setStopping] = useState(false)

  if (!me?.impersonator) return null

  async function handleStop() {
    setStopping(true)
    try {
      await stop()
    } finally {
      setStopping(false)
    }
  }

  return (
    <Box
      data-testid={AdminTestIds.Banner}
      style={{
        margin: 'var(--mantine-spacing-xs)',
        padding: 'var(--mantine-spacing-xs)',
        borderRadius: 'var(--mantine-radius-md)',
        background: 'var(--mantine-color-orange-light)',
        color: 'var(--mantine-color-orange-light-color)',
      }}
    >
      <Group gap={6} wrap="nowrap" mb={4}>
        <IconEyeglass size={15} />
        <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.03em' }}>
          Impersonando
        </Text>
      </Group>
      <Text size="sm" fw={600} truncate mb="xs" title={me.email}>
        {me.name}
      </Text>
      <Button
        fullWidth
        size="xs"
        color="orange"
        loading={stopping}
        onClick={() => void handleStop()}
        data-testid={AdminTestIds.BannerStop}
      >
        Encerrar
      </Button>
    </Box>
  )
}
