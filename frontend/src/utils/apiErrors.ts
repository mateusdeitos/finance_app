export interface ApiErrorResponse {
  error: string
  message: string
  tags: string[]
}

export async function parseApiError(res: Response): Promise<ApiErrorResponse> {
  try {
    const body = await res.json()
    return {
      error: body.error ?? res.statusText,
      message: body.message ?? '',
      tags: Array.isArray(body.tags) ? body.tags : [],
    }
  } catch {
    return { error: res.statusText, message: '', tags: [] }
  }
}

// Maps a backend ErrorTag to a form field path.
// Indexed split-setting errors carry both a domain tag and an INDEX_N tag;
// the index is extracted and used to build a path like "split_settings.0.amount".
export function mapTagsToFieldErrors(
  tags: string[],
  message: string,
): Record<string, string> {
  const errors: Record<string, string> = {}

  // Extract index from INDEX_N tags (backend uses lowercase "index_N")
  const indexTag = tags.find((t) => /^index_\d+$/i.test(t))
  const index = indexTag ? parseInt(indexTag.replace(/^index_/i, ''), 10) : null

  // Simple tag → field map
  const tagToField: Record<string, string> = {
    'TRANSACTION.DATE_IS_REQUIRED': 'date',
    'TRANSACTION.DESCRIPTION_IS_REQUIRED': 'description',
    'TRANSACTION.AMOUNT_MUST_BE_GREATER_THAN_ZERO': 'amount',
    'TRANSACTION.INVALID_TRANSACTION_TYPE': 'type',
    'TRANSACTION.INVALID_ACCOUNT_ID': 'account_id',
    'TRANSACTION.INVALID_CATEGORY_ID': 'category_id',
    'TRANSACTION.MISSING_DESTINATION_ACCOUNT': 'destination_account_id',
    'TRANSACTION.SPLIT_SETTINGS_NOT_ALLOWED_FOR_TRANSFER': 'split_settings',
    'TRANSACTION.SPLIT_ALLOWED_ONLY_FOR_EXPENSE': 'split_settings',
    'TRANSACTION.INVALID_RECURRENCE_TYPE': 'recurrence_settings.type',
    'TRANSACTION.RECURRENCE_END_DATE_OR_REPETITIONS_IS_REQUIRED': 'recurrence_settings',
    'TRANSACTION.RECURRENCE_END_DATE_MUST_BE_AFTER_TRANSACTION_DATE': 'recurrence_settings.end_date',
    'TRANSACTION.RECURRENCE_END_DATE_AND_REPETITIONS_CANNOT_BE_USED_TOGETHER': 'recurrence_settings',
    'TRANSACTION.RECURRENCE_REPETITIONS_MUST_BE_POSITIVE': 'recurrence_settings.repetitions',
    'TRANSACTION.RECURRENCE_REPETITIONS_MUST_BE_LESS_THAN_OR_EQUAL_TO': 'recurrence_settings.repetitions',
    'TAG.NAME_CANNOT_BE_EMPTY': 'tags',
    'TAG.FAILED_TO_CREATE': 'tags',
    'CHARGE.INVALID_CONNECTION_ID': 'connection_id',
    'CHARGE.CONNECTION_NOT_ACCEPTED': 'connection_id',
    'CHARGE.INVALID_ACCOUNT_ID': 'my_account_id',
    'CHARGE.INVALID_PAYER': '_general',
    'CHARGE.CHARGE_NOT_PENDING': '_general',
    'CHARGE.AMOUNT_MUST_BE_POSITIVE': 'amount',
  }

  // Indexed split-setting tags (require INDEX_N to resolve field path)
  const indexedTagToSubfield: Record<string, string> = {
    'TRANSACTION.SPLIT_SETTING_INVALID_CONNECTION_ID': 'connection_id',
    'TRANSACTION.SPLIT_SETTING_PERCENTAGE_OR_AMOUNT_IS_REQUIRED': '',
    'TRANSACTION.SPLIT_SETTING_PERCENTAGE_AND_AMOUNT_CANNOT_BE_USED_TOGETHER': '',
    'TRANSACTION.SPLIT_SETTING_PERCENTAGE_MUST_BE_BETWEEN_1_AND_100': 'percentage',
    'TRANSACTION.SPLIT_SETTING_AMOUNT_MUST_BE_GREATER_THAN_ZERO': 'amount',
    'TRANSACTION.SPLIT_SETTING_INVALID_DESTINATION_ACCOUNT_ID': 'destination_account_id',
  }

  let mapped = false

  for (const tag of tags) {
    if (tag in tagToField) {
      const field = tagToField[tag]
      errors[field] = errors[field] ?? message
      mapped = true
    } else if (tag in indexedTagToSubfield && index !== null) {
      const subfield = indexedTagToSubfield[tag]
      const field = subfield ? `split_settings.${index}.${subfield}` : `split_settings.${index}`
      errors[field] = errors[field] ?? message
      mapped = true
    } else if (/^index_\d+$/i.test(tag)) {
      // INDEX_N is a helper tag, not a standalone error
      continue
    }
  }

  if (!mapped) {
    errors['_general'] = message
  }

  return errors
}
