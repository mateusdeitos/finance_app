import { TextInput } from '@mantine/core'
import React from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

interface TextSearchProps {
  style?: React.CSSProperties
}

export function TextSearch({ style }: TextSearchProps) {
  const navigate = useNavigate({ from: '/transactions' })
  const search = useSearch({ from: '/_authenticated/transactions' })
  const [value, setValue] = useState(search.query ?? '')
  const [debounced] = useDebouncedValue(value, 300)

  useEffect(() => {
    navigate({ search: (prev) => ({ ...prev, query: debounced || undefined }) })
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TextInput
      placeholder="Buscar transações..."
      leftSection={<IconSearch size={16} />}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      style={{ minWidth: 200, ...style }}
      data-testid="input_text_search"
    />
  )
}
