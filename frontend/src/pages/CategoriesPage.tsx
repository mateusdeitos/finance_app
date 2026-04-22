import { useState } from 'react'
import { Button, Group, Skeleton, Stack, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useCategories, useCreateCategory, useUpdateCategory } from '@/hooks/useCategories'
import { CategoryCard } from '@/components/categories/CategoryCard'
import { DeleteCategoryModal } from '@/components/categories/DeleteCategoryModal'
import { InlineNewCategory } from '@/components/categories/InlineNewCategory'
import { renderDrawer } from '@/utils/renderDrawer'
import { Transactions } from '@/types/transactions'
import { CategoriesTestIds } from '@/testIds'

// pendingParentId:
//   null        → no inline input
//   'root'      → inline input at end of root list
//   number      → inline input at end of that category's children
type PendingParentId = number | 'root' | null

export function CategoriesPage() {
  const { query, invalidate } = useCategories()
  const { mutation: updateMutation } = useUpdateCategory({ onSuccess: invalidate })
  const { mutation: createMutation } = useCreateCategory({
    onSuccess: () => {
      invalidate()
      setPendingParentId(null)
    },
  })

  const [pendingParentId, setPendingParentId] = useState<PendingParentId>(null)

  const categories = query.data ?? []

  async function handleCreateInline(name: string, parentId?: number) {
    await createMutation.mutateAsync({ name, parent_id: parentId })
  }

  function handleDelete(category: Transactions.Category) {
    void renderDrawer(() => (
      <DeleteCategoryModal category={category} allCategories={categories} />
    )).catch(() => {})
  }

  async function handleSaveName(category: Transactions.Category, name: string) {
    await updateMutation.mutateAsync({
      id: category.id,
      payload: { name, emoji: category.emoji, parent_id: category.parent_id },
    })
  }

  async function handleSaveEmoji(category: Transactions.Category, emoji: string | undefined) {
    await updateMutation.mutateAsync({
      id: category.id,
      payload: { name: category.name, emoji, parent_id: category.parent_id },
    })
    invalidate()
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="xl">Categorias</Text>
        {categories.length > 0 && (
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setPendingParentId('root')}
            size="sm"
            data-testid={CategoriesTestIds.BtnNew}
          >
            Nova Categoria
          </Button>
        )}
      </Group>

      {query.isLoading ? (
        <Stack gap="sm">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={44} radius="md" />
          ))}
        </Stack>
      ) : categories.length === 0 && pendingParentId === null ? (
        <Stack align="center" py="xl" gap="sm">
          <Text c="dimmed">Nenhuma categoria cadastrada</Text>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setPendingParentId('root')} data-testid={CategoriesTestIds.BtnCreateFirst}>
            Criar primeira categoria
          </Button>
        </Stack>
      ) : (
        <Stack gap={4}>
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              pendingParentId={typeof pendingParentId === 'number' ? pendingParentId : null}
              onDelete={handleDelete}
              onAddChild={(parent) => setPendingParentId(parent.id)}
              onCancelCreate={() => setPendingParentId(null)}
              onCreateChild={(name, parentId) => handleCreateInline(name, parentId)}
              onSaveName={handleSaveName}
              onSaveEmoji={handleSaveEmoji}
            />
          ))}

          {/* inline input for new root category at end of list */}
          {pendingParentId === 'root' && (
            <InlineNewCategory
              depth={0}
              onSave={(name) => handleCreateInline(name)}
              onCancel={() => setPendingParentId(null)}
            />
          )}
        </Stack>
      )}
    </Stack>
  )
}
