import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useDeleteCategory } from '@/hooks/useCategories'
import { flattenCategories } from '@/utils/flattenCategories'
import { Transactions } from '@/types/transactions'

// TODO(migration Phase 5): convert to renderDrawer + useDrawerContext
// with a discriminated result ({ action: 'confirmed'; replaceWithId? } | { action: 'cancelled' }).

type Props = {
  opened: boolean
  onClose: () => void
  category: Transactions.Category | null
  allCategories: Transactions.Category[]
  onSuccess: () => void
}

export function DeleteCategoryModal({ opened, onClose, category, allCategories, onSuccess }: Props) {
  const [replaceWithId, setReplaceWithId] = useState<string | null>(null)
  const { mutation } = useDeleteCategory({
    onSuccess: () => {
      onSuccess()
      handleClose()
    },
  })

  function handleClose() {
    setReplaceWithId(null)
    mutation.reset()
    onClose()
  }

  if (!category) return null
  const label = `${category.emoji ? category.emoji + ' ' : ''}${category.name}`

  return (
    <Modal opened={opened} onClose={handleClose} title="Excluir categoria" size="sm">
      <Stack gap="md">
        {mutation.error && (
          <Alert color="red" title="Erro" variant="light">{mutation.error.message}</Alert>
        )}
        <Text size="sm">
          Tem certeza que deseja excluir <strong>{label}</strong>? As transações associadas serão
          atualizadas conforme a opção abaixo.
        </Text>
        <Select
          label="Substituir por (opcional)"
          placeholder="Deixar sem categoria"
          data={flattenCategories(allCategories, category.id)}
          value={replaceWithId}
          onChange={setReplaceWithId}
          clearable
          searchable
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            color="red"
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ id: category.id, replaceWithId: replaceWithId ? Number(replaceWithId) : undefined })}
            data-testid="btn_confirm_delete_category"
          >
            Excluir
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
