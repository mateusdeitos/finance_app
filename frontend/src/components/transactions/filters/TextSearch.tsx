import { TextInput } from '@mantine/core'
import React, { useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useSearch } from '@tanstack/react-router'
import { useSyncTransactionsSearchQuery } from '@/hooks/useSyncTransactionsSearchQuery'
import { TransactionsTestIds } from '@/testIds'

interface TextSearchProps {
  style?: React.CSSProperties
}

export function TextSearch({ style }: TextSearchProps) {
  const search = useSearch({ from: '/_authenticated/transactions' })
  const [value, setValue] = useState(search.query ?? '')

  useSyncTransactionsSearchQuery(value)

  return (
    <TextInput
      placeholder="Buscar transações..."
      leftSection={<IconSearch size={16} />}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      style={{ minWidth: 200, ...style }}
      data-testid={TransactionsTestIds.InputTextSearch}
    />
  )
}
