import { Button, Center, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconReceipt2 } from "@tabler/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useActiveFilters } from "@/hooks/useActiveFilters";

/**
 * Empty state shown by TransactionList when the active filters yield no
 * transactions for the period. Mirrors the variation C design: round icon
 * thumb + headline + helper line + a single "Limpar filtros" CTA that
 * resets every filter param while keeping the period intact.
 */
export function EmptyState() {
  const search = useSearch({ from: "/_authenticated/transactions" });
  const navigate = useNavigate({ from: "/transactions" });
  const filters = useActiveFilters();

  const hasFilters =
    !!search.query ||
    filters.accountIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.tagIds.length > 0 ||
    filters.types.length > 0 ||
    search.hideSettlements;

  function clearFilters() {
    void navigate({
      search: (prev) => ({
        ...prev,
        query: "",
        accountIds: [],
        categoryIds: [],
        tagIds: [],
        types: [],
        hideSettlements: false,
      }),
    });
  }

  return (
    <Center py="xl">
      <Stack align="center" gap="xs" maw={320}>
        <ThemeIcon variant="default" size={64} radius="xl">
          <IconReceipt2 size={28} stroke={1.5} />
        </ThemeIcon>
        <Text size="md" fw={600} mt="sm">
          Nenhuma transação encontrada
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {hasFilters
            ? "Tente limpar os filtros ou mude o período no topo da tela."
            : "Toque em + para adicionar a primeira transação do mês."}
        </Text>
        {hasFilters && (
          <Button variant="default" radius="xl" mt="xs" onClick={clearFilters}>
            Limpar filtros
          </Button>
        )}
      </Stack>
    </Center>
  );
}
