import { Group, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";
import classes from "./TemplateQuickChips.module.css";

interface Props {
  templates: Transactions.Template[];
  onApply: (template: Transactions.Template) => void;
  onSearch: () => void;
}

/**
 * Presentational row of template quick-apply chips at the top of the create
 * transaction form (APPLY-01). It exposes the three most recently used
 * templates plus search for the complete collection. Hidden entirely when the
 * user has no saved templates. Chips are one-shot action buttons — no
 * active/selected state: clicking always overwrites the form.
 */
export function TemplateQuickChips({ templates, onApply, onSearch }: Props) {
  if (templates.length === 0) return null;

  return (
    <Group gap={6} mt={6} wrap="wrap" data-testid={TransactionsTestIds.TemplateChipsRow}>
      {templates.slice(0, 3).map((template) => (
        <UnstyledButton
          key={template.id}
          type="button"
          onClick={() => onApply(template)}
          className={classes.chip}
          data-testid={TransactionsTestIds.TemplateChip(template.id)}
        >
          {template.name}
        </UnstyledButton>
      ))}
      <UnstyledButton
        type="button"
        onClick={onSearch}
        className={classes.chip}
        data-testid={TransactionsTestIds.TemplateSearchChip}
      >
        <IconSearch size={14} />
        Pesquisar
      </UnstyledButton>
    </Group>
  );
}
