/**
 * Central registry of `data-testid` values. Both components (src/) and e2e
 * tests (e2e/) import from here, so the two sides can never drift.
 *
 * Conventions:
 * - One file per domain (accounts, categories, charges, transactions, import),
 *   plus `common.ts` for cross-cutting layout/invite ids.
 * - All ids (static and parametric) are declared as `as const` objects:
 *     export const XxxTestIds = {
 *       StaticId: 'snake_case_value',
 *       ParametricId: (n: number) => `snake_case_${n}` as const,
 *     } as const
 * - Static ids are plain string values. Parametric ids are arrow functions
 *   returning `'...' as const` so the return type is a string literal.
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
export { RecurrenceTestIds } from './recurrence'
