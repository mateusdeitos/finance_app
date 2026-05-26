import { Group, UnstyledButton } from "@mantine/core";
import { localDateStr } from "@/utils/parseDate";
import { TransactionsTestIds } from "@/testIds";
import classes from "./DateQuickChips.module.css";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

type ChipKey = "today" | "yesterday" | "day_before";

const CHIPS: { key: ChipKey; label: string; offsetDays: number }[] = [
  { key: "today", label: "Hoje", offsetDays: 0 },
  { key: "yesterday", label: "Ontem", offsetDays: -1 },
  { key: "day_before", label: "Anteontem", offsetDays: -2 },
];

function dateFromOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return localDateStr(d);
}

export function DateQuickChips({ value, onChange }: Props) {
  return (
    <Group gap={6} mt={6} wrap="wrap">
      {CHIPS.map((chip) => {
        const chipDate = dateFromOffset(chip.offsetDays);
        const active = value === chipDate;
        return (
          <UnstyledButton
            key={chip.key}
            type="button"
            onClick={() => onChange(chipDate)}
            className={classes.chip}
            data-active={active || undefined}
            data-testid={TransactionsTestIds.DateChip(chip.key)}
          >
            {chip.label}
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
