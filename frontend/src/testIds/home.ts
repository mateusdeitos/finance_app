export const HomeTestIds = {
  Page: 'home_page',
  PeriodNavigator: 'home_period_navigator',

  // Account balances
  AccountBalancesSection: 'section_account_balances',
  AccumulatedToggle: 'toggle_balances_accumulated',
  /** Clickable balance row, parametric by account id. */
  AccountRow: (accountId: number) => `row_account_balance_${accountId}` as const,
  AccountBalancesTotal: 'account_balances_total',

  // Expense distribution (pie)
  ExpenseChartSection: 'section_expense_chart',
  SettlementsToggle: 'toggle_consider_settlements',
  ExpenseChart: 'expense_pie_chart',

  // Income flow (sankey)
  IncomeFlowSection: 'section_income_flow',
  IncomeFlowChart: 'income_sankey_chart',

  // Recurring transactions
  RecurringStartingSection: 'section_recurring_starting',
  RecurringEndingSection: 'section_recurring_ending',
  RecurringStartingTotal: 'recurring_starting_total',
  RecurringEndingTotal: 'recurring_ending_total',
  /** Recurring transaction row, parametric by transaction id. */
  RecurringRow: (transactionId: number) => `row_recurring_${transactionId}` as const,
} as const
