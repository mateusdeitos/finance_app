import { forwardRef, type FocusEvent, type ReactNode } from "react";
import { Select, NativeSelect, type ComboboxItem } from "@mantine/core";
import { useIsMobile } from "@/hooks/useIsMobile";
import { TransactionsTestIds } from "@/testIds";
import { matchOptionByLabel } from "./selectMatch";

interface Props {
  label: ReactNode;
  data: ComboboxItem[];
  value: number | null;
  onChange: (val: number | null) => void;
  error?: ReactNode;
  "data-testid"?: string;
}

/**
 * Category picker. Native `<select>` on mobile (better touch UX), searchable
 * Mantine `Select` on desktop. Category is optional, so both variants allow
 * clearing — the native one via its placeholder/empty option, the desktop one
 * via the clear button.
 */
export const CategorySelectField = forwardRef<HTMLInputElement | HTMLSelectElement, Props>(
  function CategorySelectField({ label, data, value, onChange, error, ...rest }, ref) {
    const isMobile = useIsMobile();
    const testId = rest["data-testid"];

    if (isMobile) {
      // Native <select> has no placeholder support, so prepend an empty option
      // that represents "no category" and lets the user clear the field.
      const nativeData = [{ value: "", label: "Selecione uma categoria" }, ...data];
      return (
        <NativeSelect
          ref={ref as React.Ref<HTMLSelectElement>}
          label={label}
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

    const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
      const match = matchOptionByLabel(data, e.target.value);
      if (match) onChange(Number(match.value));
    };

    return (
      <Select
        ref={ref as React.Ref<HTMLInputElement>}
        label={label}
        data={data}
        value={value ? String(value) : null}
        onChange={(val) => onChange(val ? Number(val) : null)}
        onBlur={handleBlur}
        error={error}
        searchable
        clearable
        renderOption={({ option }) => (
          <span data-testid={TransactionsTestIds.OptionCategory(option.value)}>{option.label}</span>
        )}
        data-testid={testId}
      />
    );
  },
);
