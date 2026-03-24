import { Autocomplete } from '@mantine/core'
import { useTransactionSuggestions } from '@/hooks/useTransactionSuggestions'
import { Transactions } from '@/types/transactions'

interface Props {
  value: string
  onChange: (value: string) => void
  onSuggestionSelect: (suggestion: Transactions.TransactionSuggestion) => void
  error?: string
  required?: boolean
}

export function DescriptionAutocomplete({ value, onChange, onSuggestionSelect, error, required }: Props) {
  const { data: suggestions = [] } = useTransactionSuggestions(value)

  // Deduplicate by description and build autocomplete options
  const seen = new Set<string>()
  const options = suggestions
    .filter((s) => {
      if (seen.has(s.description)) return false
      seen.add(s.description)
      return true
    })
    .map((s) => s.description)

  function handleOptionSubmit(val: string) {
    const match = suggestions.find((s) => s.description === val)
    if (match) onSuggestionSelect(match)
    onChange(val)
  }

  return (
    <Autocomplete
      label="Descrição"
      placeholder="Ex: Supermercado"
      required={required}
      value={value}
      onChange={onChange}
      onOptionSubmit={handleOptionSubmit}
      data={options}
      error={error}
    />
  )
}
