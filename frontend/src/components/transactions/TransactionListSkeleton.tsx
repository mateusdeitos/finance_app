import { Skeleton, Stack } from '@mantine/core'
import { useIsMobile } from '@/hooks/useIsMobile'
import classes from './TransactionListSkeleton.module.css'

const ROWS_PER_GROUP = 4
const GROUPS = 3

/**
 * Loading placeholder for TransactionList. Rows match the production
 * TransactionRow heights to avoid CLS when real data swaps in.
 */
export function TransactionListSkeleton() {
  const isMobile = useIsMobile()

  return (
    <Stack gap="md" data-testid="transaction_list_skeleton">
      {Array.from({ length: GROUPS }).map((_, gi) => (
        <Stack key={gi} gap={0}>
          <Skeleton height={20} width="40%" radius="sm" mb={8} />
          {Array.from({ length: ROWS_PER_GROUP }).map((__, ri) => (
            <div key={ri} className={classes.row}>
              <Skeleton circle height={isMobile ? 16 : 18} />
              <div className={classes.main}>
                <Skeleton height={14} width="80%" radius="sm" />
                <Skeleton height={11} width="40%" radius="sm" mt={6} />
              </div>
              <Skeleton height={14} width={isMobile ? 56 : 80} radius="sm" />
            </div>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
