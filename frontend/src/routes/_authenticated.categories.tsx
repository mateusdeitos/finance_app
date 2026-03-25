import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Skeleton, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { createFileRoute } from '@tanstack/react-router'
import { IconPlus } from '@tabler/icons-react'
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '@/hooks/useCategories'
import { CategoryCard } from '@/components/categories/CategoryCard'
import { InlineNewCategory } from '@/components/categories/InlineNewCategory'
import { Transactions } from '@/types/transactions'

export const Route = createFileRoute('/_authenticated/categories')({
  component: CategoriesPage,
})

// ─── Delete Dialog ───────────────────────────────────────────────────────────

function flattenCategories(cats: Transactions.Category[], excludeId: number): { value: string; label: string }[] {
  const result: { value: string; label: string }[] = []
  for (const cat of cats) {
    if (cat.id !== excludeId) {
      result.push({ value: String(cat.id), label: `${cat.emoji ? cat.emoji + ' ' : ''}${cat.name}` })
    }
    for (const child of cat.children ?? []) {
      if (child.id !== excludeId) {
        result.push({ value: String(child.id), label: `  ${child.emoji ? child.emoji + ' ' : ''}${child.name}` })
      }
    }
  }
  return result
}

interface DeleteDialogProps {
  opened: boolean
  onClose: () => void
  category: Transactions.Category | null
  allCategories: Transactions.Category[]
  onSuccess: () => void
}

function DeleteCategoryModal({ opened, onClose, category, allCategories, onSuccess }: DeleteDialogProps) {
  const [replaceWithId, setReplaceWithId] = useState<string | null>(null)
  const { mutation } = useDeleteCategory({
    onSuccess: () => { onSuccess(); handleClose() },
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
          >
            Excluir
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

// pendingParentId:
//   null        → no inline input
//   'root'      → inline input at end of root list
//   number      → inline input at end of that category's children
type PendingParentId = number | 'root' | null

function CategoriesPage() {
  const { query, invalidate } = useCategories()
  const { mutation: updateMutation } = useUpdateCategory({ onSuccess: invalidate })
  const { mutation: createMutation } = useCreateCategory({ onSuccess: () => { invalidate(); setPendingParentId(null) } })

  const [pendingParentId, setPendingParentId] = useState<PendingParentId>(null)
  const [deleteOpen, { open: openDelete, close: closeDelete }] = useDisclosure(false)
  const [deletingCategory, setDeletingCategory] = useState<Transactions.Category | null>(null)

  const categories = query.data ?? []

  async function handleCreateInline(name: string, parentId?: number) {
    await createMutation.mutateAsync({ name, parent_id: parentId })
  }

  function handleDelete(category: Transactions.Category) {
    setDeletingCategory(category)
    openDelete()
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
          <Button leftSection={<IconPlus size={16} />} onClick={() => setPendingParentId('root')}>
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

      <DeleteCategoryModal
        opened={deleteOpen}
        onClose={closeDelete}
        category={deletingCategory}
        allCategories={categories}
        onSuccess={invalidate}
      />
    </Stack>
  )
}
