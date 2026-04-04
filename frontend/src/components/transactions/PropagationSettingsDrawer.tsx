import { Button, Drawer, Radio, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useDrawerContext } from '@/utils/renderDrawer'

export type PropagationSetting = 'current' | 'current_and_future' | 'all'

const options: { value: PropagationSetting; label: string; description: string }[] = [
  { value: 'current', label: 'Somente esta', description: 'Exclui apenas a transação selecionada' },
  { value: 'current_and_future', label: 'Esta e as próximas', description: 'Exclui esta e todas as recorrências futuras' },
  { value: 'all', label: 'Todas', description: 'Exclui todas as recorrências da série' },
]

export function PropagationSettingsDrawer() {
  const { opened, close, reject } = useDrawerContext<PropagationSetting>()
  const [value, setValue] = useState<PropagationSetting>('current')

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      position="bottom"
      title="Excluir transações recorrentes"
      styles={{
        content: {
          borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0',
          height: 'auto',
          maxHeight: '80dvh',
        },
        body: { paddingBottom: 'var(--mantine-spacing-xl)' },
      }}
    >
      <Stack gap="md" data-testid="propagation_drawer_body">
        <Text size="sm" c="dimmed">
          Algumas transações selecionadas fazem parte de uma série recorrente. Como deseja excluí-las?
        </Text>
        <Radio.Group value={value} onChange={(v) => setValue(v as PropagationSetting)}>
          <Stack gap="sm">
            {options.map((opt) => (
              <Radio
                key={opt.value}
                value={opt.value}
                label={opt.label}
                description={opt.description}
                data-testid={`propagation_option_${opt.value}`}
              />
            ))}
          </Stack>
        </Radio.Group>
        <Button color="red" onClick={() => close(value)} style={{ alignSelf: 'flex-start' }} data-testid="btn_propagation_confirm">
          Confirmar exclusão
        </Button>
      </Stack>
    </Drawer>
  )
}
