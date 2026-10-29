import { useMemo } from "react";
import type { Transactions } from "@/types/transactions";
import type { StringComboboxItemGroup } from "@/utils/selectMatch";

export function useGroupedAccountOptions(
  accounts: Transactions.Account[],
): StringComboboxItemGroup[] {
  return useMemo(
    () =>
      accounts.reduce<StringComboboxItemGroup[]>(
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
