import { useRef, forwardRef, useImperativeHandle } from "react";
import { ActionIcon, TextInput } from "@mantine/core";
import { IconCalculator } from "@tabler/icons-react";
import { TransactionsTestIds } from "@/testIds";
import { renderDrawer } from "@/utils/renderDrawer";
import { CalculatorDrawer } from "./calculator/CalculatorDrawer";

interface Props {
  value: number; // in cents
  onChange: (cents: number) => void;
  error?: string;
  label?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  allowNegative?: boolean;
  /** Shows a calculator icon button that opens a drawer to compute the amount. */
  withCalculator?: boolean;
  "data-testid"?: string;
}

export interface CurrencyInputHandle {
  focus: () => void;
}

const MAX_CENTS = 9_999_999_999; // R$ 99.999.999,99

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export const CurrencyInput = forwardRef<CurrencyInputHandle, Props>(function CurrencyInput(
  {
    value,
    onChange,
    error,
    label,
    description,
    required,
    disabled,
    allowNegative,
    withCalculator,
    "data-testid": dataTestId,
  }: Props,
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  async function openCalculator() {
    try {
      const result = await renderDrawer<number>(() => <CalculatorDrawer initialCents={value} />);
      onChange(result);
      inputRef.current?.focus();
    } catch {
      // Drawer dismissed via ESC/backdrop — keep the current value.
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Let browser handle shortcuts and navigation
    if (e.ctrlKey || e.metaKey) return;
    if (["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;

    e.preventDefault();

    const el = e.currentTarget;
    const allSelected = el.selectionStart === 0 && el.selectionEnd === el.value.length;

    if (allowNegative && e.key === "-") {
      onChange(-value);
      return;
    }

    const sign = value < 0 ? -1 : 1;
    const abs = Math.abs(value);

    if (e.key === "Backspace" || e.key === "Delete") {
      if (allSelected) {
        onChange(0);
      } else if (e.key === "Backspace") {
        const truncated = Math.floor(abs / 10);
        onChange(truncated === 0 ? 0 : sign * truncated);
      }
      return;
    }

    if (/^\d$/.test(e.key)) {
      const digit = parseInt(e.key, 10);
      const nextAbs = allSelected ? digit : abs * 10 + digit;
      if (nextAbs <= MAX_CENTS) onChange(nextAbs === 0 ? 0 : sign * nextAbs);
    }
  }

  return (
    <TextInput
      ref={inputRef}
      label={label}
      description={description}
      required={required}
      disabled={disabled}
      value={formatCents(value)}
      onChange={() => {}}
      onKeyDown={handleKeyDown}
      onFocus={(e) => e.currentTarget.select()}
      error={error}
      inputMode="numeric"
      data-testid={dataTestId}
      rightSectionPointerEvents={withCalculator ? "all" : undefined}
      rightSection={
        withCalculator ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            disabled={disabled}
            onClick={openCalculator}
            aria-label="Abrir calculadora"
            data-testid={TransactionsTestIds.BtnOpenCalculator}
          >
            <IconCalculator size={18} />
          </ActionIcon>
        ) : undefined
      }
    />
  );
});
