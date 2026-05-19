import { useMemo, useReducer } from "react";
import { applyOperator, popDigit, pushDigit, type Operator } from "./calculatorMath";

/**
 * How keypad digits are interpreted: `cents` builds a 2-decimal money value
 * (right-to-left, like CurrencyInput); `integer` builds a whole number — used
 * for the factor of a multiplication or division.
 */
export type EntryMode = "cents" | "integer";

interface State {
  /** Current operand. Cents when `mode` is "cents", a whole number otherwise. */
  display: number;
  /** Stored left operand of a pending operation, always in cents. */
  accumulator: number | null;
  pendingOp: Operator | null;
  /** When true, the next digit starts a fresh number instead of appending. */
  overwrite: boolean;
  mode: EntryMode;
}

type Action =
  | { type: "digit"; digit: number }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "operator"; op: Operator }
  | { type: "equals" }
  | { type: "negate" };

/** Multiply/divide take a whole-number factor, so they switch to integer entry. */
function modeForOperator(op: Operator): EntryMode {
  return op === "mul" || op === "div" ? "integer" : "cents";
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "digit": {
      if (state.overwrite) {
        return { ...state, display: action.digit, overwrite: false };
      }
      const sign = state.display < 0 ? -1 : 1;
      const nextAbs = pushDigit(Math.abs(state.display), action.digit);
      return { ...state, display: sign * nextAbs };
    }
    case "backspace": {
      const sign = state.display < 0 ? -1 : 1;
      return {
        ...state,
        display: sign * popDigit(Math.abs(state.display)),
        overwrite: false,
      };
    }
    case "clear":
      return {
        display: 0,
        accumulator: null,
        pendingOp: null,
        overwrite: true,
        mode: "cents",
      };
    case "operator": {
      let acc: number;
      if (state.pendingOp != null && state.accumulator != null && !state.overwrite) {
        acc = applyOperator(state.accumulator, state.pendingOp, state.display);
      } else {
        acc = state.accumulator ?? state.display;
      }
      return {
        display: 0,
        accumulator: acc,
        pendingOp: action.op,
        overwrite: true,
        mode: modeForOperator(action.op),
      };
    }
    case "equals": {
      if (state.pendingOp == null || state.accumulator == null) return state;
      const result = state.overwrite
        ? state.accumulator
        : applyOperator(state.accumulator, state.pendingOp, state.display);
      return {
        display: result,
        accumulator: null,
        pendingOp: null,
        overwrite: true,
        mode: "cents",
      };
    }
    case "negate":
      return { ...state, display: -state.display };
  }
}

/** Evaluates any pending operation so closing the drawer yields a final result. */
function computeResult(state: State): number {
  if (state.pendingOp != null && state.accumulator != null && !state.overwrite) {
    return applyOperator(state.accumulator, state.pendingOp, state.display);
  }
  if (state.accumulator != null) return state.accumulator;
  return state.display;
}

export interface CalculatorApi {
  display: number;
  accumulator: number | null;
  pendingOp: Operator | null;
  mode: EntryMode;
  inputDigit: (digit: number) => void;
  backspace: () => void;
  clear: () => void;
  setOperator: (op: Operator) => void;
  equals: () => void;
  negate: () => void;
  getResult: () => number;
}

export function useCalculator(initialCents: number): CalculatorApi {
  const [state, dispatch] = useReducer(reducer, {
    display: initialCents,
    accumulator: null,
    pendingOp: null,
    overwrite: true,
    mode: "cents",
  });

  // Stable action identities so the keyboard listener subscribes only once.
  const actions = useMemo(
    () => ({
      inputDigit: (digit: number) => dispatch({ type: "digit", digit }),
      backspace: () => dispatch({ type: "backspace" }),
      clear: () => dispatch({ type: "clear" }),
      setOperator: (op: Operator) => dispatch({ type: "operator", op }),
      equals: () => dispatch({ type: "equals" }),
      negate: () => dispatch({ type: "negate" }),
    }),
    [],
  );

  return {
    display: state.display,
    accumulator: state.accumulator,
    pendingOp: state.pendingOp,
    mode: state.mode,
    ...actions,
    getResult: () => computeResult(state),
  };
}
