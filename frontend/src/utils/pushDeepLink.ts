export function deriveDeepLink(data: { type: string; entity_type?: string }): string {
  if (data.type.startsWith("charge")) return "/charges";
  if (data.type.startsWith("split")) return "/transactions";
  if (data.entity_type === "charge") return "/charges";
  if (data.entity_type === "transaction") return "/transactions";
  return "/";
}
