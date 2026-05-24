import { Button, Divider, Drawer, Stack, Text } from "@mantine/core";
import { useDrawerContext } from "@/utils/renderDrawer";
import { TransactionsTestIds } from "@/testIds";
import { AccountFilter } from "./filters/AccountFilter";
import { AdvancedFilter } from "./filters/AdvancedFilter";
import { GroupBySelector } from "./filters/GroupBySelector";
import { TagFilter } from "./filters/TagFilter";
import { ClearFiltersButton } from "./ClearFiltersButton";

/**
 * Unified "Filtros avançados" drawer — mobile entry point that consolidates
 * the row of filter chips (Tipo / Ocultar acertos / Agrupar por / Contas /
 * Tags) into a single sheet. Each child filter component runs in `inline`
 * mode so it commits its selection to the URL search params on the spot;
 * the drawer footer is intentionally just a Fechar button. Limpar filtros
 * is exposed via the existing ClearFiltersButton (only renders when there
 * is something to clear).
 */
export function FiltersDrawer() {
  const { opened, reject } = useDrawerContext<void>();

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      position="right"
      size="sm"
      title={<Text fw={700}>Filtros</Text>}
      data-testid={TransactionsTestIds.DrawerFilters}
    >
      <Stack gap="md">
        <AdvancedFilter inline />
        <Divider />
        <GroupBySelector />
        <Divider />
        <AccountFilter inline />
        <Divider />
        <TagFilter inline />
        <Stack gap="xs" pt="md">
          <ClearFiltersButton />
          <Button variant="filled" onClick={() => reject()}>
            Fechar
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}
