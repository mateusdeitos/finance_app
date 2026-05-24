import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { notifications } from '@mantine/notifications'
import { Button, Group, Stack, Text } from '@mantine/core'

const NOTIFICATION_ID = 'pwa-update-available'
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

export function PWAUpdateNotifier() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const checkForUpdates = () => {
        void registration.update()
      }

      const intervalId = window.setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS)

      // PWA standalone keeps the page alive between sessions; checking on
      // visibility change ensures a returning user picks up updates without
      // having to fully reload the app.
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') checkForUpdates()
      }
      document.addEventListener('visibilitychange', onVisibilityChange)

      return () => {
        window.clearInterval(intervalId)
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    },
  })

  useEffect(() => {
    if (!needRefresh) return

    notifications.show({
      id: NOTIFICATION_ID,
      title: 'Nova versão disponível',
      message: (
        <Stack gap="xs" mt={4}>
          <Text size="sm">Atualize para ver as novidades.</Text>
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="subtle"
              onClick={() => {
                notifications.hide(NOTIFICATION_ID)
                setNeedRefresh(false)
              }}
            >
              Depois
            </Button>
            <Button
              size="xs"
              onClick={() => {
                void updateServiceWorker(true)
              }}
            >
              Atualizar
            </Button>
          </Group>
        </Stack>
      ),
      autoClose: false,
      withCloseButton: false,
    })
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
