import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useCategories, useDeleteCategory } from '@/hooks/useCategories'
import { useDrawerContext } from '@/utils/renderDrawer'
import { flattenCategories } from '@/utils/flattenCategories'
import { Transactions } from '@/types/transactions'

type Props = {
  category: Transactions.Category
  allCategories: Transactions.Category[]
}

export function DeleteCategoryModal({ category, allCategories }: Props) {
  const { opened, close, reject } = useDrawerContext<void>()
  const [replaceWithId, setReplaceWithId] = useState<string | null>(null)
  const { invalidate } = useCategories()
  const { mutation } = useDeleteCategory({
    onSuccess: () => {
      invalidate()
      close()
    },
  })

  const label = `${category.emoji ? category.emoji + ' ' : ''}${category.name}`

  return (
    <Modal opened={opened} onClose={reject} title="Excluir categoria" size="sm">
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
          <Button variant="default" onClick={reject} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            color="red"
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                id: category.id,
                replaceWithId: replaceWithId ? Number(replaceWithId) : undefined,
              })
            }
            data-testid="btn_confirm_delete_category"
          >
            Excluir
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
