import { useRef, useState } from 'react'
import { ActionIcon, Box, Button, Collapse, Drawer, Group, Loader, ScrollArea, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronRight, IconPlus, IconTrash } from '@tabler/icons-react'
import { Transactions } from '@/types/transactions'
import { InlineNewCategory } from './InlineNewCategory'

const EMOJI_OPTIONS = [
  '🏠','🚗','🍔','🛒','💊','✈️','🎬','👕','📚','💡',
  '🏋️','🎮','🐾','💰','🏦','📱','🎁','🌿','☕','🍺',
  '🎵','🏥','⛽','🚌','🏫','💻','🍕','🍣','🧴','🛠️',
  '🌟','❤️','🎂','🤝','🌊','🏔️','🎯','🧾','💳','🏷️',
]

interface Props {
  category: Transactions.Category
  depth?: number
  pendingParentId: number | null
  onDelete: (category: Transactions.Category) => void
  onAddChild: (parent: Transactions.Category) => void
  onCancelCreate: () => void
  onCreateChild: (name: string, parentId: number) => Promise<void>
  onSaveName: (category: Transactions.Category, name: string) => Promise<void>
  onSaveEmoji: (category: Transactions.Category, emoji: string | undefined) => Promise<void>
}

export function CategoryCard({
  category,
  depth = 0,
  pendingParentId,
  onDelete,
  onAddChild,
  onCancelCreate,
  onCreateChild,
  onSaveName,
  onSaveEmoji,
}: Props) {
  const isPendingChild = pendingParentId === category.id
  const hasChildren = (category.children?.length ?? 0) > 0
  const showChildren = hasChildren || isPendingChild

  const [expanded, { toggle, open: forceExpand }] = useDisclosure(true)
  const [emojiOpen, { open: openEmoji, close: closeEmoji }] = useDisclosure(false)
  const [stagedEmoji, setStagedEmoji] = useState<string | undefined>(category.emoji)

  // In-place name editing
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(category.name)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setNameValue(category.name)
    setNameError(undefined)
    setEditingName(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function commitEdit() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === category.name) {
      setEditingName(false)
      return
    }
    setNameSaving(true)
    try {
      await onSaveName(category, trimmed)
      setEditingName(false)
      setNameError(undefined)
    } catch (e: unknown) {
      setNameError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setNameSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditingName(false)
  }

  function handleOpenEmoji() {
    setStagedEmoji(category.emoji)
    openEmoji()
  }

  function handleEmojiSelect(emoji: string) {
    setStagedEmoji(prev => prev === emoji ? undefined : emoji)
  }

  function handleClearEmoji() {
    setStagedEmoji(undefined)
  }

  async function handleCloseEmojiDrawer() {
    if (stagedEmoji !== category.emoji) {
      await onSaveEmoji(category, stagedEmoji)
    }
    closeEmoji()
  }

  function handleAddChild() {
    forceExpand()
    onAddChild(category)
  }

  return (
    <Stack gap={2}>
      <Group gap={4} align="center" style={{ paddingLeft: depth * 20 }} wrap="nowrap" data-category-name={category.name}>
        {/* fold/unfold toggle */}
        {depth === 0 ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            onClick={toggle}
            style={{ visibility: showChildren ? 'visible' : 'hidden' }}
          >
            {expanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          </ActionIcon>
        ) : (
          <Box w={30} />
        )}

        {/* emoji button */}
        <ActionIcon variant="subtle" color="gray" size="md" onClick={handleOpenEmoji} title="Mudar emoji" data-testid={`btn_emoji_${category.id}`}>
          {category.emoji ? (
            <Text size="md" lh={1}>{category.emoji}</Text>
          ) : (
            <Text size="sm" c="dimmed" lh={1}>+😀</Text>
          )}
        </ActionIcon>

        {/* in-place name edit */}
        {editingName ? (
          <TextInput
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.currentTarget.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            size="sm"
            error={nameError}
            style={{ minWidth: 140 }}
            rightSection={nameSaving ? <Loader size={14} /> : null}
            data-testid="input_category_name"
          />
        ) : (
          <UnstyledButton onClick={startEdit} data-testid="btn_category_name">
            <Text fw={depth === 0 ? 600 : 400} size="md" style={{ cursor: 'text' }}>
              {category.name}
            </Text>
          </UnstyledButton>
        )}

        {/* delete */}
        <ActionIcon variant="subtle" color="red" size="md" onClick={() => onDelete(category)} data-testid="btn_category_delete">
          <IconTrash size={18} />
        </ActionIcon>

        {/* add subcategory (root only) */}
        {depth === 0 && (
          <ActionIcon
            variant="subtle"
            color="blue"
            size="md"
            onClick={handleAddChild}
            title="Adicionar subcategoria"
            data-testid="btn_add_subcategory"
          >
            <IconPlus size={18} />
          </ActionIcon>
        )}
      </Group>

      {/* children + inline new child */}
      {showChildren && (
        <Collapse in={expanded}>
          <Stack gap={2}>
            {category.children?.map((child) => (
              <CategoryCard
                key={child.id}
                category={child}
                depth={depth + 1}
                pendingParentId={pendingParentId}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onCancelCreate={onCancelCreate}
                onCreateChild={onCreateChild}
                onSaveName={onSaveName}
                onSaveEmoji={onSaveEmoji}
              />
            ))}
            {isPendingChild && (
              <InlineNewCategory
                depth={depth + 1}
                onSave={(name) => onCreateChild(name, category.id)}
                onCancel={onCancelCreate}
              />
            )}
          </Stack>
        </Collapse>
      )}

      {/* emoji picker drawer */}
      <Drawer opened={emojiOpen} onClose={handleCloseEmojiDrawer} title="Escolher emoji" position="right" size="sm" data-testid={`drawer_emoji_picker_${category.id}`}>
        <Stack gap="md">
          <ScrollArea>
            <SimpleGrid cols={7} spacing="xs">
              {EMOJI_OPTIONS.map((e) => (
                <UnstyledButton
                  key={e}
                  onClick={() => handleEmojiSelect(e)}
                  data-testid={`emoji_${e}`}
                  style={{
                    fontSize: 24,
                    textAlign: 'center',
                    padding: 4,
                    borderRadius: 6,
                    background: e === stagedEmoji ? 'var(--mantine-color-blue-1)' : undefined,
                  }}
                >
                  {e}
                </UnstyledButton>
              ))}
            </SimpleGrid>
          </ScrollArea>
          {stagedEmoji && (
            <UnstyledButton
              onClick={handleClearEmoji}
              style={{ color: 'var(--mantine-color-red-6)', fontSize: 14, textAlign: 'center' }}
            >
              Remover emoji
            </UnstyledButton>
          )}
          <Button onClick={handleCloseEmojiDrawer} fullWidth mt="md">Fechar</Button>
        </Stack>
      </Drawer>
    </Stack>
  )
}
