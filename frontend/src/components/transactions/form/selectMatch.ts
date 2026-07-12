import type { ComboboxItem, ComboboxItemGroup } from "@mantine/core";

export type ComboboxOptions = ComboboxItemGroup<ComboboxItem>[] | ComboboxItem[];

function isGroup(
  option: ComboboxItem | ComboboxItemGroup<ComboboxItem>,
): option is ComboboxItemGroup<ComboboxItem> {
  return "group" in option;
}

/** Flattens grouped or flat combobox options into a single list of items. */
export function flattenComboboxOptions(options: ComboboxOptions): ComboboxItem[] {
  return options.flatMap((option) => (isGroup(option) ? option.items : [option]));
}

/**
 * Finds the option whose label exactly matches the typed text (case-insensitive).
 * Used by searchable Selects to commit a value on blur when the user typed a
 * full option label but didn't click an item.
 */
export function matchOptionByLabel(
  options: ComboboxOptions,
  typed: string,
): ComboboxItem | undefined {
  const query = typed.trim().toLowerCase();
  if (!query) return undefined;
  return flattenComboboxOptions(options).find((option) => option.label.toLowerCase() === query);
}

/** Drops empty groups so a native `<optgroup>` never renders with no options. */
export function dropEmptyGroups(options: ComboboxOptions): ComboboxOptions {
  if (options.length > 0 && isGroup(options[0])) {
    return (options as ComboboxItemGroup<ComboboxItem>[]).filter((group) => group.items.length > 0);
  }
  return options;
}
