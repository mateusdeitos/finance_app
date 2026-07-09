import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { TransactionsTestIds } from "@/testIds";
import { Transactions } from "@/types/transactions";
import { TemplateQuickChips } from "./TemplateQuickChips";

afterEach(cleanup);

const templates: Transactions.Template[] = [
  {
    id: 1,
    user_id: 1,
    name: "Groceries",
    payload: { type: "expense", description: "Groceries" },
  },
  {
    id: 2,
    user_id: 1,
    name: "Salary",
    payload: { type: "income", description: "Salary" },
  },
];

function setup(props: { templates: Transactions.Template[]; onApply: (t: Transactions.Template) => void }) {
  return render(
    <MantineProvider>
      <TemplateQuickChips {...props} />
    </MantineProvider>,
  );
}

test("renders one chip per template with the right testid and name", () => {
  const screen = setup({ templates, onApply: () => {} });

  expect(screen.getByTestId(TransactionsTestIds.TemplateChipsRow)).toBeTruthy();
  expect(screen.getByTestId(TransactionsTestIds.TemplateChip(1)).textContent).toBe("Groceries");
  expect(screen.getByTestId(TransactionsTestIds.TemplateChip(2)).textContent).toBe("Salary");
});

test("returns null when templates is empty", () => {
  const screen = setup({ templates: [], onApply: () => {} });

  expect(screen.queryByTestId(TransactionsTestIds.TemplateChipsRow)).toBeNull();
});

test("clicking a chip calls onApply with that template", () => {
  const onApply = vi.fn();
  const screen = setup({ templates, onApply });

  fireEvent.click(screen.getByTestId(TransactionsTestIds.TemplateChip(2)));

  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith(templates[1]);
});
