/**
 * Returns initials from text: first letter of first two space-separated words, uppercase.
 * "Nubank" -> "N", "Cartao Visa" -> "CV", "John Doe Smith" -> "JD"
 */
export function getInitials(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}
