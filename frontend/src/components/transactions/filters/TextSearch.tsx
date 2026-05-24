import { ActionIcon, CloseButton, TextInput } from '@mantine/core'
import React, { useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useSearch } from '@tanstack/react-router'
import { useSyncTransactionsSearchQuery } from '@/hooks/useSyncTransactionsSearchQuery'
import { TransactionsTestIds } from '@/testIds'

interface TextSearchProps {
  style?: React.CSSProperties
  /** Notifies the parent when the input gains/loses focus so it can collapse
   *  sibling filters into a single full-width search row. */
  onFocusChange?: (focused: boolean) => void
}

export function TextSearch({ style, onFocusChange }: TextSearchProps) {
  const search = useSearch({ from: '/_authenticated/transactions' })
  const [value, setValue] = useState(search.query ?? '')

  useSyncTransactionsSearchQuery(value)

  return (
    <TextInput
      placeholder="Buscar transações..."
      radius="xl"
      leftSection={
        <ActionIcon size="sm" variant="transparent" color="gray" tabIndex={-1} aria-hidden>
          <IconSearch size={16} />
        </ActionIcon>
      }
      rightSection={
        value ? (
          <CloseButton
            aria-label="Limpar busca"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setValue('')}
            size="sm"
          />
        ) : null
      }
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
      style={{ minWidth: 200, flex: 1, ...style }}
      data-testid={TransactionsTestIds.InputTextSearch}
    />
  )
}
