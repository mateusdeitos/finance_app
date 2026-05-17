import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { TransactionsTestIds } from "@/testIds";
import { CalculatorKeypad } from "./CalculatorKeypad";
import { useCalculator } from "./useCalculator";

function Harness({ initialCents }: { initialCents: number }) {
  const calc = useCalculator(initialCents);
  return (
    <MantineProvider>
      <span data-testid="display">{calc.display}</span>
      <span data-testid="result">{calc.getResult()}</span>
      <CalculatorKeypad calc={calc} />
    </MantineProvider>
  );
}

afterEach(cleanup);

function setup(initialCents = 0) {
  const screen = render(<Harness initialCents={initialCents} />);
  const press = (key: string) =>
    fireEvent.click(screen.getByTestId(TransactionsTestIds.CalcKey(key)));
  const display = () => screen.getByTestId("display").textContent;
  const result = () => screen.getByTestId("result").textContent;
  return { press, display, result };
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

test("multiplication treats operands as money values", () => {
  const { press, display } = setup();
  press("2");
  press("0");
  press("0");
  press("mul");
  press("3");
  press("0");
  press("0");
  press("equals");
  expect(display()).toBe("600");
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
