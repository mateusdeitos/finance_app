import { useState } from "react";
import { Button, Group, Popover, Select, Stack, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCategory, IconTrash } from "@tabler/icons-react";
import { useFlattenCategories } from "@/hooks/useCategories";
import { Transactions } from "@/types/transactions";
import { localDateStr } from "@/utils/parseDate";
import { useDisclosure } from "@mantine/hooks";

const ACTION_OPTIONS = [
  { value: "import", label: "Importar" },
  { value: "skip", label: "Não importar" },
  { value: "duplicate", label: "Duplicado" },
];

const TYPE_OPTIONS: Array<{ value: Transactions.TransactionType; label: string }> = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

interface Props {
  selectedCount: number;
  onRemove: () => void;
  onBulkSetAction: (action: Transactions.ImportRowAction) => void;
  onBulkSetDate: (date: string) => void;
  onBulkSetCategory: (categoryId: number) => void;
  onBulkSetTransactionType: (type: Transactions.TransactionType) => void;
  onBulkSetDescription: (description: string) => void;
}

export function ImportCSVBulkToolbar({
  selectedCount,
  onRemove,
  onBulkSetAction,
  onBulkSetDate,
  onBulkSetCategory,
  onBulkSetTransactionType,
  onBulkSetDescription,
}: Props) {
  const { query: categoriesQuery } = useFlattenCategories();
  const categories = categoriesQuery.data ?? [];

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }));

  const [description, setDescription] = useState("");
  const [descriptionPopoverOpen, descriptionPopover] = useDisclosure(false);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  return (
    <Group gap="xs" align="end">
      <Text fz="sm" fw={500}>
        {selectedCount} selecionadas
      </Text>

      <Button
        size="xs"
        variant="light"
        color="red"
        leftSection={<IconTrash size={14} />}
        onClick={onRemove}
        data-testid="btn_bulk_remove"
      >
        Remover
      </Button>

      <Select
        label="Ação"
        size="xs"
        data={ACTION_OPTIONS}
        withCheckIcon={false}
        data-testid="select_bulk_action"
        onChange={(val) => {
          if (val) {
            onBulkSetAction(val as Transactions.ImportRowAction);
          }
        }}
      />

      <DatePickerInput
        label="Data"
        size="xs"
        miw={150}
        valueFormat="DD/MM/YYYY"
        onChange={(d) => {
          if (d) {
            onBulkSetDate(localDateStr(d));
          }
        }}
      />

      <Select
        label="Tipo"
        size="xs"
        data={TYPE_OPTIONS}
        withCheckIcon={false}
        data-testid="select_bulk_action"
        onChange={(val) => {
          if (val) {
            onBulkSetTransactionType(val as Transactions.TransactionType);
          }
        }}
      />

      <Popover
        opened={descriptionPopoverOpen}
        onChange={() => {
          setDescription("");
          descriptionPopover.toggle();
        }}
        withinPortal
      >
        <Popover.Target>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconCategory size={14} />}
            onClick={() => descriptionPopover.open()}
          >
            Descrição
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={200}>
            <TextInput
              label="Descrição"
              size="xs"
              miw={200}
              onKeyDown={(e) => {
                if (e.key == "Enter") {
                  descriptionPopover.close();
                  onBulkSetDescription(description);
                  return;
                }
              }}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <Popover opened={categoryPopoverOpen} onChange={setCategoryPopoverOpen} withinPortal>
        <Popover.Target>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconCategory size={14} />}
            onClick={() => setCategoryPopoverOpen(true)}
          >
            Definir categoria
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={200}>
            <Select
              label="Categoria"
              size="xs"
              data={categoryOptions}
              searchable
              withCheckIcon={false}
              onChange={(val) => {
                if (val) {
                  onBulkSetCategory(Number(val));
                  setCategoryPopoverOpen(false);
                }
              }}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
