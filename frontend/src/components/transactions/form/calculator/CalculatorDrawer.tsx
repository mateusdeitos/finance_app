import { Button, Stack, Text } from "@mantine/core";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { TransactionsTestIds } from "@/testIds";
import { formatBalance } from "@/utils/formatCents";
import { useDrawerContext } from "@/utils/renderDrawer";
import type { Operator } from "./calculatorMath";
import { CalculatorKeypad } from "./CalculatorKeypad";
import { useCalculator } from "./useCalculator";

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
            {formatBalance(calc.display)}
          </Text>
        </Stack>

        <CalculatorKeypad calc={calc} />

        <Button
          size="md"
          onClick={() => close(calc.getResult())}
          data-testid={TransactionsTestIds.BtnCalcApply}
        >
          Aplicar
        </Button>
      </Stack>
    </ResponsiveDrawer>
  );
}
