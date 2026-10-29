import { useState, type ChangeEvent } from "react";
import { Group, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { TransactionsTestIds } from "@/testIds";
import { Transactions } from "@/types/transactions";
import { useDrawerContext } from "@/utils/renderDrawer";
import classes from "./TemplateSearchDrawer.module.css";

interface Props {
  templates: Transactions.Template[];
}

/** Searches the already-loaded template collection and returns the selected
 * template to the create form. Keeping this client-side avoids a second query
 * for a list the transaction form has already fetched. */
export function TemplateSearchDrawer({ templates }: Props) {
  const { opened, close, reject } = useDrawerContext<Transactions.Template | void>();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTemplates = templates.filter((template) => {
    if (!normalizedQuery) return true;
    return (
      template.name.toLowerCase().includes(normalizedQuery) ||
      template.payload.description.toLowerCase().includes(normalizedQuery)
    );
  });

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.currentTarget.value);
  }

  function handleSelect(template: Transactions.Template) {
    close(template);
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Pesquisar modelos"
      data-testid={TransactionsTestIds.TemplateSearchDrawer}
    >
      <Stack gap="md">
        <TextInput
          autoFocus
          value={query}
          onChange={handleQueryChange}
          placeholder="Nome ou descrição"
          leftSection={<IconSearch size={16} />}
          data-testid={TransactionsTestIds.TemplateSearchInput}
        />

        {visibleTemplates.length === 0 ? (
          <Text c="dimmed" size="sm" ta="center" py="md">
            Nenhum modelo encontrado
          </Text>
        ) : (
          <Stack gap={6}>
            {visibleTemplates.map((template) => (
              <UnstyledButton
                key={template.id}
                type="button"
                className={classes.result}
                onClick={() => handleSelect(template)}
                data-testid={TransactionsTestIds.TemplateSearchResult(template.id)}
              >
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <Text fw={600} size="sm" truncate>
                    {template.name}
                  </Text>
                  <Text c="dimmed" size="xs" truncate>
                    {template.payload.description}
                  </Text>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Stack>
    </ResponsiveDrawer>
  );
}
