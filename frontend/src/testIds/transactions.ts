export type TransactionType = 'expense' | 'income' | 'transfer'
export type PropagationOption = 'current' | 'current_and_future' | 'all'
export type TransactionFilterKind = 'accounts' | 'categories' | 'tags'

export const TransactionsTestIds = {
  // Page-level
  BtnNew: 'btn_new_transaction',
  BtnSave: 'btn_save_transaction',
  BtnMoreOptions: 'btn_more_options',
  MenuItemImportTransactions: 'menu_item_import_transactions',
  Checkbox: (txId: number | string) => `checkbox_${txId}` as const,

  // Drawers (create / update / linked)
  DrawerCreate: 'drawer_create_transaction',
  DrawerUpdate: 'drawer_update_transaction',
  DrawerUpdateLinkedSplit: 'drawer_update_linked_split',
  DrawerUpdateLinkedTransfer: 'drawer_update_linked_transfer',

  // Form errors
  AlertFormError: 'alert_form_error',

  // Form fields
  InputAmount: 'input_amount',
  InputDescription: 'input_description',
  SelectAccount: 'select_account',
  SelectDestinationAccount: 'select_destination_account',
  SelectCategory: 'select_category',
  SegmentedTransactionType: 'segmented_transaction_type',

  // Select options (renderOption testids — pass the entity id)
  OptionAccount: (accountId: number | string) => `option_account_${accountId}` as const,
  OptionDestinationAccount: (accountId: number | string) =>
    `option_destination_account_${accountId}` as const,
  OptionCategory: (categoryId: number | string) => `option_category_${categoryId}` as const,

  // SegmentedControl items
  SegmentTransactionType: (type: TransactionType) => `segment_transaction_type_${type}` as const,
  SegmentGroupBy: (option: 'date' | 'category' | 'account') =>
    `segment_group_by_${option}` as const,

  // Split
  InputSplitAmount: 'input_split_amount',
  InputSplitPercentage: 'input_split_percentage',
  BtnAddSplitRow: 'btn_add_split_row',

  // Transfer row avatar pair
  TransferAvatarGroup: 'transfer_avatar_group',
  IconTransferArrow: 'icon_transfer_arrow',

  // Filters (top-level)
  InputTextSearch: 'input_text_search',
  SegmentedGroupBy: 'segmented_group_by',
  AdvancedFiltersPopover: 'advanced_filters_popover',
  BtnOpenAdvancedFilters: 'open_advanced_filters',
  SwitchType: (type: TransactionType) => `switch_type_${type}` as const,
  SwitchHideSettlements: 'switch_hide_settlements',
  BtnClearFilters: 'btn_clear_filters',
  DrawerFilters: 'drawer_transaction_filters',

  // Per-kind filter Popover triggers + dropdowns
  BtnFilter: (kind: TransactionFilterKind) => `btn_filter_${kind}` as const,
  PopoverFilter: (kind: TransactionFilterKind) => `popover_filter_${kind}` as const,

  // Filter entries (scoped inside the Popover)
  CheckboxFilterAccount: (accountId: number | string) =>
    `checkbox_filter_account_${accountId}` as const,
  CheckboxFilterCategory: (categoryId: number | string) =>
    `checkbox_filter_category_${categoryId}` as const,
  BadgeFilterTag: (tagId: number | string) => `badge_filter_tag_${tagId}` as const,

  // Selection & bulk menu
  SelectionActionBar: 'selection_action_bar',
  SelectionCount: 'selection_count',
  BtnClearSelection: 'btn_clear_selection',
  BtnBulkActionsMenu: 'btn_bulk_actions_menu',
  BtnBulkCategory: 'btn_bulk_category',
  BtnBulkDate: 'btn_bulk_date',
  BtnBulkDivision: 'btn_bulk_division',
  BtnBulkDelete: 'btn_bulk_delete',
  HintBulkDivisionNoConnection: 'hint_bulk_division_no_connection',

  // Bulk progress drawer (root testid; overridden per flow via testIdPrefix)
  BulkProgressDrawer: 'bulk_progress',
  BulkDeleteDrawer: 'bulk_delete',
  BulkCategoryDrawer: 'bulk_category',
  BulkDateDrawer: 'bulk_date',
  BulkDivisionProgressDrawer: 'bulk_division',
  BulkProgressBar: 'bulk_progress_bar',
  BulkCurrentLabel: 'bulk_current_label',
  BulkSuccess: 'bulk_success',
  BulkError: 'bulk_error',
  BtnBulkDone: 'btn_bulk_done',
  BtnBulkCloseError: 'btn_bulk_close_error',

  // Bulk division drawer
  DrawerBulkDivision: 'drawer_bulk_division',
  BtnApplyBulkDivision: 'btn_apply_bulk_division',

  // Select category / date drawers
  DrawerSelectCategory: 'drawer_select_category',
  DrawerSelectDate: 'drawer_select_date',
  InputBulkDate: 'input_bulk_date',
  BtnApplyDate: 'btn_apply_date',
  CategoryOption: (categoryId: number | string) =>
    `category_option_${categoryId}` as const,

  // Propagation
  PropagationDrawerBody: 'propagation_drawer_body',
  PropagationOption: (opt: PropagationOption) => `propagation_option_${opt}` as const,
  PropagationUpdateOption: (opt: PropagationOption) =>
    `propagation_update_option_${opt}` as const,
} as const
