import { MutableRefObject } from 'react'
import { Button, Group } from '@mantine/core'
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react'

interface Props {
  importing: boolean
  paused: boolean
  toImportCount: number
  abortRef: MutableRefObject<AbortController | null>
  onConfirm: () => void
}

export function ImportConfirmButton({ importing, paused, toImportCount, abortRef, onConfirm }: Props) {
  function handlePause() {
    abortRef.current?.abort()
  }

  return (
    <Group gap="xs">
      {importing && (
        <Button
          variant="light"
          color="orange"
          leftSection={<IconPlayerPause size={16} />}
          onClick={handlePause}
        >
          Pausar
        </Button>
      )}

      {(!importing || paused) && (
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          onClick={onConfirm}
          loading={importing && !paused}
          disabled={toImportCount === 0}
        >
          {paused ? 'Retomar importação' : `Confirmar importação (${toImportCount})`}
        </Button>
      )}
    </Group>
  )
}
