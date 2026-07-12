import { forwardRef, type ReactNode } from "react";
import { TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useIsMobile } from "@/hooks/useIsMobile";

interface Props {
  label?: ReactNode;
  required?: boolean;
  /** Date value as `YYYY-MM-DD`, or `""` when empty. */
  value: string;
  onChange: (value: string) => void;
  error?: ReactNode;
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
 * - **Desktop**: the richer `DatePickerInput` popover, formatted `DD/MM/YYYY`.
 */
export const ResponsiveDateInput = forwardRef<HTMLInputElement | HTMLButtonElement, Props>(
  function ResponsiveDateInput({ label, required, value, onChange, error, ...rest }, ref) {
    const isMobile = useIsMobile();

    if (isMobile) {
      return (
        <TextInput
          ref={ref as React.Ref<HTMLInputElement>}
          type="date"
          label={label}
          required={required}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          error={error}
          {...rest}
        />
      );
    }

    return (
      <DatePickerInput
        ref={ref as React.Ref<HTMLButtonElement>}
        label={label}
        required={required}
        value={value || null}
        onChange={(date) => onChange(date ?? "")}
        error={error}
        valueFormat="DD/MM/YYYY"
        {...rest}
      />
    );
  },
);
