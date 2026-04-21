import { useRef, useState } from 'react'
import { Button, Drawer, Stack, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useCategories, useCreateCategory, useUpdateCategory } from '@/hooks/useCategories'
import { CategoryCard } from '@/components/categories/CategoryCard'
import { InlineNewCategory } from '@/components/categories/InlineNewCategory'
import { Transactions } from '@/types/transactions'
import { ImportTestIds } from '@/testIds'

type PendingParentId = number | 'root' | null

export function CreateCategoryDrawer() {
  const { opened, close, reject } = useDrawerContext<Transactions.Category | void>()
  const { query, invalidate } = useCategories()
  const lastCreatedRef = useRef<Transactions.Category | null>(null)

  const { mutation: createMutation } = useCreateCategory()
  const { mutation: updateMutation } = useUpdateCategory({ onSuccess: invalidate })

  const [pendingParentId, setPendingParentId] = useState<PendingParentId>('root')
  const categories = query.data ?? []

  async function handleCreateInline(name: string, parentId?: number) {
    const created = await createMutation.mutateAsync({ name, parent_id: parentId })
    lastCreatedRef.current = created
    await invalidate()
    setPendingParentId(null)
  }

  async function handleSaveName(category: { id: number; emoji?: string; parent_id?: number | null }, name: string) {
    await updateMutation.mutateAsync({
      id: category.id,
      payload: { name, emoji: category.emoji, parent_id: category.parent_id ?? undefined },
    })
  }

  async function handleSaveEmoji(category: { id: number; name: string; parent_id?: number | null }, emoji: string | undefined) {
    await updateMutation.mutateAsync({
      id: category.id,
      payload: { name: category.name, emoji, parent_id: category.parent_id ?? undefined },
    })
    await invalidate()
  }

  return (
    <Drawer opened={opened} onClose={reject} title="Categorias" position="right" size="md" data-testid={ImportTestIds.DrawerCreateCategory}>
      <Stack gap="sm">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setPendingParentId('root')}
          size="xs"
          variant="light"
          data-testid={ImportTestIds.BtnNewCategoryInDrawer}
        >
          Nova Categoria
        </Button>

        {categories.length === 0 && pendingParentId === null ? (
          <Text c="dimmed" size="sm">Nenhuma categoria cadastrada</Text>
        ) : (
          <Stack gap={4}>
            {categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                pendingParentId={typeof pendingParentId === 'number' ? pendingParentId : null}
                onDelete={() => {}}
                onAddChild={(parent) => setPendingParentId(parent.id)}
                onCancelCreate={() => setPendingParentId(null)}
                onCreateChild={(name, parentId) => handleCreateInline(name, parentId)}
                onSaveName={handleSaveName}
                onSaveEmoji={handleSaveEmoji}
              />
            ))}

            {pendingParentId === 'root' && (
              <InlineNewCategory
                depth={0}
                onSave={(name) => handleCreateInline(name)}
                onCancel={() => setPendingParentId(null)}
              />
            )}
          </Stack>
        )}

        <Button
          onClick={() => close(lastCreatedRef.current ?? undefined)}
          mt="md"
          data-testid={ImportTestIds.BtnCloseCreateCategoryDrawer}
        >
          Fechar
        </Button>
      </Stack>
    </Drawer>
  )
}
