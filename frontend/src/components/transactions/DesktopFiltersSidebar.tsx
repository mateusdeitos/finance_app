import { Anchor, Box, Group, ScrollArea, Stack, Text } from "@mantine/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AccountFilter } from "./filters/AccountFilter";
import { CategoryFilter } from "./filters/CategoryFilter";
import classes from "./DesktopFiltersSidebar.module.css";

interface SectionHeaderProps {
  title: string;
  count: number;
  onClear?: () => void;
}

function SectionHeader({ title, count, onClear }: SectionHeaderProps) {
  return (
    <Group justify="space-between" align="baseline" wrap="nowrap" px="md" pt="md" pb={4}>
      <Group gap={8} align="baseline">
        <Text
          size="xs"
          fw={700}
          c="dimmed"
          tt="uppercase"
          style={{ letterSpacing: "0.06em" }}
        >
          {title}
        </Text>
        {count > 0 && (
          <Text
            size="xs"
            fw={600}
            c="blue.7"
            px={7}
            py={1}
            style={{
              borderRadius: 999,
              background: "var(--mantine-color-blue-0)",
              lineHeight: 1.2,
            }}
          >
            {count}
          </Text>
        )}
      </Group>
      {count > 0 && onClear && (
        <Anchor component="button" size="xs" c="blue.6" fw={500} onClick={onClear}>
          Limpar
        </Anchor>
      )}
    </Group>
  );
}

/**
 * Always-open filter sidebar for the desktop transactions surface. Hosts
 * Contas and Categorias as their inline checklist forms so selections
 * commit immediately to the URL search params (no Aplicar button) and
 * stay in sync with the listing in real time.
 *
 * Sits inside the TransactionsPage main column as a 280px sticky column,
 * leaving the AppShell navbar (220px) untouched on the left.
 */
export function DesktopFiltersSidebar() {
  const search = useSearch({ from: "/_authenticated/transactions" });
  const navigate = useNavigate({ from: "/transactions" });

  const accountsCount = search.accountIds?.length ?? 0;
  const categoriesCount = search.categoryIds?.length ?? 0;

  function clearAccounts() {
    void navigate({ search: (prev) => ({ ...prev, accountIds: [] }) });
  }
  function clearCategories() {
    void navigate({ search: (prev) => ({ ...prev, categoryIds: [] }) });
  }

  return (
    <Box className={classes.sidebar} aria-label="Filtros laterais">
      <ScrollArea className={classes.scroll} type="hover" scrollbarSize={6}>
        <Stack gap={4} pb="md">
          <SectionHeader title="Contas" count={accountsCount} onClear={clearAccounts} />
          <Box px="md">
            <AccountFilter inline />
          </Box>

          <Box my="md" className={classes.divider} />

          <SectionHeader title="Categorias" count={categoriesCount} onClear={clearCategories} />
          <Box px="md">
            <CategoryFilter inline />
          </Box>
        </Stack>
      </ScrollArea>
    </Box>
  );
}
