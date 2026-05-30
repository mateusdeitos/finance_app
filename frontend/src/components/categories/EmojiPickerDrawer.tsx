import { Button, Drawer, ScrollArea, SimpleGrid, Stack, UnstyledButton } from '@mantine/core'
import { useState } from 'react'
import { renderDrawer, useDrawerContext } from '@/utils/renderDrawer'
import { Transactions } from '@/types/transactions'
import { CategoriesTestIds } from '@/testIds'
import { EMOJI_OPTIONS } from './emojiOptions'

/**
 * Result of {@link pickEmoji}:
 *  - a string → the chosen emoji
 *  - `null`   → the user explicitly cleared the emoji
 *  - `undefined` (rejected promise) → the user dismissed without changing anything
 */
type EmojiResult = string | null

function EmojiPickerDrawer({ current }: { current?: string }) {
  const { opened, close, reject } = useDrawerContext<EmojiResult>()
  const [staged, setStaged] = useState<string | undefined>(current)

  function toggle(emoji: string) {
    setStaged((prev) => (prev === emoji ? undefined : emoji))
  }

  function confirm() {
    close(staged ?? null)
  }

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      title="Escolher emoji"
      position="right"
      size="sm"
      data-testid={CategoriesTestIds.DrawerEmojiPicker(current ?? 'new')}
    >
      <Stack gap="md">
        <ScrollArea>
          <SimpleGrid cols={7} spacing="xs">
            {EMOJI_OPTIONS.map((e) => (
              <UnstyledButton
                key={e}
                onClick={() => toggle(e)}
                data-testid={CategoriesTestIds.EmojiOption(e)}
                style={{
                  fontSize: 24,
                  textAlign: 'center',
                  padding: 4,
                  borderRadius: 6,
                  background: e === staged ? 'var(--mantine-color-blue-1)' : undefined,
                }}
              >
                {e}
              </UnstyledButton>
            ))}
          </SimpleGrid>
        </ScrollArea>
        {staged && (
          <UnstyledButton
            onClick={() => setStaged(undefined)}
            style={{ color: 'var(--mantine-color-red-6)', fontSize: 14, textAlign: 'center' }}
          >
            Remover emoji
          </UnstyledButton>
        )}
        <Button onClick={confirm} fullWidth mt="md">Salvar</Button>
      </Stack>
    </Drawer>
  )
}

/**
 * Opens the emoji picker for a category and resolves with the chosen emoji,
 * `null` if it was cleared, or `undefined` if the user dismissed the drawer.
 */
export async function pickEmoji(category: Transactions.Category): Promise<EmojiResult | undefined> {
  return renderDrawer<EmojiResult>(() => <EmojiPickerDrawer current={category.emoji} />).catch(
    () => undefined,
  )
}
