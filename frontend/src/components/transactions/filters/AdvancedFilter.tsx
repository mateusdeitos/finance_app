import { Button, Indicator, Popover, Stack, Switch, Text } from "@mantine/core";
import { IconAdjustments } from "@tabler/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";

const TYPE_OPTIONS: { value: Transactions.TransactionType; label: string }[] = [
  { value: "expense", label: "Apenas despesas" },
  { value: "income", label: "Apenas receitas" },
  { value: "transfer", label: "Apenas transferências" },
];

interface AdvancedFilterProps {
  inline?: boolean;
}

function TypeOptions({
  selected,
  toggle,
}: {
  selected: Transactions.TransactionType[];
  toggle: (v: Transactions.TransactionType) => void;
}) {
  return (
    <>
      {TYPE_OPTIONS.map((opt) => (
        <Switch
          key={opt.value}
          label={opt.label}
          checked={selected.includes(opt.value)}
          onChange={() => toggle(opt.value)}
          data-testid={TransactionsTestIds.SwitchType(opt.value)}
        />
      ))}
    </>
  );
}

export function AdvancedFilter({ inline }: AdvancedFilterProps) {
  const navigate = useNavigate({ from: "/transactions" });
  const search = useSearch({ from: "/_authenticated/transactions" });
  const [opened, setOpened] = useState(false);

  const selected: Transactions.TransactionType[] = search.types ?? [];
  const hideSettlements = search.hideSettlements ?? false;

  function toggle(value: Transactions.TransactionType) {
    const next = selected.includes(value)
      ? selected.filter((t) => t !== value)
      : [...selected, value];
    navigate({
      search: (prev) => ({ ...prev, types: next.length ? next : undefined }),
    });
  }

  function toggleHideSettlements() {
    navigate({
      search: (prev) => ({ ...prev, hideSettlements: !hideSettlements }),
    });
  }

  const advancedCount = selected.length + (hideSettlements ? 1 : 0);

  if (inline) {
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Tipo
        </Text>
        <TypeOptions selected={selected} toggle={toggle} />
        <Switch
          label="Ocultar acertos"
          checked={hideSettlements}
          onChange={toggleHideSettlements}
        />
      </Stack>
    );
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      data-testid={TransactionsTestIds.AdvancedFiltersPopover}
    >
      <Popover.Target>
        <Indicator label={advancedCount} size={16} disabled={!advancedCount}>
          <Button
            variant="default"
            leftSection={<IconAdjustments size={16} />}
            onClick={() => setOpened((o) => !o)}
            data-testid={TransactionsTestIds.BtnOpenAdvancedFilters}
          >
            Filtros avançados
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TypeOptions selected={selected} toggle={toggle} />
          <Switch
            label="Ocultar acertos"
            checked={hideSettlements}
            onChange={toggleHideSettlements}
            data-testid={TransactionsTestIds.SwitchHideSettlements}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
