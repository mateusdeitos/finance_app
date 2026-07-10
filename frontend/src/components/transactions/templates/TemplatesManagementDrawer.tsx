import { Button, Group, ScrollArea, Stack, Text, Tooltip } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { renderDrawer, useDrawerContext } from "@/utils/renderDrawer";
import { useTransactionTemplates } from "@/hooks/useTransactionTemplates";
import { TransactionsTestIds } from "@/testIds";
import { TemplateFormDrawer } from "./TemplateFormDrawer";
import { TemplateListRow } from "./TemplateListRow";

/** Backend-enforced cap (defense in depth, D-02/D-05). */
const TEMPLATE_CAP = 3;

/** Lists the user's templates (name/type/account); "+ Novo" creates, each row
 * edits/deletes. Opened from the transactions toolbar "more options" menu. */
export function TemplatesManagementDrawer() {
  const { opened, reject } = useDrawerContext<void>();
  const { query, invalidate } = useTransactionTemplates();
  const templates = query.data ?? [];
  const atCap = templates.length >= TEMPLATE_CAP;

  function handleNew() {
    // TemplateFormDrawer already invalidates on its own success; this extra
    // invalidate after the promise settles is defensive (harmless dedupe).
    void renderDrawer(() => <TemplateFormDrawer />).then(() => invalidate());
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Modelos"
      data-testid={TransactionsTestIds.TemplatesManagementDrawer}
    >
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            {templates.length}/{TEMPLATE_CAP} modelos
          </Text>
          <Tooltip label="Você já tem 3 modelos" disabled={!atCap}>
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={handleNew}
              disabled={atCap}
              data-testid={TransactionsTestIds.TemplateBtnNew}
            >
              Novo
            </Button>
          </Tooltip>
        </Group>

        {templates.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            Nenhum modelo ainda
          </Text>
        ) : (
          <ScrollArea.Autosize mah="65vh">
            <Stack gap="lg">
              {templates.map((t) => (
                <TemplateListRow key={t.id} template={t} />
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </ResponsiveDrawer>
  );
}
