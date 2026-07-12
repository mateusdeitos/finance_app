import { forwardRef, type ReactNode } from "react";
import {
  Select,
  NativeSelect,
  type ComboboxItem,
  type ComboboxItemGroup,
  type MantineSize,
  type SelectProps,
} from "@mantine/core";
import { useIsMobile } from "@/hooks/useIsMobile";

type Options = ComboboxItemGroup<ComboboxItem>[] | ComboboxItem[];

interface Props {
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  data: Options;
  /** Selected option value, or `null` when nothing is selected. */
  value: string | null;
  /** Called with the option value, or `null` when cleared. */
  onChange: (value: string | null) => void;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  size?: MantineSize;
  leftSection?: ReactNode;
  title?: string;
  style?: React.CSSProperties;
  /** Desktop-only: hide the selected-option check icon in the dropdown. */
  withCheckIcon?: boolean;
  /** Desktop-only: Mantine `Select` option renderer (e.g. avatars, testids). */
  renderOption?: SelectProps["renderOption"];
  /** Desktop-only: Mantine `Select` combobox props (e.g. `withinPortal`). */
  comboboxProps?: SelectProps["comboboxProps"];
  /** Desktop-only: called on the combobox input blur. */
  onBlur?: SelectProps["onBlur"];
  "data-testid"?: string;
}

function isGroup(
  option: ComboboxItem | ComboboxItemGroup<ComboboxItem>,
): option is ComboboxItemGroup<ComboboxItem> {
  return "group" in option;
}

/** Drops empty groups so a native `<optgroup>` never renders with no options. */
function dropEmptyGroups(data: Options): Options {
  if (data.length > 0 && isGroup(data[0])) {
    return (data as ComboboxItemGroup<ComboboxItem>[]).filter((g) => g.items.length > 0);
  }
  return data;
}

/**
 * Select that renders a native `<select>` on mobile (better touch UX — the OS
 * list picker, no combobox portal) and the richer Mantine `Select` on desktop
 * (searchable, avatars via `renderOption`, etc.). Values are strings, matching
 * Mantine's `Select` API — callers convert to/from ids as they already do.
 */
export const ResponsiveSelect = forwardRef<HTMLInputElement | HTMLSelectElement, Props>(
  function ResponsiveSelect(
    {
      label,
      description,
      placeholder,
      data,
      value,
      onChange,
      error,
      required,
      disabled,
      searchable,
      clearable,
      size,
      leftSection,
      title,
      style,
      withCheckIcon,
      renderOption,
      comboboxProps,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const isMobile = useIsMobile();
    const testId = rest["data-testid"];

    if (isMobile) {
      // Native <select> has no placeholder support, so prepend an empty option
      // that represents "no selection" and lets the user clear the field.
      const nativeData = [
        { value: "", label: placeholder ?? "Selecione" },
        ...dropEmptyGroups(data),
      ];
      return (
        <NativeSelect
          ref={ref as React.Ref<HTMLSelectElement>}
          label={label}
          description={description}
          required={required}
          disabled={disabled}
          data={nativeData}
          value={value ?? ""}
          onChange={(e) => onChange(e.currentTarget.value || null)}
          error={error}
          size={size}
          leftSection={leftSection}
          title={title}
          style={style}
          data-testid={testId}
        />
      );
    }

    return (
      <Select
        ref={ref as React.Ref<HTMLInputElement>}
        label={label}
        description={description}
        placeholder={placeholder}
        data={data}
        value={value}
        onChange={(val) => onChange(val)}
        onBlur={onBlur}
        error={error}
        required={required}
        disabled={disabled}
        searchable={searchable}
        clearable={clearable}
        size={size}
        leftSection={leftSection}
        title={title}
        style={style}
        withCheckIcon={withCheckIcon}
        renderOption={renderOption}
        comboboxProps={comboboxProps}
        data-testid={testId}
      />
    );
  },
);
