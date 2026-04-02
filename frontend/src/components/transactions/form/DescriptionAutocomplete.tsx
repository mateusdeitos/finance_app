import { Autocomplete } from "@mantine/core";
import { useTransactionSuggestions } from "@/hooks/useTransactionSuggestions";
import { Transactions } from "@/types/transactions";
import { forwardRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSuggestionSelect: (suggestion: Transactions.TransactionSuggestion) => void;
  error?: string;
  required?: boolean;
}

function selectUniqueDescriptions(
  suggestions: Transactions.TransactionSuggestion[]
) {
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    if (seen.has(s.description)) return false;
    seen.add(s.description);
    return true;
  });
}

export const DescriptionAutocomplete = forwardRef<HTMLInputElement, Props>(
  function DescriptionAutocomplete(
    { value, onChange, onSuggestionSelect, error, required }: Props,
    ref
  ) {
    const { data: suggestions = [] } = useTransactionSuggestions(
      value,
      selectUniqueDescriptions
    );

    const options = suggestions.map((s) => s.description);

    function handleOptionSubmit(val: string) {
      const match = suggestions.find((s) => s.description === val);
      if (match) onSuggestionSelect(match);
      onChange(val);
    }

    return (
      <Autocomplete
        ref={ref}
        label="Descrição"
        placeholder="Ex: Supermercado"
        required={required}
        value={value}
        onChange={onChange}
        onOptionSubmit={handleOptionSubmit}
        data={options}
        error={error}
        data-testid="input_description"
      />
    );
  }
);
