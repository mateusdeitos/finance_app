import { useFlattenCategories } from "@/hooks/useCategories";
import { Transactions } from "@/types/transactions";
import { localDateStr } from "@/utils/parseDate";
import { Button, Group, Menu, MenuItem, Select, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconArrowsUpDown,
  IconCalendar,
  IconCategory,
  IconHammer,
  IconQuestionMark,
  IconReceipt,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

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

type AvailableAction = "date" | "import_action" | "type" | "description" | "category";
type SelectedActionState = {
  type: AvailableAction;
  value: string;
};

const propsByType: Record<AvailableAction, { icon: React.ReactNode; label: string }> = {
  date: { icon: <IconCalendar size={14} />, label: "Data" },
  category: { icon: <IconCategory size={14} />, label: "Categoria" },
  description: { icon: <IconReceipt size={14} />, label: "Descrição" },
  type: { icon: <IconArrowsUpDown size={14} />, label: "Tipo de transação" },
  import_action: { icon: <IconQuestionMark size={14} />, label: "Ação de importação" },
};

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

  const [selectedAction, setSelectedAction] = useState<SelectedActionState | null>(null);
  const menuLabel = useMemo(() => {
    switch (selectedAction?.type) {
      case "date":
        return "Data";
      case "category":
        return "Categoria";
      case "description":
        return "Descrição";
      case "type":
        return "Tipo";
      case "import_action":
        return "Ação de importação";
      default:
        return "Escolha uma ação";
    }
  }, [selectedAction]);

  const updateSelectedActionValue = (value: string) => {
    setSelectedAction((p) => (!p ? null : { ...p, value }));
  };

  const updateSelectedAction = (type: AvailableAction) => {
    setSelectedAction({ type, value: "" });
  };

  const applySelectedAction = () => {
    switch (selectedAction?.type) {
      case "date":
        return onBulkSetDate(selectedAction.value);
      case "category":
        return onBulkSetCategory(Number(selectedAction.value));
      case "description":
        return onBulkSetDescription(selectedAction.value);
      case "type":
        return onBulkSetTransactionType(selectedAction.value as Transactions.TransactionType);
      case "import_action":
        return onBulkSetAction(selectedAction.value as Transactions.ImportRowAction);
      default:
        break;
    }
  };

  return (
    <Group gap="xs" align="end">
      <Text fz="sm" fw={500}>
        {selectedCount} selecionadas
      </Text>

      <Button
        size="compact-xs"
        variant="light"
        color="red"
        leftSection={<IconTrash size={14} />}
        onClick={onRemove}
        data-testid="btn_bulk_remove"
      >
        Remover
      </Button>

      <Text fz="sm" fw={500}>
        Definir
      </Text>

      <Menu>
        <Menu.Target>
          <Button
            variant="subtle"
            size="compact-xs"
            leftSection={selectedAction ? propsByType[selectedAction.type]?.icon : undefined}
          >
            {menuLabel}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {Object.entries(propsByType).map(([k, v]) => {
            return (
              <MenuItem
                key={k}
                component="button"
                leftSection={v.icon}
                onClick={() => updateSelectedAction(k as AvailableAction)}
              >
                {v.label}
              </MenuItem>
            );
          })}
        </Menu.Dropdown>
      </Menu>

      <Text fz="sm" fw={500}>
        Para
      </Text>

      {selectedAction?.type === "import_action" && (
        <Select
          size="xs"
          data={ACTION_OPTIONS}
          withCheckIcon={false}
          data-testid="select_bulk_action"
          onChange={(val) => {
            if (val) {
              updateSelectedActionValue(val);
            }
          }}
        />
      )}

      {selectedAction?.type === "date" && (
        <DatePickerInput
          size="xs"
          miw={150}
          valueFormat="DD/MM/YYYY"
          onChange={(d) => {
            if (d) {
              updateSelectedActionValue(localDateStr(d));
            }
          }}
        />
      )}

      {selectedAction?.type === "type" && (
        <Select
          size="xs"
          data={TYPE_OPTIONS}
          withCheckIcon={false}
          data-testid="select_bulk_action"
          onChange={(val) => {
            if (val) {
              updateSelectedActionValue(val);
            }
          }}
        />
      )}

      {selectedAction?.type === "description" && (
        <TextInput size="xs" miw={200} onChange={(e) => updateSelectedActionValue(e.target.value)} />
      )}

      {selectedAction?.type === "category" && (
        <Select
          size="xs"
          data={categoryOptions}
          searchable
          withCheckIcon={false}
          onChange={(val) => {
            if (val) {
              updateSelectedActionValue(val);
            }
          }}
        />
      )}

      <Button
        size="compact-xs"
        variant="filled"
        color="blue"
        leftSection={<IconHammer size={14} />}
        onClick={applySelectedAction}
        disabled={!selectedAction?.value}
        data-testid="btn_bulk_apply"
      >
        Aplicar
      </Button>
    </Group>
  );
}
