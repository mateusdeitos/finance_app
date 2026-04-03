import { ActionIcon, Button, Group, Paper, Text } from '@mantine/core'
import { IconX, IconShare, IconSquarePlus } from '@tabler/icons-react'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import classes from './PWAInstallBanner.module.css'

export function PWAInstallBanner() {
  const {
    showIOSBanner,
    dismissIOSBanner,
    showAndroidBanner,
    dismissAndroidBanner,
    triggerAndroidInstall,
  } = usePWAInstall()

  if (showIOSBanner) {
    return (
      <Paper className={classes.banner} shadow="md" radius={0}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          className={classes.close}
          onClick={dismissIOSBanner}
          aria-label="Fechar"
        >
          <IconX size={16} />
        </ActionIcon>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <img src="/icon-192.png" width={40} height={40} alt="" className={classes.icon} />
          <div>
            <Text size="sm" fw={600} lh={1.3}>
              Instalar FinanceApp
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              Toque em{' '}
              <IconShare size={13} style={{ verticalAlign: 'middle', display: 'inline' }} />{' '}
              e depois em{' '}
              <strong>
                <IconSquarePlus size={13} style={{ verticalAlign: 'middle', display: 'inline' }} />{' '}
                Adicionar à Tela de Início
              </strong>
            </Text>
          </div>
        </Group>
      </Paper>
    )
  }

  if (showAndroidBanner) {
    return (
      <Paper className={classes.banner} shadow="md" radius={0}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          className={classes.close}
          onClick={dismissAndroidBanner}
          aria-label="Fechar"
        >
          <IconX size={16} />
        </ActionIcon>
        <Group gap="xs" wrap="nowrap" align="center">
          <img src="/icon-192.png" width={40} height={40} alt="" className={classes.icon} />
          <div style={{ flex: 1 }}>
            <Text size="sm" fw={600} lh={1.3}>
              Instalar FinanceApp
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              Adicione à tela inicial para acesso rápido
            </Text>
          </div>
          <Button size="xs" onClick={triggerAndroidInstall}>
            Instalar
          </Button>
        </Group>
      </Paper>
    )
  }

  return null
}
