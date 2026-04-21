import { Badge, Button, Group, Indicator, Popover, Stack, Text } from '@mantine/core'
import { IconTag } from '@tabler/icons-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useTags } from '@/hooks/useTags'

interface TagFilterProps {
  inline?: boolean
}

function TagOptions({ tags, selected, toggle }: {
  tags: { id: number; name: string }[]
  selected: number[]
  toggle: (id: number) => void
}) {
  return (
    <Group gap="xs">
      {tags.length === 0 && (
        <Badge variant="light" color="gray">Nenhuma tag</Badge>
      )}
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          variant={selected.includes(tag.id) ? 'filled' : 'outline'}
          style={{ cursor: 'pointer' }}
          onClick={() => toggle(tag.id)}
          data-testid={`badge_filter_tag_${tag.id}`}
          data-tag-name={tag.name}
        >
          {tag.name}
        </Badge>
      ))}
    </Group>
  )
}

export function TagFilter({ inline }: TagFilterProps) {
  const { query: tagsQuery } = useTags()
  const tags = tagsQuery.data ?? []
  const navigate = useNavigate({ from: '/transactions' })
  const search = useSearch({ from: '/_authenticated/transactions' })
  const [opened, setOpened] = useState(false)

  const selected: number[] = search.tagIds ?? []

  function toggle(id: number) {
    const next = selected.includes(id)
      ? selected.filter((t) => t !== id)
      : [...selected, id]
    navigate({ search: (prev) => ({ ...prev, tagIds: next.length ? next : undefined }) })
  }

  if (inline) {
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>Tags</Text>
        <TagOptions tags={tags} selected={selected} toggle={toggle} />
      </Stack>
    )
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md">
      <Popover.Target>
        <Indicator label={selected.length} size={16} disabled={!selected.length}>
          <Button
            variant="default"
            leftSection={<IconTag size={16} />}
            onClick={() => setOpened((o) => !o)}
            data-testid="btn_filter_tags"
          >
            Tags
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown data-testid="popover_filter_tags">
        <TagOptions tags={tags} selected={selected} toggle={toggle} />
      </Popover.Dropdown>
    </Popover>
  )
}
