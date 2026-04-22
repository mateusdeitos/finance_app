import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBalance } from "@/api/transactions";
import { QueryKeys } from "@/utils/queryKeys";
import { Transactions } from "@/types/transactions";
import { useAccounts } from "@/hooks/useAccounts";

interface UseBalanceForConnectionParams {
  month: number;
  year: number;
  connectionId: number | undefined;
  currentUserId: number;
}

export function useBalanceForConnection<T = Transactions.BalanceResult>(
  { month, year, connectionId, currentUserId }: UseBalanceForConnectionParams,
  select?: (data: Transactions.BalanceResult) => T,
) {
  const queryClient = useQueryClient();

  const {
    query: { data: accountId },
  } = useAccounts((accounts) => {
    const account = accounts.find((a) => a.user_connection?.id === connectionId);
    if (!account?.user_connection) return null;
    return account.user_connection.from_user_id === currentUserId
      ? account.user_connection.from_account_id
      : account.user_connection.to_account_id;
  });

  const query = useQuery({
    queryKey: [QueryKeys.Balance, { month, year, accumulated: false, connection_id: connectionId }],
    queryFn: () => fetchBalance({ month, year, accumulated: false, accountIds: [accountId!] }),
    enabled: !!connectionId && !!month && !!year && accountId != null,
    select,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.Balance] });

  return { query, invalidate };
}
