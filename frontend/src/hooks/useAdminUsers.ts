import { useQuery, useQueryClient } from '@tanstack/react-query'
import { searchAdminUsers, type AdminUser } from '@/api/admin'
import { QueryKeys } from '@/utils/queryKeys'

/**
 * Searches users for the impersonation picker. Admin-only endpoint; enabled only
 * when the drawer is open to avoid firing for non-admins.
 */
export function useAdminUsers<T = AdminUser[]>(
  query: string,
  options?: { enabled?: boolean; select?: (data: AdminUser[]) => T },
) {
  const queryClient = useQueryClient()
  const result = useQuery({
    queryKey: [QueryKeys.AdminUsers, query],
    queryFn: () => searchAdminUsers(query),
    enabled: options?.enabled ?? true,
    select: options?.select,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.AdminUsers] })
  return { query: result, invalidate }
}
