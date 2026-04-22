/**
 * Resolves a dot-separated path against a nested React Hook Form `errors` object
 * (e.g. `rows.0.recurrenceType`) and returns the `.message` string if found.
 *
 * Written against `unknown` so it works with any RHF form context without
 * requiring an `any` escape hatch in the caller.
 */
export function getFieldErrorMessage(errors: unknown, path: string): string | undefined {
  let cur: unknown = errors
  for (const segment of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[segment]
  }
  if (cur && typeof cur === 'object' && 'message' in cur) {
    const msg = (cur as { message?: unknown }).message
    return typeof msg === 'string' ? msg : undefined
  }
  return undefined
}
