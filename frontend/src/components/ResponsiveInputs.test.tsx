import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { ResponsiveDateInput } from "./ResponsiveDateInput";
import { ResponsiveSelect } from "./ResponsiveSelect";

/** Forces `useIsMobile` (Mantine `useMediaQuery('(max-width: 48em)')`) on/off. */
function mockViewport(isMobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("48em") ? isMobile : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

function renderWithMantine(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

const OPTIONS = [
  { value: "1", label: "One" },
  { value: "2", label: "Two" },
];

test("ResponsiveDateInput renders a native date input on mobile", () => {
  mockViewport(true);
  const { container } = renderWithMantine(
    <ResponsiveDateInput value="2026-05-10" onChange={() => {}} data-testid="d" />,
  );
  expect(container.querySelector('input[type="date"]')).not.toBeNull();
});

test("ResponsiveDateInput desktop 'picker' has no native date input", () => {
  mockViewport(false);
  const { container } = renderWithMantine(
    <ResponsiveDateInput value="2026-05-10" onChange={() => {}} data-testid="d" />,
  );
  expect(container.querySelector('input[type="date"]')).toBeNull();
});

test("ResponsiveDateInput desktop 'input' variant renders a typeable text input", () => {
  mockViewport(false);
  const { getByTestId } = renderWithMantine(
    <ResponsiveDateInput
      value="2026-05-10"
      onChange={() => {}}
      desktopVariant="input"
      data-testid="d"
    />,
  );
  // DateInput is a real <input> carrying the formatted value (not a button).
  expect(getByTestId("d").tagName).toBe("INPUT");
  expect((getByTestId("d") as HTMLInputElement).value).toBe("10/05/2026");
});

test("ResponsiveSelect renders a native <select> on mobile", () => {
  mockViewport(true);
  const { getByTestId } = renderWithMantine(
    <ResponsiveSelect data={OPTIONS} value={null} onChange={() => {}} data-testid="s" />,
  );
  expect(getByTestId("s").tagName).toBe("SELECT");
});

test("ResponsiveSelect renders the Mantine combobox <input> on desktop", () => {
  mockViewport(false);
  const { getByTestId } = renderWithMantine(
    <ResponsiveSelect data={OPTIONS} value={null} onChange={() => {}} data-testid="s" />,
  );
  expect(getByTestId("s").tagName).toBe("INPUT");
});

test("ResponsiveSelect native mobile options include an empty placeholder first", () => {
  mockViewport(true);
  const { getByTestId } = renderWithMantine(
    <ResponsiveSelect
      data={OPTIONS}
      value={null}
      onChange={() => {}}
      placeholder="Pick one"
      data-testid="s"
    />,
  );
  const options = getByTestId("s").querySelectorAll("option");
  expect(options).toHaveLength(3);
  expect(options[0].value).toBe("");
  expect(options[0].textContent).toBe("Pick one");
});
