import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { TransactionsTestIds } from "@/testIds";
import { TransactionFormFooter } from "./TransactionFormFooter";

const originalMatchMedia = window.matchMedia;

function mockDesktopViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function setup(props: {
  onSaveAndCreateAnother?: () => void;
  onSaveAsTemplate?: () => void;
}) {
  mockDesktopViewport();
  return render(
    <MantineProvider>
      <TransactionFormFooter loading={false} {...props} />
    </MantineProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

test("keeps save as the primary submit action and exposes create actions in its menu", async () => {
  const onSaveAndCreateAnother = vi.fn();
  const onSaveAsTemplate = vi.fn();
  const screen = setup({ onSaveAndCreateAnother, onSaveAsTemplate });

  expect(screen.getByTestId(TransactionsTestIds.BtnSave).getAttribute("type")).toBe("submit");
  expect(screen.queryByTestId(TransactionsTestIds.BtnSaveAndCreateAnother)).toBeNull();
  expect(screen.queryByTestId(TransactionsTestIds.BtnSaveAsTemplate)).toBeNull();

  fireEvent.click(screen.getByTestId(TransactionsTestIds.BtnSaveActionsMenu));

  await waitFor(() =>
    expect(screen.queryByTestId(TransactionsTestIds.BtnSaveAsTemplate)).not.toBeNull(),
  );

  fireEvent.click(screen.getByTestId(TransactionsTestIds.BtnSaveAsTemplate));
  expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByTestId(TransactionsTestIds.BtnSaveActionsMenu));
  await waitFor(() =>
    expect(screen.queryByTestId(TransactionsTestIds.BtnSaveAndCreateAnother)).not.toBeNull(),
  );
  fireEvent.click(screen.getByTestId(TransactionsTestIds.BtnSaveAndCreateAnother));
  expect(onSaveAndCreateAnother).toHaveBeenCalledTimes(1);
});

test("shows only save and create another when no template action is available", async () => {
  const screen = setup({ onSaveAndCreateAnother: () => {} });

  fireEvent.click(screen.getByTestId(TransactionsTestIds.BtnSaveActionsMenu));

  await waitFor(() =>
    expect(screen.queryByTestId(TransactionsTestIds.BtnSaveAndCreateAnother)).not.toBeNull(),
  );
  expect(screen.getByTestId(TransactionsTestIds.BtnSaveAndCreateAnother)).toBeTruthy();
  expect(screen.queryByTestId(TransactionsTestIds.BtnSaveAsTemplate)).toBeNull();
});
