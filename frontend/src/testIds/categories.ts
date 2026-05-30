export const CategoriesTestIds = {
  BtnNew: 'btn_new_category',
  BtnCreateFirst: 'btn_create_first_category',
  BtnName: 'btn_category_name',
  BtnDelete: 'btn_category_delete',
  BtnAddSubcategory: 'btn_add_subcategory',
  BtnConfirmDelete: 'btn_confirm_delete_category',
  InputName: 'input_category_name',
  InputNewName: 'input_new_category_name',
  BtnEmoji: (categoryId: number | string) => `btn_emoji_${categoryId}` as const,
  DrawerEmojiPicker: (categoryId: number | string) =>
    `drawer_emoji_picker_${categoryId}` as const,
  EmojiOption: (emoji: string) => `emoji_${emoji}` as const,
  // ── Spending distribution view ──────────────────────────────────────────
  DistributionPanel: 'section_category_distribution',
  Card: (categoryId: number | string) => `category_card_${categoryId}` as const,
  BtnToggle: (categoryId: number | string) => `btn_toggle_category_${categoryId}` as const,
} as const
