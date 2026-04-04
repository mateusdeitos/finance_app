import { ActionIcon, Button } from '@mantine/core'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { IconX } from '@tabler/icons-react'

interface ClearFiltersButtonProps {
  variant?: 'icon' | 'button'
}

function useHasActiveFilters() {
  const search = useSearch({ from: '/_authenticated/transactions' })
  return (
    search.tagIds.length > 0 ||
    search.categoryIds.length > 0 ||
    search.accountIds.length > 0 ||
    search.types.length > 0 ||
    search.query !== '' ||
    search.hideSettlements === true
  )
}

export function ClearFiltersButton({ variant = 'button' }: ClearFiltersButtonProps) {
  const hasActiveFilters = useHasActiveFilters()
  const navigate = useNavigate({ from: '/transactions' })

  if (!hasActiveFilters) return null

  function clearFilters() {
    navigate({
      search: (prev) => ({
        ...prev,
        tagIds: [],
        categoryIds: [],
        accountIds: [],
        types: [],
        query: '',
        hideSettlements: false,
      }),
    })
  }

  if (variant === 'icon') {
    return (
      <ActionIcon
        size="xl"
        radius="xl"
        variant="filled"
        color="red"
        onClick={clearFilters}
        aria-label="Limpar filtros"
      >
        <IconX size={20} />
      </ActionIcon>
    )
  }

  return (
    <Button
      size="xs"
      variant="subtle"
      color="red"
      leftSection={<IconX size={12} />}
      onClick={clearFilters}
    >
      Limpar filtros
    </Button>
  )
}
