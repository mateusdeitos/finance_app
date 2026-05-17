import { useReducer } from "react";
import { applyOperator, popDigit, pushDigit, type Operator } from "./calculatorMath";

interface State {
  /** Current value shown on the display, in signed cents. */
  display: number;
  /** Stored left operand of a pending operation, in cents. */
  accumulator: number | null;
  pendingOp: Operator | null;
  /** When true, the next digit starts a fresh number instead of appending. */
  overwrite: boolean;
}

type Action =
  | { type: "digit"; digit: number }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "operator"; op: Operator }
  | { type: "equals" }
  | { type: "negate" };

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
      return { display: 0, accumulator: null, pendingOp: null, overwrite: true };
    case "operator": {
      let acc: number;
      if (state.pendingOp != null && state.accumulator != null && !state.overwrite) {
        acc = applyOperator(state.accumulator, state.pendingOp, state.display);
      } else if (state.accumulator != null && state.overwrite) {
        acc = state.accumulator;
      } else {
        acc = state.display;
      }
      return { display: acc, accumulator: acc, pendingOp: action.op, overwrite: true };
    }
    case "equals": {
      if (state.pendingOp == null || state.accumulator == null) return state;
      const result = applyOperator(state.accumulator, state.pendingOp, state.display);
      return { display: result, accumulator: null, pendingOp: null, overwrite: true };
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
  return state.display;
}

export interface CalculatorApi {
  display: number;
  accumulator: number | null;
  pendingOp: Operator | null;
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
  });

  return {
    display: state.display,
    accumulator: state.accumulator,
    pendingOp: state.pendingOp,
    inputDigit: (digit) => dispatch({ type: "digit", digit }),
    backspace: () => dispatch({ type: "backspace" }),
    clear: () => dispatch({ type: "clear" }),
    setOperator: (op) => dispatch({ type: "operator", op }),
    equals: () => dispatch({ type: "equals" }),
    negate: () => dispatch({ type: "negate" }),
    getResult: () => computeResult(state),
  };
}
