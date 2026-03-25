import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core'
import { Transactions } from '@/types/transactions'

interface Props {
  opened: boolean
  onClose: () => void
  category: Transactions.Category | null
  allCategories: Transactions.Category[]
  onConfirm: (replaceWithId?: number) => void
  isPending: boolean
  error?: string
}

function flattenCategories(cats: Transactions.Category[], excludeId: number): { value: string; label: string }[] {
  const result: { value: string; label: string }[] = []
  for (const cat of cats) {
    if (cat.id !== excludeId) {
      const emoji = cat.emoji ? `${cat.emoji} ` : ''
      result.push({ value: String(cat.id), label: `${emoji}${cat.name}` })
    }
    if (cat.children) {
      for (const child of cat.children) {
        if (child.id !== excludeId) {
          const emoji = child.emoji ? `${child.emoji} ` : ''
          result.push({ value: String(child.id), label: `  ${emoji}${child.name}` })
        }
      }
    }
  }
  return result
}

export function DeleteCategoryDialog({
  opened,
  onClose,
  category,
  allCategories,
  onConfirm,
  isPending,
  error,
}: Props) {
  const [replaceWithId, setReplaceWithId] = useState<string | null>(null)

  if (!category) return null

  const options = flattenCategories(allCategories, category.id)

  function handleConfirm() {
    onConfirm(replaceWithId ? Number(replaceWithId) : undefined)
  }

  function handleClose() {
    setReplaceWithId(null)
    onClose()
  }

  const label = category.emoji ? `${category.emoji} ${category.name}` : category.name

  return (
    <Modal opened={opened} onClose={handleClose} title="Excluir categoria" size="sm">
      <Stack gap="md">
        {error && (
          <Alert color="red" title="Erro" variant="light">
            {error}
          </Alert>
        )}

        <Text size="sm">
          Tem certeza que deseja excluir <strong>{label}</strong>? As transações associadas serão
          atualizadas conforme a opção abaixo.
        </Text>

        <Select
          label="Substituir por (opcional)"
          placeholder="Deixar sem categoria"
          data={options}
          value={replaceWithId}
          onChange={setReplaceWithId}
          clearable
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={handleClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button color="red" onClick={handleConfirm} loading={isPending}>
            Excluir
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
