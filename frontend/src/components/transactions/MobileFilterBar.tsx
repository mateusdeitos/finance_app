import { Button, Group } from "@mantine/core";
import { useState } from "react";
import { TransactionFilters } from "./TransactionFilters";
import { TextSearch } from "./filters/TextSearch";

/**
 * Mobile-only filter row that pairs the search pill with the scrollable
 * filter chips. When the input is focused, the chips collapse and a
 * Cancelar link replaces them so the search input gets the whole width
 * (matches the variation C "Buscar focado" state).
 */
export function MobileFilterBar() {
  const [focused, setFocused] = useState(false);

  return (
    <>
      <Group gap="xs" wrap="nowrap" align="center">
        <TextSearch onFocusChange={setFocused} />
        {focused && (
          // The mousedown handler keeps the blur from firing before the click
          // resolves on touch devices, so the button always gets to run its
          // collapse intent instead of disappearing on input blur.
          <Button
            variant="subtle"
            color="blue"
            size="compact-sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setFocused(false)}
          >
            Cancelar
          </Button>
        )}
      </Group>
      {!focused && (
        <TransactionFilters orientation="row" hideTextSearch scrollable />
      )}
    </>
  );
}
