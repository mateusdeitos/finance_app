export const AccountsTestIds = {
  Card: 'account_card',
  Form: 'account_form',
  BtnNew: 'btn_new_account',
  BtnEdit: 'btn_account_edit',
  BtnAction: 'btn_account_action',
  BtnSave: 'btn_account_save',
  InputName: 'input_account_name',
  InputInitialBalance: 'input_initial_balance',
  Drawer: 'drawer_account',
  SectionActive: 'section_active',
  SectionInactive: 'section_inactive',
  ColorSwatchPicker: 'color_swatch_picker',
  /** Hex with leading `#` stripped, e.g. `swatch_color_e63946`. */
  SwatchColor: (hexWithoutHash: string) => `swatch_color_${hexWithoutHash}` as const,
} as const
