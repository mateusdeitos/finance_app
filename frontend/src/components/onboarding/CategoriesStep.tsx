import { useRef, useState } from 'react'
import { ActionIcon, Box, Button, Checkbox, Group, Stack, Text, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useAutofocusRef } from '@/hooks/useAutofocusRef'
import { OnboardingTestIds } from '@/testIds'
import type { OnboardingCategoryItem } from './onboardingDefaults'

interface Props {
  categories: OnboardingCategoryItem[]
  onToggle: (id: string) => void
  onUpdateName: (id: string, name: string) => void
  onAddParent: (name: string) => void
  onAddChild: (parentId: string, name: string) => void
  onRemove: (id: string) => void
}

export function CategoriesStep({ categories, onToggle, onUpdateName, onAddParent, onAddChild, onRemove }: Props) {
  const [addingParent, setAddingParent] = useState(false)
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null)

  return (
    <Stack gap="md" data-testid={OnboardingTestIds.StepCategories}>
      <Stack gap={4}>
        <Text fw={600} size="lg">Suas categorias</Text>
        <Text c="dimmed" size="sm">
          Categorias ajudam a organizar suas transações para você entender para onde o seu dinheiro
          está indo (alimentação, lazer, contas fixas...). Sugerimos uma lista pronta para começar — é só
          desmarcar o que não faz sentido, editar nomes ou adicionar novas.
        </Text>
      </Stack>

      <Stack gap="lg">
        {categories.map((parent) => {
          const parentSelected = parent.selected
          return (
            <Stack key={parent.id} gap="xs">
              <CategoryRow
                category={parent}
                checked={parentSelected}
                onToggle={() => onToggle(parent.id)}
                onUpdateName={(name) => onUpdateName(parent.id, name)}
                onRemove={parent.isCustom ? () => onRemove(parent.id) : undefined}
                isParent
              />
              <Stack gap={4} pl="lg">
                {parent.children.map((child) => (
                  <CategoryRow
                    key={child.id}
                    category={child}
                    checked={child.selected}
                    onToggle={() => onToggle(child.id)}
                    onUpdateName={(name) => onUpdateName(child.id, name)}
                    onRemove={child.isCustom ? () => onRemove(child.id) : undefined}
                    disabled={!parentSelected}
                  />
                ))}

                {addingChildOf === parent.id ? (
                  <InlineAdd
                    onSave={(name) => { onAddChild(parent.id, name); setAddingChildOf(null) }}
                    onCancel={() => setAddingChildOf(null)}
                  />
                ) : (
                  parentSelected && (
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      leftSection={<IconPlus size={14} />}
                      onClick={() => setAddingChildOf(parent.id)}
                      data-testid={OnboardingTestIds.BtnAddChildCategory(parent.id)}
                    >
                      Adicionar subcategoria
                    </Button>
                  )
                )}
              </Stack>
            </Stack>
          )
        })}

        {addingParent ? (
          <InlineAdd
            onSave={(name) => { onAddParent(name); setAddingParent(false) }}
            onCancel={() => setAddingParent(false)}
            isParent
          />
        ) : (
          <Button
            variant="subtle"
            leftSection={<IconPlus size={16} />}
            onClick={() => setAddingParent(true)}
            data-testid={OnboardingTestIds.BtnAddParentCategory}
          >
            Adicionar categoria
          </Button>
        )}
      </Stack>
    </Stack>
  )
}

interface CategoryRowProps {
  category: OnboardingCategoryItem
  checked: boolean
  onToggle: () => void
  onUpdateName: (name: string) => void
  onRemove?: () => void
  isParent?: boolean
  disabled?: boolean
}

function CategoryRow({ category, checked, onToggle, onUpdateName, onRemove, isParent, disabled }: CategoryRowProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(category.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function commitEdit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== category.name) {
      onUpdateName(trimmed)
    } else {
      setEditValue(category.name)
    }
    setEditing(false)
  }

  function startEdit() {
    if (disabled) return
    setEditValue(category.name)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="center"
      data-testid={OnboardingTestIds.CategoryRow(category.id)}
      style={{
        padding: '0.5rem 0.75rem',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: isParent ? 'var(--mantine-color-gray-0)' : undefined,
      }}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        data-testid={OnboardingTestIds.CheckboxCategory(category.id)}
      />
      <Box w={28} ta="center">
        <Text size="lg" lh={1}>{category.emoji}</Text>
      </Box>

      {editing ? (
        <TextInput
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.currentTarget.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
            if (e.key === 'Escape') { setEditValue(category.name); setEditing(false) }
          }}
          size="sm"
          style={{ flex: 1 }}
          onClick={(e) => e.stopPropagation()}
          data-testid={OnboardingTestIds.InputCategoryName(category.id)}
        />
      ) : (
        <Text
          fw={isParent ? 600 : 400}
          style={{ flex: 1, cursor: disabled ? 'not-allowed' : 'text' }}
          onClick={(e) => { e.stopPropagation(); startEdit() }}
        >
          {category.name}
        </Text>
      )}

      {onRemove && !disabled && (
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          data-testid={OnboardingTestIds.BtnRemoveCategory(category.id)}
        >
          <IconTrash size={14} />
        </ActionIcon>
      )}
    </Group>
  )
}

interface InlineAddProps {
  onSave: (name: string) => void
  onCancel: () => void
  isParent?: boolean
}

function InlineAdd({ onSave, onCancel, isParent }: InlineAddProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useAutofocusRef(inputRef)

  function commit() {
    const trimmed = name.trim()
    if (trimmed) onSave(trimmed)
    else onCancel()
  }

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="center"
      style={{
        padding: '0.5rem 0.75rem',
        borderRadius: 6,
        background: isParent ? 'var(--mantine-color-gray-0)' : undefined,
      }}
    >
      <Box w={28} ta="center">
        <Text size="lg" lh={1}>📌</Text>
      </Box>
      <TextInput
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={isParent ? 'Nome da categoria' : 'Nome da subcategoria'}
        size="sm"
        style={{ flex: 1 }}
        data-testid={OnboardingTestIds.InputNewCategoryName}
      />
    </Group>
  )
}
