import { Button } from "@mantine/core";
import { TransactionsTestIds } from "@/testIds";
import type { CalculatorApi } from "./useCalculator";
import classes from "./CalculatorKeypad.module.css";

interface KeyDef {
  label: string;
  testKey: string;
  onClick: () => void;
  variant: string;
  color?: string;
  wide?: boolean;
}

export function CalculatorKeypad({ calc }: { calc: CalculatorApi }) {
  const digit = (n: number): KeyDef => ({
    label: String(n),
    testKey: String(n),
    onClick: () => calc.inputDigit(n),
    variant: "default",
  });

  const keys: KeyDef[] = [
    { label: "C", testKey: "clear", onClick: calc.clear, variant: "light", color: "red" },
    { label: "⌫", testKey: "backspace", onClick: calc.backspace, variant: "default" },
    { label: "±", testKey: "negate", onClick: calc.negate, variant: "default" },
    { label: "÷", testKey: "div", onClick: () => calc.setOperator("div"), variant: "light", color: "blue" },
    digit(7),
    digit(8),
    digit(9),
    { label: "×", testKey: "mul", onClick: () => calc.setOperator("mul"), variant: "light", color: "blue" },
    digit(4),
    digit(5),
    digit(6),
    { label: "−", testKey: "sub", onClick: () => calc.setOperator("sub"), variant: "light", color: "blue" },
    digit(1),
    digit(2),
    digit(3),
    { label: "+", testKey: "add", onClick: () => calc.setOperator("add"), variant: "light", color: "blue" },
    digit(0),
    {
      label: "00",
      testKey: "00",
      onClick: () => {
        calc.inputDigit(0);
        calc.inputDigit(0);
      },
      variant: "default",
    },
    { label: "=", testKey: "equals", onClick: calc.equals, variant: "filled", color: "blue", wide: true },
  ];

  return (
    <div className={classes.keypad}>
      {keys.map((key) => (
        <Button
          key={key.testKey}
          className={`${classes.key} ${key.wide ? classes.wide : ""}`.trim()}
          variant={key.variant}
          color={key.color}
          onClick={key.onClick}
          data-testid={TransactionsTestIds.CalcKey(key.testKey)}
        >
          {key.label}
        </Button>
      ))}
    </div>
  );
}
