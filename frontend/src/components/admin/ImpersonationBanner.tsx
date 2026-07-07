import { useState } from 'react'
import { Box, Button, Group, Text } from '@mantine/core'
import { IconEyeglass } from '@tabler/icons-react'
import { useMe } from '@/hooks/useMe'
import { useImpersonation } from '@/hooks/useImpersonation'
import { AdminTestIds } from '@/testIds'

/**
 * Persistent, unmissable banner shown while an admin is impersonating a user.
 * Driven by `/api/auth/me`: during impersonation `me` is the target user and
 * carries an `impersonator`. Fixed to the top so it stays visible on every page
 * and offers the only supported way to exit the impersonated session.
 */
export function ImpersonationBanner() {
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
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: 'var(--mantine-color-orange-8)',
        color: 'white',
        paddingTop: 'calc(env(safe-area-inset-top) + 6px)',
        paddingBottom: 6,
        paddingLeft: 'var(--mantine-spacing-md)',
        paddingRight: 'var(--mantine-spacing-md)',
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconEyeglass size={18} />
          <Text size="sm" fw={600} truncate>
            Impersonando {me.name} ({me.email})
          </Text>
        </Group>
        <Button
          size="compact-sm"
          variant="white"
          color="orange"
          loading={stopping}
          onClick={() => void handleStop()}
          data-testid={AdminTestIds.BannerStop}
        >
          Encerrar
        </Button>
      </Group>
    </Box>
  )
}
