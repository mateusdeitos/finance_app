import { ActionIcon, Button, Group, Indicator } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconCategory } from "@tabler/icons-react";
import { useState } from "react";
import { useTransactionsSearch } from "@/hooks/useTransactionsSearch";
import { renderDrawer } from "@/utils/renderDrawer";
import { TransactionsTestIds } from "@/testIds";
import { CategoriesFilterDrawer } from "./CategoriesFilterDrawer";
import { FiltersDrawer } from "./FiltersDrawer";
import { TextSearch } from "./filters/TextSearch";

/**
 * Mobile-only filter row that pairs the search pill with two icon buttons
 * (Categorias / Filtros avançados). The chip row used previously is now
 * collapsed into these two drawers, matching variation C of the design.
 *
 * When the search input is focused, the icon buttons collapse and a
 * Cancelar link replaces them so the search input gets the whole width
 * (matches the "Buscar focado" state from the same design).
 */
export function MobileFilterBar() {
  const [focused, setFocused] = useState(false);
  const { search } = useTransactionsSearch();

  const categoriesCount = search.categoryIds?.length ?? 0;
  // Everything other than text + categories rolls up into the "Filtros" badge:
  // tipo, contas, tags, hide-acertos. groupBy is a non-default *mode* rather
  // than a filter, so it doesn't contribute to the badge.
  const advancedCount =
    (search.types?.length ?? 0) +
    (search.accountIds?.length ?? 0) +
    (search.tagIds?.length ?? 0) +
    (search.hideSettlements ? 1 : 0);

  function openCategoriesDrawer() {
    void renderDrawer(() => <CategoriesFilterDrawer />).catch(() => undefined);
  }

  function openFiltersDrawer() {
    void renderDrawer(() => <FiltersDrawer />).catch(() => undefined);
  }

  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <TextSearch onFocusChange={setFocused} style={{ flex: 1 }} />
      {focused ? (
        <Button
          variant="subtle"
          color="blue"
          size="compact-sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setFocused(false)}
        >
          Cancelar
        </Button>
      ) : (
        <>
          <Indicator label={categoriesCount} size={14} disabled={!categoriesCount}>
            <ActionIcon
              variant="default"
              size="lg"
              radius="xl"
              aria-label="Filtrar por categorias"
              onClick={openCategoriesDrawer}
              data-testid={TransactionsTestIds.BtnOpenCategoriesFilterDrawer}
            >
              <IconCategory size={18} />
            </ActionIcon>
          </Indicator>
          <Indicator label={advancedCount} size={14} disabled={!advancedCount}>
            <ActionIcon
              variant="default"
              size="lg"
              radius="xl"
              aria-label="Filtros avançados"
              onClick={openFiltersDrawer}
              data-testid={TransactionsTestIds.BtnOpenFiltersDrawer}
            >
              <IconAdjustmentsHorizontal size={18} />
            </ActionIcon>
          </Indicator>
        </>
      )}
    </Group>
  );
}
