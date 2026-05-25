import { Button, Checkbox, Collapse, Group, Indicator, Popover, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconCategory, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useTransactionsSearch } from '@/hooks/useTransactionsSearch'
import { useState } from 'react'
import { Transactions } from '@/types/transactions'
import { useCategories } from '@/hooks/useCategories'
import classes from './CategoryFilter.module.css'
import { TransactionsTestIds } from '@/testIds'

interface CategoryRowProps {
  category: Transactions.Category
  checked: boolean
  onToggle: () => void
  isRoot?: boolean
}

function CategoryRow({ category, checked, onToggle, isRoot }: CategoryRowProps) {
  return (
    <label
      className={`${classes.row}${checked ? ` ${classes.rowSelected}` : ''}`}
      data-category-name={category.name}
    >
      <span className={classes.label}>
        {category.emoji && <Text size="sm" lh={1}>{category.emoji}</Text>}
        <span className={`${classes.name}${isRoot ? ` ${classes.nameRoot}` : ''}`}>
          {category.name}
        </span>
      </span>
      <Checkbox
        checked={checked}
        onChange={onToggle}
        size="sm"
        tabIndex={-1}
        data-testid={TransactionsTestIds.CheckboxFilterCategory(category.id)}
        aria-label={category.name}
      />
    </label>
  )
}

interface CategoryNodeProps {
  category: Transactions.Category
  selected: number[]
  onToggle: (id: number) => void
}

function CategoryNode({ category, selected, onToggle }: CategoryNodeProps) {
  const hasChildren = (category.children?.length ?? 0) > 0
  const [expanded, setExpanded] = useState(false)

  return (
    <Stack gap={2}>
      <Group gap={4} wrap="nowrap" align="center">
        {hasChildren ? (
          <UnstyledButton onClick={() => setExpanded((e) => !e)} style={{ lineHeight: 1, display: 'flex' }}>
            {expanded
              ? <IconChevronDown size={14} />
              : <IconChevronRight size={14} />
            }
          </UnstyledButton>
        ) : (
          <span style={{ width: 14 }} />
        )}
        <CategoryRow
          category={category}
          checked={selected.includes(category.id)}
          onToggle={() => onToggle(category.id)}
          isRoot
        />
      </Group>
      {hasChildren && (
        <Collapse expanded={expanded}>
          <Stack gap={2} ml={32}>
            {category.children!.map((child) => (
              <CategoryRow
                key={child.id}
                category={child}
                checked={selected.includes(child.id)}
                onToggle={() => onToggle(child.id)}
              />
            ))}
          </Stack>
        </Collapse>
      )}
    </Stack>
  )
}

interface CategoryFilterProps {
  inline?: boolean
}

function CategoryOptions({ categories, selected, toggle }: {
  categories: Transactions.Category[]
  selected: number[]
  toggle: (id: number) => void
}) {
  const roots = categories.filter((c) => !c.parent_id)
  if (roots.length === 0) {
    return <Text size="sm" c="dimmed">Nenhuma categoria</Text>
  }
  return (
    <>
      {roots.map((cat) => (
        <CategoryNode key={cat.id} category={cat} selected={selected} onToggle={toggle} />
      ))}
    </>
  )
}

export function CategoryFilter({ inline }: CategoryFilterProps) {
  const { query: categoriesQuery } = useCategories()
  const categories = categoriesQuery.data ?? []
  const { search, update } = useTransactionsSearch()
  const [opened, setOpened] = useState(false)

  const selected: number[] = search.categoryIds ?? []

  function toggle(id: number) {
    const next = selected.includes(id)
      ? selected.filter((c) => c !== id)
      : [...selected, id]
    update((prev) => ({ ...prev, categoryIds: next }))
  }

  if (inline) {
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>Categorias</Text>
        <Stack gap="xs" className={classes.list}>
          <CategoryOptions categories={categories} selected={selected} toggle={toggle} />
        </Stack>
      </Stack>
    )
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md">
      <Popover.Target>
        <Indicator label={selected.length} size={16} disabled={!selected.length}>
          <Button
            variant="default"
            leftSection={<IconCategory size={16} />}
            onClick={() => setOpened((o) => !o)}
            data-testid={TransactionsTestIds.BtnFilter('categories')}
          >
            Categorias
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown data-testid={TransactionsTestIds.PopoverFilter('categories')}>
        <Stack gap="xs" maw={280} className={classes.list}>
          <CategoryOptions categories={categories} selected={selected} toggle={toggle} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
