import { Button, Menu } from "@mantine/core";
import { IconCalendar, IconChevronDown } from "@tabler/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";

const LABELS: Record<Transactions.GroupBy, string> = {
  date: "Data",
  category: "Categoria",
  account: "Conta",
};

const OPTIONS: Transactions.GroupBy[] = ["date", "category", "account"];

/**
 * Desktop toolbar variant of the group-by control: a button labelled with
 * the currently active grouping ("Agrupar: Data ▾") that opens a Menu with
 * the three options. Matches the design's slim desktop toolbar. The mobile
 * FiltersDrawer still uses GroupBySelector (SegmentedControl).
 */
export function GroupByMenuButton() {
  const navigate = useNavigate({ from: "/transactions" });
  const search = useSearch({ from: "/_authenticated/transactions" });
  const groupBy = search.groupBy ?? "date";

  function pick(value: Transactions.GroupBy) {
    void navigate({
      search: (prev) => ({ ...prev, groupBy: value }),
    });
  }

  return (
    <Menu shadow="md" width={180} position="bottom-end">
      <Menu.Target>
        <Button
          variant="default"
          size="sm"
          leftSection={<IconCalendar size={14} />}
          rightSection={<IconChevronDown size={11} />}
          data-testid={TransactionsTestIds.BtnGroupByMenu}
        >
          Agrupar: {LABELS[groupBy]}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {OPTIONS.map((value) => (
          <Menu.Item
            key={value}
            onClick={() => pick(value)}
            data-testid={TransactionsTestIds.MenuItemGroupBy(value)}
          >
            {LABELS[value]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
