import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { TransactionsTestIds } from "@/testIds";
import { CalculatorKeypad } from "./CalculatorKeypad";
import { useCalculator } from "./useCalculator";
import { useCalculatorKeyboard } from "./useCalculatorKeyboard";

function Harness({ initialCents }: { initialCents: number }) {
  const calc = useCalculator(initialCents);
  useCalculatorKeyboard(calc);
  return (
    <MantineProvider>
      <span data-testid="display">{calc.display}</span>
      <span data-testid="result">{calc.getResult()}</span>
      <span data-testid="mode">{calc.mode}</span>
      <CalculatorKeypad calc={calc} />
    </MantineProvider>
  );
}

afterEach(cleanup);

function setup(initialCents = 0) {
  const screen = render(<Harness initialCents={initialCents} />);
  const press = (key: string) =>
    fireEvent.click(screen.getByTestId(TransactionsTestIds.CalcKey(key)));
  const type = (key: string) => fireEvent.keyDown(document, { key });
  const display = () => screen.getByTestId("display").textContent;
  const result = () => screen.getByTestId("result").textContent;
  const mode = () => screen.getByTestId("mode").textContent;
  return { press, type, display, result, mode };
}

test("digits fill right-to-left, overwriting the preloaded value", () => {
  const { press, display } = setup(9999);
  press("1");
  expect(display()).toBe("1");
  press("2");
  press("3");
  expect(display()).toBe("123");
});

test("addition with equals", () => {
  const { press, display } = setup();
  press("1");
  press("2");
  press("3");
  press("add");
  press("1");
  press("0");
  press("0");
  press("equals");
  expect(display()).toBe("223");
});

test("multiplication scales a cents amount by a whole number", () => {
  const { press, display, mode } = setup();
  // 2,00 entered cents-style, then x3 as a whole number.
  press("2");
  press("0");
  press("0");
  press("mul");
  expect(mode()).toBe("integer");
  press("3");
  press("equals");
  expect(display()).toBe("600");
  expect(mode()).toBe("cents");
});

test("getResult evaluates a pending operation that was not equalsed", () => {
  const { press, result } = setup();
  press("5");
  press("0");
  press("0");
  press("add");
  press("5");
  press("0");
  press("0");
  expect(result()).toBe("1000");
});

test("clear resets the calculator", () => {
  const { press, display } = setup(5000);
  press("9");
  press("add");
  press("clear");
  expect(display()).toBe("0");
});

test("keyboard digits, operators and Enter drive the calculator", () => {
  const { type, display } = setup();
  type("7");
  type("+");
  type("3");
  type("Enter");
  expect(display()).toBe("10");
});

test("keyboard multiplication switches to integer entry", () => {
  const { type, display, mode } = setup();
  type("5");
  type("0");
  type("0");
  type("*");
  expect(mode()).toBe("integer");
  type("3");
  type("Enter");
  expect(display()).toBe("1500");
});
