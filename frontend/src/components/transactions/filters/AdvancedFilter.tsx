import { Button, Indicator, Popover, Stack, Switch, Text } from "@mantine/core";
import { IconAdjustments } from "@tabler/icons-react";
import { useTransactionsSearch } from "@/hooks/useTransactionsSearch";
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

function ReviewedOptions({
  reviewed,
  toggle,
}: {
  reviewed: Transactions.ReviewedFilter | undefined;
  toggle: (v: Transactions.ReviewedFilter) => void;
}) {
  return (
    <>
      <Switch
        label="Apenas revisadas"
        checked={reviewed === "reviewed"}
        onChange={() => toggle("reviewed")}
        data-testid={TransactionsTestIds.SwitchReviewed}
      />
      <Switch
        label="Apenas não revisadas"
        checked={reviewed === "unreviewed"}
        onChange={() => toggle("unreviewed")}
        data-testid={TransactionsTestIds.SwitchUnreviewed}
      />
    </>
  );
}

export function AdvancedFilter({ inline }: AdvancedFilterProps) {
  const { search, update } = useTransactionsSearch();
  const [opened, setOpened] = useState(false);

  const selected: Transactions.TransactionType[] = search.types ?? [];
  const hideSettlements = search.hideSettlements ?? false;
  const noCategory = search.noCategory ?? false;
  const reviewed = search.reviewed;

  function toggle(value: Transactions.TransactionType) {
    const next = selected.includes(value)
      ? selected.filter((t) => t !== value)
      : [...selected, value];
    update((prev) => ({ ...prev, types: next }));
  }

  function toggleHideSettlements() {
    update((prev) => ({ ...prev, hideSettlements: !hideSettlements }));
  }

  function toggleNoCategory() {
    update((prev) => ({ ...prev, noCategory: !noCategory }));
  }

  // The two review switches are mutually exclusive: turning one on clears the
  // other, and turning the active one off clears the filter entirely.
  function toggleReviewed(value: Transactions.ReviewedFilter) {
    update((prev) => ({ ...prev, reviewed: prev.reviewed === value ? undefined : value }));
  }

  const advancedCount =
    selected.length + (hideSettlements ? 1 : 0) + (noCategory ? 1 : 0) + (reviewed ? 1 : 0);

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
        <Switch
          label="Sem categoria"
          checked={noCategory}
          onChange={toggleNoCategory}
          data-testid={TransactionsTestIds.SwitchNoCategory}
        />
        <Text size="sm" fw={500} mt="xs">
          Revisão
        </Text>
        <ReviewedOptions reviewed={reviewed} toggle={toggleReviewed} />
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
            Filtros
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
          <Switch
            label="Sem categoria"
            checked={noCategory}
            onChange={toggleNoCategory}
            data-testid={TransactionsTestIds.SwitchNoCategory}
          />
          <ReviewedOptions reviewed={reviewed} toggle={toggleReviewed} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
