import { Transactions } from "@/types/transactions";
import { useAccounts } from "../useAccounts";

export function useSplitSummary(settings?: Transactions.SplitSetting[], omitValues = false) {
  const { query } = useAccounts((accounts) =>
    accounts.filter((a) => a.user_connection?.connection_status === "accepted"),
  );

  if (!settings?.length) return "Sem divisão";
  if (settings.length > 1) {
    return `${settings.length} divisões`;
  }

  const s = settings[0];

  const acct = query.data?.find((a) => a.user_connection?.id === s.connection_id);
  if (!acct) return "";
  const label = acct?.name ?? `#${s.connection_id}`;
  if (omitValues) {
    return label;
  }
  if (s.percentage != null) return `${s.percentage}% — ${label}`;
  if (s.amount != null) return `R$${(s.amount / 100).toFixed(2)} — ${label}`;
  return label;
}
