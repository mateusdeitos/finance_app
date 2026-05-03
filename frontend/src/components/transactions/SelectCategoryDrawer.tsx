import { Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { useFlattenCategories } from "@/hooks/useCategories";
import { Transactions } from "@/types/transactions";
import { useDrawerContext } from "@/utils/renderDrawer";
import { TransactionsTestIds } from "@/testIds";

function CategoryRow({
  category,
  depth,
  onSelect,
}: {
  category: Transactions.Category;
  depth: number;
  onSelect: (c: Transactions.Category) => void;
}) {
  return (
    <>
      <UnstyledButton
        onClick={() => onSelect(category)}
        py="xs"
        px="sm"
        style={{
          paddingLeft: `calc(${depth} * var(--mantine-spacing-lg) + var(--mantine-spacing-sm))`,
          borderRadius: "var(--mantine-radius-sm)",
          width: "100%",
        }}
        data-testid={TransactionsTestIds.CategoryOption(category.id)}
      >
        <Group gap="xs">
          {category.emoji && <Text>{category.emoji}</Text>}
          <Text size="sm">{category.name}</Text>
        </Group>
      </UnstyledButton>
      {category.children?.map((child) => (
        <CategoryRow key={child.id} category={child} depth={depth + 1} onSelect={onSelect} />
      ))}
    </>
  );
}

export function SelectCategoryDrawer() {
  const { opened, close, reject } = useDrawerContext<Transactions.Category>();
  const { query } = useFlattenCategories();
  const categories = query.data ?? [];

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Selecionar categoria"
      data-testid={TransactionsTestIds.DrawerSelectCategory}
    >
      <Stack gap={4}>
        {categories.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nenhuma categoria cadastrada
          </Text>
        ) : (
          categories.map((category) => (
            <CategoryRow key={category.id} category={category} depth={0} onSelect={(c) => close(c)} />
          ))
        )}
      </Stack>
    </ResponsiveDrawer>
  );
}
