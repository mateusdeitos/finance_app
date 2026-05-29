import { Button, Group, Text } from "@mantine/core";
import { TransactionsTestIds } from "@/testIds";

interface Props {
  title: string;
  onCancel: () => void;
  /** Form id this header's "Salvar" button submits via the `form` attribute. */
  formId: string;
  loading?: boolean;
}

/**
 * Header bar for the create/edit transaction drawer in mobile mode:
 *
 *   [ Cancelar ]   {title}   [ Salvar ]
 *
 * Lives inside Mantine's Drawer.Header so it stays pinned at the top while the
 * body scrolls. The right-hand "Salvar" button is wired to the form via the
 * native `form` attribute — same effect as `type="submit"` inside the form,
 * but works from outside the form element.
 */
export function MobileFormHeader({ title, onCancel, formId, loading }: Props) {
  return (
    <Group justify="space-between" align="center" wrap="nowrap" w="100%" gap="xs">
      <Button variant="subtle" size="compact-sm" onClick={onCancel}>
        Cancelar
      </Button>
      <Text fw={600} size="sm" truncate>
        {title}
      </Text>
      <Button
        type="submit"
        form={formId}
        size="compact-sm"
        loading={loading}
        data-testid={TransactionsTestIds.BtnSave}
      >
        Salvar
      </Button>
    </Group>
  );
}
