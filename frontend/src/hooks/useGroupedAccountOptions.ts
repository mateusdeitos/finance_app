import { useMemo } from "react";
import type { ComboboxItemGroup, ComboboxItem } from "@mantine/core";
import type { Transactions } from "@/types/transactions";

export function useGroupedAccountOptions(accounts: Transactions.Account[]): ComboboxItemGroup<ComboboxItem>[] {
  return useMemo(
    () =>
      accounts.reduce<ComboboxItemGroup<ComboboxItem>[]>(
        (acc, a) => {
          const item = { label: a.name, value: String(a.id) };
          if (a.user_connection) {
            acc[1] = { ...acc[1], items: [...acc[1].items, item] };
          } else {
            acc[0] = { ...acc[0], items: [...acc[0].items, item] };
          }
          return acc;
        },
        [
          { group: "Minhas contas", items: [] },
          { group: "Contas Compartilhadas", items: [] },
        ],
      ),
    [accounts],
  );
}
