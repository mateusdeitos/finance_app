import { forwardRef, type ReactNode } from "react";
import { TextInput, type MantineSize } from "@mantine/core";
import { DateInput, DatePickerInput } from "@mantine/dates";
import { useIsMobile } from "@/hooks/useIsMobile";

interface Props {
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Date value as `YYYY-MM-DD`, or `""`/`null` when empty. */
  value: string | null;
  /** Called with the `YYYY-MM-DD` value, or `""` when cleared. */
  onChange: (value: string) => void;
  error?: ReactNode;
  placeholder?: string;
  leftSection?: ReactNode;
  size?: MantineSize;
  clearable?: boolean;
  /** Applied to the underlying `<input>` element across every variant. */
  inputClassName?: string;
  /**
   * Desktop rendering. `"picker"` (default) is the `DatePickerInput` popover
   * calendar; `"input"` is the typeable `DateInput` text field — used for
   * compact inline fields (e.g. the split settlement date) and where an e2e
   * reads the value off a real `<input>`. Mobile always renders the native
   * `<input type="date">` regardless of this.
   */
  desktopVariant?: "picker" | "input";
  "data-testid"?: string;
}

/**
 * Date field that adapts to the viewport:
 *
 * - **Mobile**: a native `<input type="date">`, which opens the OS date picker
 *   (wheel/grid) instead of Mantine's popover calendar. The popover calendar
 *   repositions itself as the on-screen keyboard / viewport changes, making it
 *   jump around and hard to navigate on touch devices — the native control has
 *   none of that. Its value format is already `YYYY-MM-DD`, matching the form
 *   schema, so no conversion is needed.
 * - **Desktop**: the richer `DatePickerInput` popover (or a typeable `DateInput`
 *   when `desktopVariant="input"`), formatted `DD/MM/YYYY`.
 */
export const ResponsiveDateInput = forwardRef<HTMLInputElement | HTMLButtonElement, Props>(
  function ResponsiveDateInput(
    {
      label,
      description,
      required,
      disabled,
      value,
      onChange,
      error,
      placeholder,
      leftSection,
      size,
      clearable,
      inputClassName,
      desktopVariant = "picker",
      ...rest
    },
    ref,
  ) {
    const isMobile = useIsMobile();
    const classNames = inputClassName ? { input: inputClassName } : undefined;

    if (isMobile) {
      return (
        <TextInput
          ref={ref as React.Ref<HTMLInputElement>}
          type="date"
          label={label}
          description={description}
          required={required}
          disabled={disabled}
          value={value ?? ""}
          onChange={(e) => onChange(e.currentTarget.value)}
          error={error}
          placeholder={placeholder}
          leftSection={leftSection}
          size={size}
          classNames={classNames}
          {...rest}
        />
      );
    }

    const commonDesktopProps = {
      label,
      description,
      required,
      disabled,
      value: value || null,
      onChange: (date: string | null) => onChange(date ?? ""),
      error,
      placeholder,
      leftSection,
      size,
      clearable,
      classNames,
      valueFormat: "DD/MM/YYYY",
      ...rest,
    };

    if (desktopVariant === "input") {
      return <DateInput ref={ref as React.Ref<HTMLInputElement>} {...commonDesktopProps} />;
    }

    return <DatePickerInput ref={ref as React.Ref<HTMLButtonElement>} {...commonDesktopProps} />;
  },
);
