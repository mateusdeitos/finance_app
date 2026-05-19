import { useFlattenCategories } from "@/hooks/useCategories";
import { Transactions } from "@/types/transactions";
import { Button, Group, Menu, MenuItem, Popover, Select, Stack, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconArrowsUpDown,
  IconCalendar,
  IconCategory,
  IconChevronDown,
  IconHammer,
  IconQuestionMark,
  IconReceipt,
  IconRepeatOff,
  IconShare,
  IconShareOff,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { useSplitSummary } from "@/hooks/import/useSplitSummary";
import { SplitSettingsFields } from "../form/SplitSettingsFields";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { useDisclosure } from "@mantine/hooks";
import { ImportTestIds } from "@/testIds";
import classes from "./ImportCSVBulkToolbar.module.css";

const ACTION_OPTIONS = [
  { value: "import", label: "Importar" },
  { value: "skip", label: "Não importar" },
];

const TYPE_OPTIONS: Array<{ value: Transactions.TransactionType; label: string }> = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

type LocalFormType = {
  date: string;
  import_action: Transactions.ImportRowAction;
  description: string;
  category_id: number;
  type: Transactions.TransactionType;
  action_type: AvailableAction | null;
  split_settings: Transactions.SplitSetting[];
};

interface Props {
  selectedCount: number;
  /** Splits aren't allowed on shared accounts — hide the bulk split action. */
  canSplit: boolean;
  onClearSelection: () => void;
  onRemove: () => void;
  onBulkClearInstallments: () => void;
  onBulkClearSplit: () => void;
  onBulkSetAction: (action: Transactions.ImportRowAction) => void;
  onBulkSetDate: (date: string) => void;
  onBulkSetCategory: (categoryId: number) => void;
  onBulkSetTransactionType: (type: Transactions.TransactionType) => void;
  onBulkSetDescription: (description: string) => void;
  onBulkSetSplitSettings: (split: Transactions.SplitSetting[]) => void;
}

type AvailableAction = "date" | "import_action" | "type" | "description" | "category_id" | "split";

const propsByType: Record<AvailableAction, { icon: React.ReactNode; label: string }> = {
  date: { icon: <IconCalendar size={14} />, label: "Data" },
  category_id: { icon: <IconCategory size={14} />, label: "Categoria" },
  description: { icon: <IconReceipt size={14} />, label: "Descrição" },
  type: { icon: <IconArrowsUpDown size={14} />, label: "Tipo de transação" },
  import_action: { icon: <IconQuestionMark size={14} />, label: "Ação de importação" },
  split: { icon: <IconShare size={14} />, label: "Divisão" },
};

export function ImportCSVBulkToolbar({
  selectedCount,
  canSplit,
  onClearSelection,
  onRemove,
  onBulkClearInstallments,
  onBulkClearSplit,
  onBulkSetAction,
  onBulkSetDate,
  onBulkSetCategory,
  onBulkSetTransactionType,
  onBulkSetDescription,
  onBulkSetSplitSettings,
}: Props) {
  const { query: categoriesQuery } = useFlattenCategories();
  const [, splitPopoverControl] = useDisclosure(false);
  const categories = categoriesQuery.data ?? [];

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }));

  const localForm = useForm<LocalFormType>({ defaultValues: { split_settings: [] } });
  const [selectedActionType, splitSettings] = useWatch({
    control: localForm.control,
    name: ["action_type", "split_settings"],
  });
  const applyDisabled = useWatch({
    control: localForm.control,
    compute: (form) => {
      switch (form.action_type) {
        case "category_id":
          return !form.category_id;
        case "date":
          return !form.date;
        case "description":
          return !form.description?.trim();
        case "import_action":
          return !form.import_action;
        case "split":
          return !form.split_settings?.length;
        case "type":
          return !form.type;
        default:
          return true;
      }
    },
  });

  const menuLabel = useMemo(() => {
    switch (selectedActionType) {
      case "date":
        return "Data";
      case "category_id":
        return "Categoria";
      case "description":
        return "Descrição";
      case "type":
        return "Tipo";
      case "import_action":
        return "Ação de importação";
      case "split":
        return "Divisão";
      default:
        return "Alterar";
    }
  }, [selectedActionType]);

  const updateSelectedAction = (type: AvailableAction) => {
    localForm.reset({ action_type: type });
  };

  const applySelectedAction = () => {
    switch (selectedActionType) {
      case "date":
        onBulkSetDate(localForm.getValues("date"));
        break;
      case "category_id":
        onBulkSetCategory(localForm.getValues("category_id"));
        break;
      case "description":
        onBulkSetDescription(localForm.getValues("description"));
        break;
      case "type":
        onBulkSetTransactionType(localForm.getValues("type"));
        break;
      case "import_action":
        onBulkSetAction(localForm.getValues("import_action"));
        break;
      case "split":
        onBulkSetSplitSettings(localForm.getValues("split_settings"));
        break;
      default:
        break;
    }

    localForm.reset();
  };

  const splitSummary = useSplitSummary(
    selectedActionType === "split" && splitSettings !== null ? splitSettings : undefined,
    true,
  );

  return (
    <FormProvider {...localForm}>
      <div className={classes.bar}>
        <Stack gap="xs">
          {/* Row 1: selection info + removal actions */}
          <Group gap="xs">
            <Text fz="sm" fw={700}>
              {selectedCount} {selectedCount === 1 ? "selecionada" : "selecionadas"}
            </Text>

            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconX size={14} />}
              onClick={onClearSelection}
              data-testid={ImportTestIds.BtnBulkClearSelection}
            >
              Limpar seleção
            </Button>

            <Menu>
              <Menu.Target>
                <Button
                  size="compact-xs"
                  variant="default"
                  leftSection={<IconTrash size={14} />}
                  rightSection={<IconChevronDown size={14} />}
                  data-testid={ImportTestIds.BtnBulkRemoveMenu}
                >
                  Remover
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <MenuItem
                  leftSection={<IconRepeatOff size={14} />}
                  onClick={onBulkClearInstallments}
                  data-testid={ImportTestIds.BtnBulkClearInstallments}
                >
                  Remover parcelamento
                </MenuItem>
                <MenuItem
                  leftSection={<IconShareOff size={14} />}
                  onClick={onBulkClearSplit}
                  data-testid={ImportTestIds.BtnBulkClearSplit}
                >
                  Remover divisão
                </MenuItem>
                <Menu.Divider />
                <MenuItem
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={onRemove}
                  data-testid={ImportTestIds.BtnBulkRemove}
                >
                  Remover linhas selecionadas
                </MenuItem>
              </Menu.Dropdown>
            </Menu>
          </Group>

          {/* Row 2: alter-and-apply flow */}
          <Group gap="xs" align="end">
            <Menu>
              <Menu.Target>
                <Button
                  variant="default"
                  size="compact-xs"
                  leftSection={selectedActionType ? propsByType[selectedActionType]?.icon : undefined}
                  rightSection={<IconChevronDown size={14} />}
                >
                  {menuLabel}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {Object.entries(propsByType)
                  .filter(([k]) => k !== "split" || canSplit)
                  .map(([k, v]) => (
                    <MenuItem
                      key={k}
                      component="button"
                      leftSection={v.icon}
                      onClick={() => updateSelectedAction(k as AvailableAction)}
                    >
                      {v.label}
                    </MenuItem>
                  ))}
              </Menu.Dropdown>
            </Menu>

        {selectedActionType === "import_action" && (
          <Select
            size="xs"
            data={ACTION_OPTIONS}
            withCheckIcon={false}
            data-testid={ImportTestIds.SelectBulkAction}
            onChange={(val) => {
              if (val) {
                localForm.reset({ action_type: "import_action", import_action: val as Transactions.ImportRowAction });
              }
            }}
          />
        )}

        {selectedActionType === "date" && (
          <DatePickerInput
            size="xs"
            miw={150}
            valueFormat="DD/MM/YYYY"
            onChange={(d) => {
              if (d) {
                localForm.reset({ action_type: "date", date: d });
              }
            }}
          />
        )}

        {selectedActionType === "type" && (
          <Select
            size="xs"
            data={TYPE_OPTIONS}
            withCheckIcon={false}
            data-testid={ImportTestIds.SelectBulkAction}
            onChange={(val) => {
              if (val) {
                localForm.reset({ action_type: "type", type: val as Transactions.TransactionType });
              }
            }}
          />
        )}

        {selectedActionType === "description" && (
          <TextInput
            size="xs"
            miw={200}
            onChange={(e) => localForm.reset({ action_type: "description", description: e.target.value })}
          />
        )}

        {selectedActionType === "category_id" && (
          <Select
            size="xs"
            data={categoryOptions}
            searchable
            withCheckIcon={false}
            onChange={(val) => {
              if (val) {
                localForm.reset({ action_type: "category_id", category_id: Number(val) });
              }
            }}
          />
        )}

        {selectedActionType === "split" && (
          <Popover
            trapFocus
            closeOnClickOutside
            withinPortal
            closeOnEscape
            onClose={splitPopoverControl.close}
            onOpen={splitPopoverControl.open}
          >
            <Popover.Target>
              <Button size="xs" variant="light">
                {splitSummary}
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs" w={320}>
                <SplitSettingsFields namePrefix="" comboboxWithinPortal={false} onlyPercentage />
              </Stack>
            </Popover.Dropdown>
          </Popover>
        )}

        {selectedActionType && (
          <Button
            size="compact-xs"
            variant="filled"
            color="blue"
            leftSection={<IconHammer size={14} />}
            onClick={applySelectedAction}
            disabled={applyDisabled}
            data-testid={ImportTestIds.BtnBulkApply}
          >
            Aplicar
          </Button>
        )}
          </Group>
        </Stack>
      </div>
    </FormProvider>
  );
}
