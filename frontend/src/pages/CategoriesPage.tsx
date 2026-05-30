import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Button, Group, Skeleton, Stack, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useCreateCategory, useUpdateCategory } from '@/hooks/useCategories'
import { useCategorySpending } from '@/hooks/useCategorySpending'
import { useIsMobile } from '@/hooks/useIsMobile'
import { CategorySpendingCard } from '@/components/categories/CategorySpendingCard'
import { CategoryDistributionPanel } from '@/components/categories/CategoryDistributionPanel'
import { DeleteCategoryModal } from '@/components/categories/DeleteCategoryModal'
import { InlineNewCategory } from '@/components/categories/InlineNewCategory'
import { pickEmoji } from '@/components/categories/EmojiPickerDrawer'
import { PeriodNavigator } from '@/components/transactions/PeriodNavigator'
import { Fab } from '@/components/Fab'
import { PullToRefresh } from '@/components/PullToRefresh'
import { renderDrawer } from '@/utils/renderDrawer'
import { Transactions } from '@/types/transactions'
import { CategoriesTestIds } from '@/testIds'

// pendingParentId:
//   null        → no inline input
//   'root'      → inline input at end of root list
//   number      → inline input at end of that category's children
type PendingParentId = number | 'root' | null

function monthLabel(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' })
}

export function CategoriesPage() {
  const { month, year } = useSearch({ from: '/_authenticated/categories' })
  const navigate = useNavigate({ from: '/categories' })

  const { nodes, net, gross, maxAbs, categoriesLoading, spendLoading, invalidate } = useCategorySpending(month, year)
  const { mutation: updateMutation } = useUpdateCategory({ onSuccess: invalidate })
  const { mutation: createMutation } = useCreateCategory({
    onSuccess: () => {
      invalidate()
      setPendingParentId(null)
    },
  })

  const [pendingParentId, setPendingParentId] = useState<PendingParentId>(null)
  const isMobile = useIsMobile()
  const hasCategories = nodes.length > 0

  async function handleCreateInline(name: string, parentId?: number) {
    await createMutation.mutateAsync({ name, parent_id: parentId })
  }

  function handleDelete(category: Transactions.Category) {
    const allCategories = nodes.map((n) => n.category)
    void renderDrawer(() => (
      <DeleteCategoryModal category={category} allCategories={allCategories} />
    )).catch(() => {})
  }

  async function handleSaveName(category: Transactions.Category, name: string) {
    await updateMutation.mutateAsync({
      id: category.id,
      payload: { name, emoji: category.emoji, parent_id: category.parent_id },
    })
  }

  async function handleEditEmoji(category: Transactions.Category) {
    const result = await pickEmoji(category)
    if (result === undefined) return // dismissed without change
    await updateMutation.mutateAsync({
      id: category.id,
      payload: { name: category.name, emoji: result ?? undefined, parent_id: category.parent_id },
    })
  }

  return (
    <PullToRefresh onRefresh={invalidate}>
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text fw={800} size="xl">Categorias</Text>
          <Group gap="sm" wrap="nowrap">
            <PeriodNavigator
              month={month}
              year={year}
              onPeriodChange={(m, y) => void navigate({ search: { month: m, year: y } })}
            />
            {hasCategories && !isMobile && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setPendingParentId('root')}
                size="sm"
                data-testid={CategoriesTestIds.BtnNew}
              >
                Nova categoria
              </Button>
            )}
          </Group>
        </Group>

        {categoriesLoading ? (
          <Stack gap="sm">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={92} radius={16} />
            ))}
          </Stack>
        ) : !hasCategories && pendingParentId === null ? (
          <Stack align="center" py="xl" gap="sm">
            <Text c="dimmed">Nenhuma categoria cadastrada</Text>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setPendingParentId('root')}
              data-testid={CategoriesTestIds.BtnCreateFirst}
            >
              Criar primeira categoria
            </Button>
          </Stack>
        ) : (
          <Stack gap={10}>
            {hasCategories && (
              <CategoryDistributionPanel
                nodes={nodes}
                net={net}
                gross={gross}
                monthLabel={monthLabel(month, year)}
                loading={spendLoading}
              />
            )}

            {nodes.map((node) => (
              <CategorySpendingCard
                key={node.category.id}
                node={node}
                maxAbs={maxAbs}
                valueLoading={spendLoading}
                pendingParentId={typeof pendingParentId === 'number' ? pendingParentId : null}
                onAddChild={(parent) => setPendingParentId(parent.id)}
                onCancelCreate={() => setPendingParentId(null)}
                onCreateChild={(name, parentId) => handleCreateInline(name, parentId)}
                onDelete={handleDelete}
                onSaveName={handleSaveName}
                onEditEmoji={handleEditEmoji}
              />
            ))}

            {/* inline input for a new root category at the end of the list */}
            {pendingParentId === 'root' && (
              <InlineNewCategory
                depth={0}
                variant="card"
                onSave={(name) => handleCreateInline(name)}
                onCancel={() => setPendingParentId(null)}
              />
            )}
          </Stack>
        )}
      </Stack>

      {isMobile && hasCategories && pendingParentId !== 'root' && (
        <Fab
          onClick={() => setPendingParentId('root')}
          ariaLabel="Nova categoria"
          testId={CategoriesTestIds.BtnNew}
        >
          <IconPlus size={24} stroke={2.2} />
        </Fab>
      )}
    </PullToRefresh>
  )
}
