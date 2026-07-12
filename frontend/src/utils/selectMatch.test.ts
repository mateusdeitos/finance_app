import { expect, test } from "vitest";
import { matchOptionByLabel, dropEmptyGroups, flattenComboboxOptions } from "./selectMatch";

const flat = [
  { value: "1", label: "Nubank" },
  { value: "2", label: "Itaú" },
];

const grouped = [
  { group: "Minhas contas", items: [{ value: "1", label: "Nubank" }] },
  { group: "Compartilhadas", items: [{ value: "2", label: "Nubank" }] },
];

test("matches a unique label case-insensitively", () => {
  expect(matchOptionByLabel(flat, "nubank")?.value).toBe("1");
  expect(matchOptionByLabel(flat, "  ITAÚ ")?.value).toBe("2");
});

test("returns undefined when the label is ambiguous (duplicate across groups)", () => {
  // Two "Nubank" options — must not guess the first one.
  expect(matchOptionByLabel(grouped, "Nubank")).toBeUndefined();
});

test("returns undefined for empty input or no match", () => {
  expect(matchOptionByLabel(flat, "")).toBeUndefined();
  expect(matchOptionByLabel(flat, "   ")).toBeUndefined();
  expect(matchOptionByLabel(flat, "Bradesco")).toBeUndefined();
});

test("flattenComboboxOptions flattens groups and flat lists", () => {
  expect(flattenComboboxOptions(grouped)).toHaveLength(2);
  expect(flattenComboboxOptions(flat)).toHaveLength(2);
});

test("dropEmptyGroups removes groups with no items", () => {
  const withEmpty = [
    { group: "A", items: [{ value: "1", label: "One" }] },
    { group: "B", items: [] },
  ];
  expect(dropEmptyGroups(withEmpty)).toEqual([
    { group: "A", items: [{ value: "1", label: "One" }] },
  ]);
  // Flat lists pass through untouched.
  expect(dropEmptyGroups(flat)).toBe(flat);
});
