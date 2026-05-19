import { Button, Group, Menu, MenuItem, Text } from "@mantine/core";
import {
  IconArrowsUpDown,
  IconCalendar,
  IconCategory,
  IconChevronDown,
  IconQuestionMark,
  IconReceipt,
  IconRepeatOff,
  IconShare,
  IconShareOff,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Transactions } from "@/types/transactions";
import { ImportTestIds } from "@/testIds";
import { renderDrawer } from "@/utils/renderDrawer";
import classes from "./ImportCSVBulkToolbar.module.css";
import {
  BulkEditDrawer,
  type BulkEditAction,
  type BulkEditResult,
} from "./BulkEditDrawer";

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

const ALTER_ACTIONS: { key: BulkEditAction; icon: React.ReactNode; label: string }[] = [
  { key: "date", icon: <IconCalendar size={14} />, label: "Data" },
  { key: "category_id", icon: <IconCategory size={14} />, label: "Categoria" },
  { key: "description", icon: <IconReceipt size={14} />, label: "Descrição" },
  { key: "type", icon: <IconArrowsUpDown size={14} />, label: "Tipo de transação" },
  { key: "import_action", icon: <IconQuestionMark size={14} />, label: "Ação de importação" },
  { key: "split", icon: <IconShare size={14} />, label: "Divisão" },
];

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
  async function openBulkEdit(actionType: BulkEditAction) {
    const result = await renderDrawer<BulkEditResult | void>(() => (
      <BulkEditDrawer actionType={actionType} />
    )).catch(() => undefined);
    if (!result) return;
    switch (result.type) {
      case "date":
        onBulkSetDate(result.value);
        break;
      case "category_id":
        onBulkSetCategory(result.value);
        break;
      case "description":
        onBulkSetDescription(result.value);
        break;
      case "type":
        onBulkSetTransactionType(result.value);
        break;
      case "import_action":
        onBulkSetAction(result.value);
        break;
      case "split":
        onBulkSetSplitSettings(result.value);
        break;
    }
  }

  return (
    <div className={classes.bar}>
      <Group gap="sm">
        <Text fz="sm" fw={700}>
          {selectedCount} {selectedCount === 1 ? "selecionada" : "selecionadas"}
        </Text>

        <Button
          size="compact-sm"
          variant="subtle"
          color="gray"
          leftSection={<IconX size={14} />}
          onClick={onClearSelection}
          data-testid={ImportTestIds.BtnBulkClearSelection}
        >
          Limpar seleção
        </Button>

        <Menu shadow="md" width={240}>
          <Menu.Target>
            <Button
              size="sm"
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

        <Menu shadow="md" width={240}>
          <Menu.Target>
            <Button
              size="sm"
              variant="default"
              rightSection={<IconChevronDown size={14} />}
              data-testid={ImportTestIds.BtnBulkAlterMenu}
            >
              Alterar
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {ALTER_ACTIONS.filter((a) => a.key !== "split" || canSplit).map((a) => (
              <MenuItem
                key={a.key}
                component="button"
                leftSection={a.icon}
                onClick={() => void openBulkEdit(a.key)}
              >
                {a.label}
              </MenuItem>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>
    </div>
  );
}
