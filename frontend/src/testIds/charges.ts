export type ChargeAction = 'reject' | 'cancel'
export type ChargeRole = 'charger' | 'payer'
export type ChargesTab = 'received' | 'sent'

export const ChargesTestIds = {
  ModalConfirm: (action: ChargeAction) => `modal_confirm_${action}_charge` as const,
  BtnConfirm: (action: ChargeAction) => `btn_confirm_${action}_charge` as const,
  BtnNew: 'btn_new_charge',
  DrawerCreate: 'drawer_create_charge',
  DrawerAccept: 'drawer_accept_charge',
  Tab: (tab: ChargesTab) => `tab_charges_${tab}` as const,
  Card: (chargeId: number | string) => `charge_card_${chargeId}` as const,
  BtnAccept: 'btn_accept_charge',
  BtnReject: 'btn_reject_charge',
  BtnCancel: 'btn_cancel_charge',
  SelectConnection: 'select_connection',
  SelectMyAccount: 'select_my_account',
  RadioRole: (role: ChargeRole) => `radio_role_${role}` as const,
  InputAmount: 'input_charge_amount',
  InputDescription: 'input_charge_description',
  BtnSubmitCreate: 'btn_submit_create_charge',
  SelectAcceptAccount: 'select_accept_account',
  BtnSubmitAccept: 'btn_submit_accept_charge',

  // Select options (renderOption testids — pass the entity id)
  OptionConnection: (connectionId: number | string) =>
    `option_connection_${connectionId}` as const,
  OptionMyAccount: (accountId: number | string) => `option_my_account_${accountId}` as const,
  OptionAcceptAccount: (accountId: number | string) =>
    `option_accept_account_${accountId}` as const,
} as const
