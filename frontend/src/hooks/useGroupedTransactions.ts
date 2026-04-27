import { useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { useActiveFilters } from "./useActiveFilters";
import { useTransactions } from "./useTransactions";
import { useAccounts } from "./useAccounts";
import { useFlattenCategories } from "./useCategories";
import { Transactions } from "@/types/transactions";
import { groupTransactions } from "@/utils/groupTransactions";

const EMPTY_TRANSACTIONS: Transactions.Transaction[] = [];
const EMPTY_ACCOUNTS: Transactions.Account[] = [];
const EMPTY_CATEGORIES: Transactions.Category[] = [];

export function useGroupedTransactions<T = Transactions.TransactionGroup[]>(
  select?: (groups: Transactions.TransactionGroup[]) => T,
) {
  const search = useSearch({ from: "/_authenticated/transactions" });
  const filters = useActiveFilters();

  const { query: txQuery } = useTransactions({
    month: search.month,
    year: search.year,
    ...filters,
  });
  const { query: accountsQuery } = useAccounts();
  const { query: categoriesQuery } = useFlattenCategories();

  const transactions = txQuery.data ?? EMPTY_TRANSACTIONS;
  const accounts = accountsQuery.data ?? EMPTY_ACCOUNTS;
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;

  const filtered = useMemo(() => {
    if (!search.query) return transactions;
    const lower = search.query.toLowerCase();
    return transactions.filter((tx) => tx.description.toLowerCase().includes(lower));
  }, [transactions, search.query]);

  const groups = useMemo(
    () => groupTransactions(filtered, search.groupBy, accounts, categories),
    [filtered, search.groupBy, accounts, categories],
  );

  const selected = useMemo(
    () => (select ? select(groups) : groups),
    [groups, select],
  ) as T;

  return {
    data: selected,
    groups,
    accounts,
    categories,
    isLoading: txQuery.isLoading,
  };
}
