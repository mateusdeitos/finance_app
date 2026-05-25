import { Button, Menu } from "@mantine/core";
import {
  IconBuildingBank,
  IconCalendar,
  IconCategory,
  IconChevronDown,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { useTransactionsSearch } from "@/hooks/useTransactionsSearch";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";

const LABELS: Record<Transactions.GroupBy, string> = {
  date: "Data",
  category: "Categoria",
  account: "Conta",
};

type IconComponent = ComponentType<{ size?: number | string }>;

const ICONS: Record<Transactions.GroupBy, IconComponent> = {
  date: IconCalendar,
  category: IconCategory,
  account: IconBuildingBank,
};

const OPTIONS: Transactions.GroupBy[] = ["date", "category", "account"];

/**
 * Desktop toolbar variant of the group-by control: a button labelled with
 * the currently active grouping ("Agrupar: Data ▾") that opens a Menu with
 * the three options. Matches the design's slim desktop toolbar. The mobile
 * FiltersDrawer still uses GroupBySelector (SegmentedControl).
 */
export function GroupByMenuButton() {
  const { search, update } = useTransactionsSearch();
  const groupBy = search.groupBy ?? "date";
  const ActiveIcon = ICONS[groupBy];

  function pick(value: Transactions.GroupBy) {
    update((prev) => ({ ...prev, groupBy: value }));
  }

  return (
    <Menu shadow="md" width={180} position="bottom-end">
      <Menu.Target>
        <Button
          variant="default"
          size="sm"
          leftSection={<ActiveIcon size={14} />}
          rightSection={<IconChevronDown size={11} />}
          data-testid={TransactionsTestIds.BtnGroupByMenu}
        >
          Agrupar: {LABELS[groupBy]}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {OPTIONS.map((value) => {
          const Icon = ICONS[value];
          return (
            <Menu.Item
              key={value}
              leftSection={<Icon size={14} />}
              onClick={() => pick(value)}
              data-testid={TransactionsTestIds.MenuItemGroupBy(value)}
            >
              {LABELS[value]}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
