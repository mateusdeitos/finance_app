import { Button, Drawer, Radio, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useDrawerContext } from '@/utils/renderDrawer'
import { TransactionsTestIds } from '@/testIds'

export type PropagationSetting = 'current' | 'current_and_future' | 'all'

interface PropagationSettingsDrawerProps {
  actionLabel?: 'excluir' | 'alterar'
}

export function PropagationSettingsDrawer({ actionLabel = 'excluir' }: PropagationSettingsDrawerProps) {
  const { opened, close, reject } = useDrawerContext<PropagationSetting>()
  const [value, setValue] = useState<PropagationSetting>('current')

  const isDelete = actionLabel === 'excluir'

  const copy = {
    title: isDelete ? 'Excluir transações recorrentes' : 'Atualizar transações recorrentes',
    body: isDelete
      ? 'Algumas transações selecionadas fazem parte de uma série recorrente. Como deseja excluí-las?'
      : 'Algumas transações selecionadas fazem parte de uma série recorrente. Como deseja atualizá-las?',
    options: [
      {
        value: 'current' as const,
        label: 'Somente esta',
        description: isDelete ? 'Exclui apenas a transação selecionada' : 'Altera apenas a transação selecionada',
      },
      {
        value: 'current_and_future' as const,
        label: 'Esta e as próximas',
        description: isDelete ? 'Exclui esta e todas as recorrências futuras' : 'Altera esta e todas as recorrências futuras',
      },
      {
        value: 'all' as const,
        label: 'Todas',
        description: isDelete ? 'Exclui todas as recorrências da série' : 'Altera todas as recorrências da série',
      },
    ],
    confirmLabel: isDelete ? 'Confirmar exclusão' : 'Confirmar alteração',
    confirmColor: isDelete ? 'red' : undefined,
    confirmTestId: isDelete ? 'btn_propagation_confirm' : 'btn_propagation_confirm_update',
  }

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      position="bottom"
      title={copy.title}
      styles={{
        content: {
          borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0',
          height: 'auto',
          maxHeight: '80dvh',
        },
        body: { paddingBottom: 'var(--mantine-spacing-xl)' },
      }}
    >
      <Stack gap="md" data-testid={TransactionsTestIds.PropagationDrawerBody}>
        <Text size="sm" c="dimmed">
          {copy.body}
        </Text>
        <Radio.Group value={value} onChange={(v) => setValue(v as PropagationSetting)}>
          <Stack gap="sm">
            {copy.options.map((opt) => (
              <Radio
                key={opt.value}
                value={opt.value}
                label={opt.label}
                description={opt.description}
                data-testid={TransactionsTestIds.PropagationOption(opt.value)}
              />
            ))}
          </Stack>
        </Radio.Group>
        <Button
          color={copy.confirmColor}
          onClick={() => close(value)}
          style={{ alignSelf: 'flex-start' }}
          data-testid={copy.confirmTestId}
        >
          {copy.confirmLabel}
        </Button>
      </Stack>
    </Drawer>
  )
}
