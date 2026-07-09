import { Group, UnstyledButton } from "@mantine/core";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";
import classes from "./TemplateQuickChips.module.css";

interface Props {
  templates: Transactions.Template[];
  onApply: (template: Transactions.Template) => void;
}

/**
 * Presentational row of template quick-apply chips at the top of the create
 * transaction form (APPLY-01). Hidden entirely when the user has no saved
 * templates. Chips are one-shot action buttons — no active/selected state
 * (D-02): clicking always overwrites the form (D-01).
 */
export function TemplateQuickChips({ templates, onApply }: Props) {
  if (templates.length === 0) return null;

  return (
    <Group gap={6} mt={6} wrap="wrap" data-testid={TransactionsTestIds.TemplateChipsRow}>
      {templates.map((template) => (
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
    </Group>
  );
}
