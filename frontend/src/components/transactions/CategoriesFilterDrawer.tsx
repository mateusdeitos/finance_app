import { Button, Drawer, Stack, Text } from "@mantine/core";
import { useTransactionsSearch } from "@/hooks/useTransactionsSearch";
import { useDrawerContext } from "@/utils/renderDrawer";
import { TransactionsTestIds } from "@/testIds";
import { CategoryFilter } from "./filters/CategoryFilter";

/**
 * Dedicated category-filter drawer — opens from the Categorias icon next to
 * the search pill. Keeps the hierarchical category tree in its own sheet
 * (it's the longest list and the one users scan most often) instead of
 * burying it inside the generic Filtros drawer.
 */
export function CategoriesFilterDrawer() {
  const { opened, reject } = useDrawerContext<void>();
  const { search, update } = useTransactionsSearch();
  const selectedCount = search.categoryIds?.length ?? 0;

  function clearCategories() {
    update((prev) => ({ ...prev, categoryIds: [] }));
  }

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      position="right"
      size="sm"
      title={
        <Stack gap={0}>
          <Text fw={700}>Categorias</Text>
          {selectedCount > 0 && (
            <Text size="xs" c="dimmed">
              {selectedCount === 1 ? "1 selecionada" : `${selectedCount} selecionadas`}
            </Text>
          )}
        </Stack>
      }
      data-testid={TransactionsTestIds.DrawerCategoriesFilter}
    >
      <Stack gap="md">
        <CategoryFilter inline />
        <Stack gap="xs" pt="md">
          {selectedCount > 0 && (
            <Button variant="subtle" color="red" onClick={clearCategories}>
              Limpar categorias
            </Button>
          )}
          <Button variant="filled" onClick={() => reject()}>
            Fechar
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}
