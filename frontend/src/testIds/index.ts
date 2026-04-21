/**
 * Central registry of `data-testid` values. Both components (src/) and e2e
 * tests (e2e/) import from here, so the two sides can never drift.
 *
 * Conventions:
 * - One file per domain (accounts, categories, charges, transactions, import),
 *   plus `common.ts` for cross-cutting layout/invite ids.
 * - Static ids are `PascalCase: 'snake_case'`. Parametric ids are factory
 *   functions that return a `snake_case_${param}` literal type via `as const`.
 * - When adding a new testid: add it here first, then reference it from the
 *   component and the test in the same PR.
 */
export { CommonTestIds } from './common'
export { AccountsTestIds } from './accounts'
export { CategoriesTestIds } from './categories'
export { ChargesTestIds, type ChargeAction } from './charges'
export {
  TransactionsTestIds,
  type TransactionType,
  type PropagationOption,
} from './transactions'
export { ImportTestIds } from './import'
