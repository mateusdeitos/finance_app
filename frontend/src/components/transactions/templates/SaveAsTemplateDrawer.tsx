import { useState } from "react";
import { Alert, Button, Group, Stack, TextInput } from "@mantine/core";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { useDrawerContext } from "@/utils/renderDrawer";
import { useCreateTransactionTemplate, useTransactionTemplates } from "@/hooks/useTransactionTemplates";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";

interface Props {
  payload: Transactions.TemplatePayload;
  suggestedName: string;
}

/** Confirm-name mini drawer for MNG-02: takes a pre-built `TemplatePayload`
 * (snapshotted from the create form) and creates a template once the user
 * confirms/edits the suggested name. Success invalidates the templates query
 * so the chip row + management list refresh immediately. */
export function SaveAsTemplateDrawer({ payload, suggestedName }: Props) {
  const { opened, close, reject } = useDrawerContext<Transactions.Template | void>();
  const { invalidate } = useTransactionTemplates();
  const [name, setName] = useState(suggestedName.slice(0, 100));
  const [touched, setTouched] = useState(false);

  const { mutation } = useCreateTransactionTemplate({
    onSuccess: async (created) => {
      await invalidate();
      close(created);
    },
  });

  const trimmedName = name.trim();
  const nameError = touched && !trimmedName ? "Nome é obrigatório" : undefined;
  const error = mutation.error?.message;

  function handleConfirm() {
    setTouched(true);
    if (!trimmedName) return;
    mutation.mutate({ name: trimmedName, payload });
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Salvar como modelo"
      data-testid={TransactionsTestIds.SaveAsTemplateDrawer}
    >
      <Stack gap="md">
        {error && (
          <Alert
            color="red"
            title="Erro"
            variant="light"
            data-testid={TransactionsTestIds.SaveAsTemplateError}
          >
            {error}
          </Alert>
        )}

        <TextInput
          label="Nome do modelo"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={() => setTouched(true)}
          error={nameError}
          data-testid={TransactionsTestIds.SaveAsTemplateInputName}
        />

        <Group justify="flex-end" mt="sm">
          <Button
            onClick={handleConfirm}
            loading={mutation.isPending}
            data-testid={TransactionsTestIds.TemplateBtnConfirmSaveAsTemplate}
          >
            Salvar
          </Button>
        </Group>
      </Stack>
    </ResponsiveDrawer>
  );
}
