import { Button, Group, Kbd, Stack, Text } from "@mantine/core";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { TransactionsTestIds } from "@/testIds";
import { formatBalance } from "@/utils/formatCents";
import { useDrawerContext } from "@/utils/renderDrawer";
import type { Operator } from "./calculatorMath";
import { CalculatorKeypad } from "./CalculatorKeypad";
import { useCalculator } from "./useCalculator";
import { useCalculatorKeyboard } from "./useCalculatorKeyboard";

const OPERATOR_SYMBOL: Record<Operator, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
};

/**
 * Cents-style calculator opened from CurrencyInput. `close` resolves with the
 * final result (Aplicar button); `reject` discards it (ESC / backdrop).
 */
export function CalculatorDrawer({ initialCents }: { initialCents: number }) {
  const { opened, close, reject } = useDrawerContext<number>();
  const calc = useCalculator(initialCents);
  const handleApply = () => close(calc.getResult());
  useCalculatorKeyboard(calc, handleApply);

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Calculadora"
      data-testid={TransactionsTestIds.DrawerCalculator}
    >
      <Stack gap="md">
        <Stack gap={2}>
          <Text c="dimmed" size="sm" ta="right" data-testid={TransactionsTestIds.CalcExpression}>
            {calc.pendingOp != null && calc.accumulator != null
              ? `${formatBalance(calc.accumulator)} ${OPERATOR_SYMBOL[calc.pendingOp]}`
              : " "}
          </Text>
          <Text size="xl" fw={700} ta="right" data-testid={TransactionsTestIds.CalcDisplay}>
            {calc.mode === "integer" ? String(calc.display) : formatBalance(calc.display)}
          </Text>
        </Stack>

        <CalculatorKeypad calc={calc} />

        <Group grow>
          <Button
            size="md"
            variant="default"
            onClick={() => reject()}
            data-testid={TransactionsTestIds.BtnCalcCancel}
          >
            Cancelar
          </Button>
          <Button
            size="md"
            onClick={handleApply}
            rightSection={<Kbd>Enter</Kbd>}
            data-testid={TransactionsTestIds.BtnCalcApply}
          >
            Aplicar
          </Button>
        </Group>
      </Stack>
    </ResponsiveDrawer>
  );
}
