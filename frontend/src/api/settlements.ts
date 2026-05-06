import { Transactions } from "@/types/transactions";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

/** Converts a YYYY-MM-DD string to an RFC3339 string at local midnight, preserving the calendar date. */
function localMidnightISO(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day, 0, 0, 0);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, "0");
  const mm = String(absMin % 60).padStart(2, "0");
  return `${dateStr}T00:00:00${sign}${hh}:${mm}`;
}

export async function updateSettlement(
  id: number,
  payload: Transactions.UpdateSettlementPayload,
): Promise<void> {
  const url = new URL(`${apiUrl}/api/settlements/${id}`, window.location.origin);
  const body = {
    ...payload,
    date: payload.date && payload.date.length === 10 ? localMidnightISO(payload.date) : payload.date,
  };
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw res;
}
