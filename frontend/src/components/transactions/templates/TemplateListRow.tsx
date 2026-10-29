import { useState } from "react";
import { ActionIcon, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useAccounts } from "@/hooks/useAccounts";
import { useDeleteTransactionTemplate, useTransactionTemplates } from "@/hooks/useTransactionTemplates";
import { renderDrawer } from "@/utils/renderDrawer";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds, type TransactionType } from "@/testIds";
import { TemplateFormDrawer } from "./TemplateFormDrawer";

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

const TYPE_COLOR: Record<TransactionType, string> = {
  expense: "red",
  income: "teal",
  transfer: "blue",
};

interface Props {
  template: Transactions.Template;
}

/** One row of `TemplatesManagementDrawer`: name/type/account + edit + delete
 * (with an inline confirm step, mirroring `DeleteCategoryModal`'s "no silent
 * delete" rule, D-08). */
export function TemplateListRow({ template }: Props) {
  const [confirming, setConfirming] = useState(false);
  const { invalidate } = useTransactionTemplates();
  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];
  const account = accounts.find((a) => a.id === template.payload.account_id);

  const { mutation: deleteMutation } = useDeleteTransactionTemplate({
    onSuccess: () => invalidate(),
  });

  function handleEdit() {
    void renderDrawer(() => <TemplateFormDrawer template={template} />);
  }

  return (
    <Stack gap={6} data-testid={TransactionsTestIds.TemplateRow(template.id)}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate>
            {template.name}
          </Text>
          <Group gap={6} wrap="nowrap">
            <Badge size="xs" color={TYPE_COLOR[template.payload.type]} variant="light">
              {TYPE_LABEL[template.payload.type]}
            </Badge>
            {account && (
              <Text size="xs" c="dimmed" truncate>
                {account.name}
              </Text>
            )}
          </Group>
        </Stack>
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            onClick={handleEdit}
            aria-label="Editar modelo"
            data-testid={TransactionsTestIds.TemplateBtnEdit(template.id)}
          >
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={() => setConfirming(true)}
            aria-label="Excluir modelo"
            data-testid={TransactionsTestIds.TemplateBtnDelete(template.id)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {confirming && (
        <Group gap="xs" justify="flex-end">
          <Text size="xs" c="dimmed" style={{ marginRight: "auto" }}>
            Excluir este modelo?
          </Text>
          <Button size="xs" variant="default" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
          <Button
            size="xs"
            color="red"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(template.id)}
            data-testid={TransactionsTestIds.TemplateBtnConfirmDelete(template.id)}
          >
            Excluir
          </Button>
        </Group>
      )}
    </Stack>
  );
}
