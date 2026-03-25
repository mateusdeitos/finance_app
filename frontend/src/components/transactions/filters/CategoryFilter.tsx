import { Button, Checkbox, Collapse, Group, Indicator, Popover, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconCategory, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Transactions } from '@/types/transactions'
import { useCategories } from '@/hooks/useCategories'
import classes from './CategoryFilter.module.css'

interface CategoryNodeProps {
  category: Transactions.Category
  selected: number[]
  onToggle: (id: number) => void
}

function CategoryNode({ category, selected, onToggle }: CategoryNodeProps) {
  const hasChildren = (category.children?.length ?? 0) > 0
  const [expanded, setExpanded] = useState(false)

  return (
    <Stack gap={4}>
      <Group gap={4} wrap="nowrap">
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
        <Checkbox
          label={
            <Group gap={6} wrap="nowrap">
              {category.emoji && <Text size="sm" lh={1}>{category.emoji}</Text>}
              <Text size="sm">{category.name}</Text>
            </Group>
          }
          checked={selected.includes(category.id)}
          onChange={() => onToggle(category.id)}
        />
      </Group>
      {hasChildren && (
        <Collapse in={expanded}>
          <Stack gap={4} ml={42}>
            {category.children!.map((child) => (
              <Checkbox
                key={child.id}
                label={
                  <Group gap={6} wrap="nowrap">
                    {child.emoji && <Text size="sm" lh={1}>{child.emoji}</Text>}
                    <Text size="sm">{child.name}</Text>
                  </Group>
                }
                checked={selected.includes(child.id)}
                onChange={() => onToggle(child.id)}
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
  const navigate = useNavigate({ from: '/transactions' })
  const search = useSearch({ from: '/_authenticated/transactions' })
  const [opened, setOpened] = useState(false)

  const selected: number[] = search.categoryIds ?? []

  function toggle(id: number) {
    const next = selected.includes(id)
      ? selected.filter((c) => c !== id)
      : [...selected, id]
    navigate({ search: (prev) => ({ ...prev, categoryIds: next.length ? next : undefined }) })
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
          >
            Categorias
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" maw={280} className={classes.list}>
          <CategoryOptions categories={categories} selected={selected} toggle={toggle} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
