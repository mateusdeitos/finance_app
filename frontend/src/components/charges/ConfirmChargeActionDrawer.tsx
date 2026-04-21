import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useDrawerContext } from '@/utils/renderDrawer'

export type ConfirmChargeAction = 'reject' | 'cancel'

type Props = {
  action: ConfirmChargeAction
}

/**
 * Resolves with `void` on confirm, rejects on dismiss. Caller wraps with
 * try/catch to branch on user intent.
 */
export function ConfirmChargeActionDrawer({ action }: Props) {
  const { opened, close, reject } = useDrawerContext<void>()

  const title = action === 'reject' ? 'Recusar cobrança' : 'Cancelar cobrança'
  const message =
    action === 'reject'
      ? 'Tem certeza que deseja recusar esta cobrança? Esta acao nao pode ser desfeita.'
      : 'Tem certeza que deseja cancelar esta cobrança? Esta acao nao pode ser desfeita.'
  const confirmLabel = action === 'reject' ? 'Recusar' : 'Cancelar cobrança'

  return (
    <Modal
      opened={opened}
      onClose={reject}
      title={title}
      size="sm"
      data-testid={`modal_confirm_${action}_charge`}
    >
      <Stack gap="md">
        <Text size="sm">{message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={reject}>
            Voltar
          </Button>
          <Button
            color="red"
            onClick={() => close()}
            data-testid={`btn_confirm_${action}_charge`}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
