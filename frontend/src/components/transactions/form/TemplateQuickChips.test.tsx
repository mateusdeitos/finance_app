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
  {
    id: 3,
    user_id: 1,
    name: "Rent",
    payload: { type: "expense", description: "Rent" },
  },
  {
    id: 4,
    user_id: 1,
    name: "Travel",
    payload: { type: "expense", description: "Travel" },
  },
];

function setup(props: {
  templates: Transactions.Template[];
  onApply: (t: Transactions.Template) => void;
  onSearch: () => void;
}) {
  return render(
    <MantineProvider>
      <TemplateQuickChips {...props} />
    </MantineProvider>,
  );
}

test("renders the three most recent chips and a search chip", () => {
  const screen = setup({ templates, onApply: () => {}, onSearch: () => {} });

  expect(screen.getByTestId(TransactionsTestIds.TemplateChipsRow)).toBeTruthy();
  expect(screen.getByTestId(TransactionsTestIds.TemplateChip(1)).textContent).toBe("Groceries");
  expect(screen.getByTestId(TransactionsTestIds.TemplateChip(2)).textContent).toBe("Salary");
  expect(screen.getByTestId(TransactionsTestIds.TemplateChip(3)).textContent).toBe("Rent");
  expect(screen.queryByTestId(TransactionsTestIds.TemplateChip(4))).toBeNull();
  expect(screen.getByTestId(TransactionsTestIds.TemplateSearchChip).textContent).toContain("Pesquisar");
});

test("returns null when templates is empty", () => {
  const screen = setup({ templates: [], onApply: () => {}, onSearch: () => {} });

  expect(screen.queryByTestId(TransactionsTestIds.TemplateChipsRow)).toBeNull();
});

test("clicking a chip calls onApply with that template", () => {
  const onApply = vi.fn();
  const screen = setup({ templates, onApply, onSearch: () => {} });

  fireEvent.click(screen.getByTestId(TransactionsTestIds.TemplateChip(2)));

  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith(templates[1]);
});

test("clicking the search chip calls onSearch", () => {
  const onSearch = vi.fn();
  const screen = setup({ templates, onApply: () => {}, onSearch });

  fireEvent.click(screen.getByTestId(TransactionsTestIds.TemplateSearchChip));

  expect(onSearch).toHaveBeenCalledTimes(1);
});
