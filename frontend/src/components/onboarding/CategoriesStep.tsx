import { Box, Checkbox, Group, Stack, Text } from '@mantine/core'
import { OnboardingTestIds } from '@/testIds'
import type { SuggestedCategory } from './onboardingDefaults'

interface Props {
  categories: SuggestedCategory[]
  selectedSlugs: Set<string>
  onToggle: (slug: string) => void
}

export function CategoriesStep({ categories, selectedSlugs, onToggle }: Props) {
  return (
    <Stack gap="md" data-testid={OnboardingTestIds.StepCategories}>
      <Stack gap={4}>
        <Text fw={600} size="lg">Suas categorias</Text>
        <Text c="dimmed" size="sm">
          Categorias ajudam a organizar suas transações para você entender para onde o seu dinheiro
          está indo (alimentação, lazer, contas fixas...). Sugerimos uma lista pronta para começar — é só
          desmarcar o que não faz sentido para você. Tudo pode ser editado depois na tela de Categorias.
        </Text>
      </Stack>

      <Stack gap="lg">
        {categories.map((parent) => (
          <Stack key={parent.slug} gap="xs">
            <CategoryRow
              category={parent}
              checked={selectedSlugs.has(parent.slug)}
              onToggle={onToggle}
              isParent
            />
            <Stack gap={4} pl="lg">
              {parent.children?.map((child) => (
                <CategoryRow
                  key={child.slug}
                  category={child}
                  checked={selectedSlugs.has(child.slug)}
                  onToggle={onToggle}
                  disabled={!selectedSlugs.has(parent.slug)}
                />
              ))}
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}

interface RowProps {
  category: SuggestedCategory
  checked: boolean
  onToggle: (slug: string) => void
  isParent?: boolean
  disabled?: boolean
}

function CategoryRow({ category, checked, onToggle, isParent, disabled }: RowProps) {
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="center"
      data-testid={OnboardingTestIds.CategoryRow(category.slug)}
      style={{
        padding: '0.5rem 0.75rem',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: isParent ? 'var(--mantine-color-gray-0)' : undefined,
      }}
      onClick={() => !disabled && onToggle(category.slug)}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(category.slug)}
        onClick={(e) => e.stopPropagation()}
        data-testid={OnboardingTestIds.CheckboxCategory(category.slug)}
      />
      <Box w={28} ta="center">
        <Text size="lg" lh={1}>{category.emoji}</Text>
      </Box>
      <Text fw={isParent ? 600 : 400}>{category.name}</Text>
    </Group>
  )
}
