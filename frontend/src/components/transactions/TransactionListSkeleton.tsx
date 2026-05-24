import { Group, Skeleton, Stack } from '@mantine/core'
import { useIsMobile } from '@/hooks/useIsMobile'
import classes from './TransactionListSkeleton.module.css'

const ROWS_PER_GROUP = 4
const GROUPS = 3

/**
 * Loading placeholder for TransactionList. Mirrors the production row's grid
 * (checkbox slot, leading avatar on mobile, two-line description + meta,
 * amount block on the right) so layout doesn't shift when real data swaps in.
 */
export function TransactionListSkeleton() {
  const isMobile = useIsMobile()

  return (
    <Stack gap="md" data-testid="transaction_list_skeleton">
      {Array.from({ length: GROUPS }).map((_, gi) => (
        <Stack key={gi} gap={0}>
          <Group justify="space-between" align="baseline" className={classes.header} wrap="nowrap">
            <Skeleton height={11} width={140} radius="sm" />
            <Skeleton height={11} width={90} radius="sm" />
          </Group>
          {Array.from({ length: ROWS_PER_GROUP }).map((__, ri) => (
            <div key={ri} className={classes.row}>
              <Skeleton circle height={16} width={16} />
              {isMobile && <Skeleton circle height={26} width={26} />}
              <div className={classes.main}>
                <Skeleton height={14} width="78%" radius="sm" />
                <Skeleton height={11} width="42%" radius="sm" mt={6} />
              </div>
              <Skeleton height={14} width={isMobile ? 64 : 80} radius="sm" />
            </div>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
