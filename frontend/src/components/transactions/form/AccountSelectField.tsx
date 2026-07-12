import { forwardRef, type FocusEvent, type ReactNode } from "react";
import { Select, NativeSelect, Group, Text, Badge, type ComboboxItem } from "@mantine/core";
import { AccountAvatar } from "@/components/AccountAvatar";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Transactions } from "@/types/transactions";
import { dropEmptyGroups, matchOptionByLabel, type ComboboxOptions } from "./selectMatch";

interface Props {
  label: ReactNode;
  required?: boolean;
  data: ComboboxOptions;
  value: number | null;
  onChange: (val: number | null) => void;
  /** Full account list — powers the avatar/badge in the desktop dropdown. */
  accounts: Transactions.Account[];
  error?: ReactNode;
  /** Builds the `data-testid` for each rendered option (desktop only). */
  optionTestId: (id: string) => string;
  "data-testid"?: string;
}

/** Renders a desktop account option with avatar + name + shared badge. */
function renderAccountOption(accounts: Transactions.Account[], testIdFor: (id: string) => string) {
  const Component = ({ option }: { option: ComboboxItem }) => {
    const acc = accounts.find((a) => String(a.id) === option.value);
    return (
      <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }} data-testid={testIdFor(option.value)}>
        <AccountAvatar account={acc} size={22} />
        <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
          {acc?.name ?? option.label}
        </Text>
        {acc?.user_connection && (
          <Badge size="xs" color="grape" variant="light">
            Compartilhada
          </Badge>
        )}
      </Group>
    );
  };
  return Component;
}

/**
 * Account picker that renders a native `<select>` on mobile (better touch UX —
 * the OS list, no combobox portal or search field to fight with) and the richer
 * searchable Mantine `Select` with avatars on desktop. Shared vs. personal
 * accounts are conveyed by the option groups on both, so the native variant
 * loses no information.
 */
export const AccountSelectField = forwardRef<HTMLInputElement | HTMLSelectElement, Props>(
  function AccountSelectField(
    { label, required, data, value, onChange, accounts, error, optionTestId, ...rest },
    ref,
  ) {
    const isMobile = useIsMobile();
    const testId = rest["data-testid"];

    if (isMobile) {
      // Native <select> has no placeholder support, so prepend an empty option
      // that represents "no selection" and lets the user clear the field.
      const nativeData = [
        { value: "", label: "Selecione uma conta" },
        ...dropEmptyGroups(data),
      ];
      return (
        <NativeSelect
          ref={ref as React.Ref<HTMLSelectElement>}
          label={label}
          required={required}
          data={nativeData}
          value={value ? String(value) : ""}
          onChange={(e) =>
            onChange(e.currentTarget.value ? Number(e.currentTarget.value) : null)
          }
          error={error}
          data-testid={testId}
        />
      );
    }

    const selected = accounts.find((a) => a.id === value);

    const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
      const match = matchOptionByLabel(data, e.target.value);
      if (match) onChange(Number(match.value));
    };

    return (
      <Select
        ref={ref as React.Ref<HTMLInputElement>}
        label={label}
        required={required}
        data={data}
        value={value ? String(value) : null}
        onChange={(val) => onChange(val ? Number(val) : null)}
        onBlur={handleBlur}
        error={error}
        searchable
        leftSection={selected ? <AccountAvatar account={selected} size={20} /> : null}
        renderOption={renderAccountOption(accounts, optionTestId)}
        data-testid={testId}
      />
    );
  },
);
