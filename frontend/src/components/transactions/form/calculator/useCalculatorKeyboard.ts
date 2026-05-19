import { useEffect, useRef } from "react";
import type { Operator } from "./calculatorMath";
import type { CalculatorApi } from "./useCalculator";

const OPERATOR_KEYS: Record<string, Operator> = {
  "+": "add",
  "-": "sub",
  "*": "mul",
  "/": "div",
};

/**
 * Routes physical keyboard input to the calculator while the drawer is mounted:
 * digits 0-9, the operators + - * /, "=" (equals) and Backspace. Enter calls
 * `onSubmit`, which applies the result and closes the drawer.
 */
export function useCalculatorKeyboard(calc: CalculatorApi, onSubmit: () => void) {
  const { inputDigit, setOperator, equals, backspace } = calc;
  // Keep the latest onSubmit without re-subscribing the listener every render.
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key >= "0" && e.key <= "9" && e.key.length === 1) {
        e.preventDefault();
        inputDigit(Number(e.key));
        return;
      }

      const op = OPERATOR_KEYS[e.key];
      if (op) {
        e.preventDefault();
        setOperator(op);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        onSubmitRef.current();
        return;
      }

      if (e.key === "=") {
        e.preventDefault();
        equals();
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [inputDigit, setOperator, equals, backspace]);
}
