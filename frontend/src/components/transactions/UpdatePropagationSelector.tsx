import { Radio, Stack, Text } from '@mantine/core'

export type PropagationValue = 'current' | 'current_and_future' | 'all'

const options: { value: PropagationValue; label: string; description: string }[] = [
  { value: 'current', label: 'Somente esta', description: 'Atualiza apenas a transação selecionada' },
  { value: 'current_and_future', label: 'Esta e as próximas', description: 'Atualiza esta e todas as recorrências futuras' },
  { value: 'all', label: 'Todas', description: 'Atualiza todas as recorrências da série' },
]

interface Props {
  value: PropagationValue
  onChange: (value: PropagationValue) => void
}

export function UpdatePropagationSelector({ value, onChange }: Props) {
  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">Atualizar recorrências</Text>
      <Radio.Group value={value} onChange={(v) => onChange(v as PropagationValue)}>
        <Stack gap="sm">
          {options.map((opt) => (
            <Radio
              key={opt.value}
              value={opt.value}
              label={opt.label}
              description={opt.description}
              data-testid={`propagation_update_option_${opt.value}`}
            />
          ))}
        </Stack>
      </Radio.Group>
    </Stack>
  )
}
