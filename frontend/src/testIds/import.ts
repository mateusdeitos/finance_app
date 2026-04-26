export type ImportRowAction = 'import' | 'skip' | 'duplicate'
export type ImportRowTransactionType = 'expense' | 'income' | 'transfer'
export type ImportDecimalSeparator = 'comma' | 'dot'
export type ImportTypeRule = 'positive_as_income' | 'positive_as_expense'

export const ImportTestIds = {
  // Steps
  UploadStep: 'import_upload_step',
  ReviewStep: 'import_review_step',
  FinishedStep: 'finished_import_successfully_step',

  // Upload-step controls
  BtnProcessCSV: 'btn_process_csv',
  SelectAccount: 'select_import_account',
  SelectDecimalSeparator: 'select_decimal_separator',
  SelectTypeRule: 'select_type_rule',
  InputCsvFile: 'input_csv_file',
  BtnCreateAccountHeader: 'btn_create_account_header',

  // Upload-step option testids
  OptionAccount: (accountId: number | string) => `option_import_account_${accountId}` as const,
  OptionDecimalSeparator: (value: ImportDecimalSeparator) =>
    `option_decimal_separator_${value}` as const,
  OptionTypeRule: (value: ImportTypeRule) => `option_type_rule_${value}` as const,

  // Review-step controls
  BtnConfirm: 'btn_confirm_import',
  BtnPause: 'btn_pause_import',
  BtnResume: 'btn_resume_import',

  // Row-scoped (parametric)
  Row: (rowIndex: number) => `import_row_${rowIndex}` as const,
  RowStatus: (rowIndex: number) => `import_status_${rowIndex}` as const,
  RowSelectCategory: (rowIndex: number) => `select_category_${rowIndex}` as const,
  RowSelectAction: (rowIndex: number) => `select_import_action_${rowIndex}` as const,
  RowSelectTransactionType: (rowIndex: number) =>
    `select_row_transaction_type_${rowIndex}` as const,
  RowSelectDestinationAccount: (rowIndex: number) =>
    `select_row_destination_account_${rowIndex}` as const,
  RowCheckbox: (rowIndex: number) => `checkbox_import_row_${rowIndex}` as const,
  RowBtnCreateCategory: (rowIndex: number) =>
    `btn_create_category_row_${rowIndex}` as const,

  // Row-scoped option testids
  RowOptionCategory: (rowIndex: number, categoryId: number | string) =>
    `option_row_category_${rowIndex}_${categoryId}` as const,
  RowOptionAction: (rowIndex: number, action: ImportRowAction) =>
    `option_row_action_${rowIndex}_${action}` as const,
  RowOptionTransactionType: (rowIndex: number, type: ImportRowTransactionType) =>
    `option_row_transaction_type_${rowIndex}_${type}` as const,
  RowOptionDestinationAccount: (rowIndex: number, accountId: number | string) =>
    `option_row_destination_account_${rowIndex}_${accountId}` as const,

  // Bulk toolbar
  BtnBulkRemove: 'btn_bulk_remove',
  BtnBulkApply: 'btn_bulk_apply',
  SelectBulkAction: 'select_bulk_action',

  // Recurrence popover (per-row)
  RowBtnRecurrencePopover: (rowIndex: number) =>
    `btn_recurrence_popover_${rowIndex}` as const,
  RecurrencePopoverDropdown: (rowIndex: number) =>
    `recurrence_popover_dropdown_${rowIndex}` as const,

  // Category-creation drawer (mounted from the import flow)
  DrawerCreateCategory: 'drawer_create_category',
  BtnNewCategoryInDrawer: 'btn_new_category_in_drawer',
  BtnCloseCreateCategoryDrawer: 'btn_close_create_category_drawer',
} as const
