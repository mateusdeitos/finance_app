import { Button, Group } from '@mantine/core'
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react'
import { ImportTestIds } from '@/testIds'

interface Props {
  importing: boolean
  paused: boolean
  toImportCount: number
  onPause: () => void
  onConfirm: () => void
}

export function ImportConfirmButton({ importing, paused, toImportCount, onPause, onConfirm }: Props) {
  return (
    <Group gap="xs">
      {importing && !paused && (
        <Button
          variant="light"
          color="orange"
          leftSection={<IconPlayerPause size={16} />}
          onClick={onPause}
          data-testid={ImportTestIds.BtnPause}
        >
          Pausar
        </Button>
      )}

      {(!importing || paused) && (
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          onClick={onConfirm}
          disabled={toImportCount === 0}
          data-testid={paused ? ImportTestIds.BtnResume : ImportTestIds.BtnConfirm}
        >
          {paused ? 'Retomar importação' : `Confirmar importação (${toImportCount})`}
        </Button>
      )}
    </Group>
  )
}
