import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useDrawerContext } from '@/utils/renderDrawer'

type Props = {
  title: string
  message: string
  confirmLabel: string
  /** Stable testid for the modal container. */
  drawerTestId?: string
  /** Stable testid for the confirm button. */
  confirmTestId?: string
}

/**
 * Generic confirmation modal opened via renderDrawer. Resolves with `void` on
 * confirm, rejects on dismiss. Caller wraps with try/catch to branch on intent.
 */
export function ConfirmActionDrawer({
  title,
  message,
  confirmLabel,
  drawerTestId,
  confirmTestId,
}: Props) {
  const { opened, close, reject } = useDrawerContext<void>()

  return (
    <Modal
      opened={opened}
      onClose={reject}
      title={title}
      size="sm"
      data-testid={drawerTestId}
    >
      <Stack gap="md">
        <Text size="sm">{message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={reject}>
            Voltar
          </Button>
          <Button color="red" onClick={() => close()} data-testid={confirmTestId}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
