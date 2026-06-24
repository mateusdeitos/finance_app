import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useDrawerContext } from '@/utils/renderDrawer'
import { ChargesTestIds } from '@/testIds'

export type ConfirmChargeAction = 'reject' | 'cancel' | 'delete'

type Props = {
  action: ConfirmChargeAction
}

const COPY: Record<ConfirmChargeAction, { title: string; message: string; confirmLabel: string }> = {
  reject: {
    title: 'Recusar cobrança',
    message: 'Tem certeza que deseja recusar esta cobrança? Esta acao nao pode ser desfeita.',
    confirmLabel: 'Recusar',
  },
  cancel: {
    title: 'Cancelar cobrança',
    message: 'Tem certeza que deseja cancelar esta cobrança? Esta acao nao pode ser desfeita.',
    confirmLabel: 'Cancelar cobrança',
  },
  delete: {
    title: 'Excluir cobrança',
    message: 'Tem certeza que deseja excluir esta cobrança? Esta acao nao pode ser desfeita.',
    confirmLabel: 'Excluir',
  },
}

/**
 * Resolves with `void` on confirm, rejects on dismiss. Caller wraps with
 * try/catch to branch on user intent.
 */
export function ConfirmChargeActionDrawer({ action }: Props) {
  const { opened, close, reject } = useDrawerContext<void>()

  const { title, message, confirmLabel } = COPY[action]

  return (
    <Modal
      opened={opened}
      onClose={reject}
      title={title}
      size="sm"
      data-testid={ChargesTestIds.ModalConfirm(action)}
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
            data-testid={ChargesTestIds.BtnConfirm(action)}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
