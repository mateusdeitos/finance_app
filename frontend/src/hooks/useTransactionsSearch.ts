import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";
import type { TransactionsSearch } from "@/routes/_authenticated.transactions";

/**
 * Reads the /transactions search params and exposes an `update` helper that
 * navigates with an absolute target. This is the renderDrawer-safe variant
 * of `useSearch({ from: '/_authenticated/transactions' })` + `useNavigate({
 * from: '/transactions' })`: those require an active match in the React
 * tree, which the portal root spawned by renderDrawer does not have (the
 * portal only inherits the router via RouterContextProvider, not the
 * matches context). `useRouterState` reads from router state directly, and
 * `useNavigate()` without `from` works with the absolute `to` we pass.
 */
export function useTransactionsSearch() {
  const search = useRouterState({
    select: (s) => s.location.search as TransactionsSearch,
  });
  const navigate = useNavigate();
  const update = useCallback(
    (updater: (prev: TransactionsSearch) => TransactionsSearch) => {
      void navigate({
        to: "/transactions",
        search: (prev) => updater(prev as TransactionsSearch),
      });
    },
    [navigate],
  );
  return { search, update };
}
