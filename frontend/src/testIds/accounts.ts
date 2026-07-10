export const AccountsTestIds = {
  Card: 'account_card',
  Form: 'account_form',
  BtnNew: 'btn_new_account',
  BtnEdit: 'btn_account_edit',
  /** @deprecated split into BtnDeactivate / BtnActivate / BtnDelete */
  BtnAction: 'btn_account_action',
  BtnDeactivate: 'btn_account_deactivate',
  BtnActivate: 'btn_account_activate',
  BtnDelete: 'btn_account_delete',
  BtnMoveUp: 'btn_account_move_up',
  BtnMoveDown: 'btn_account_move_down',
  BtnSave: 'btn_account_save',
  // Delete flow (drawer shown when the account has linked transactions)
  DeleteDrawer: 'drawer_delete_account',
  DeleteTransactionCount: 'text_delete_transaction_count',
  SegmentDeleteStrategy: 'segmented_delete_strategy',
  /** strategy ∈ 'delete_transactions' | 'migrate' */
  SegmentDeleteStrategyOption: (strategy: string) => `segment_delete_strategy_${strategy}` as const,
  SelectMigrateTarget: 'select_migrate_target',
  OptionMigrateTarget: (id: number) => `option_migrate_target_${id}` as const,
  BtnConfirmDelete: 'btn_confirm_delete_account',
  AlertDeleteError: 'alert_delete_account_error',
  InputName: 'input_account_name',
  InputInitialBalance: 'input_initial_balance',
  Drawer: 'drawer_account',
  SectionActive: 'section_active',
  SectionInactive: 'section_inactive',
  ColorSwatchPicker: 'color_swatch_picker',
  /** Hex with leading `#` stripped, e.g. `swatch_color_e63946`. */
  SwatchColor: (hexWithoutHash: string) => `swatch_color_${hexWithoutHash}` as const,
} as const
