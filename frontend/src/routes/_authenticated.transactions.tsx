import { ActionIcon, Box, Drawer, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconFilter } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { useMe } from '@/hooks/useMe'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ClearFiltersButton } from '@/components/transactions/ClearFiltersButton'
import { MobileBottomBar } from '@/components/transactions/MobileBottomBar'
import { PeriodNavigator } from '@/components/transactions/PeriodNavigator'
import { TransactionFilters } from '@/components/transactions/TransactionFilters'
import { TransactionList } from '@/components/transactions/TransactionList'
import { TextSearch } from '@/components/transactions/filters/TextSearch'

const now = new Date()

const transactionSearchSchema = z.object({
  month: z.number().int().min(1).max(12).default(now.getMonth() + 1),
  year: z.number().int().default(now.getFullYear()),
  query: z.string().default(''),
  tagIds: z.array(z.number()).default([]),
  categoryIds: z.array(z.number()).default([]),
  accountIds: z.array(z.number()).default([]),
  types: z.array(z.enum(['expense', 'income', 'transfer'])).default([]),
  groupBy: z.enum(['date', 'category', 'account']).default('date'),
  accumulated: z.coerce.boolean().default(false),
})

export const Route = createFileRoute('/_authenticated/transactions')({
  validateSearch: zodValidator(transactionSearchSchema),
  component: TransactionsPage,
})

function TransactionsPage() {
  const search = Route.useSearch()
  const isMobile = useIsMobile()
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false)

  const { query: meQuery } = useMe()
  const currentUserId = meQuery.data?.id ?? 0

  if (isMobile) {
    return (
      <Stack gap="sm" pb="5rem">
        <Box
          style={{
            position: 'sticky',
            top: 'calc(-1 * var(--mantine-spacing-md))',
            zIndex: 10,
            background: 'var(--mantine-color-body)',
            marginTop: 'calc(-1 * var(--mantine-spacing-md))',
            paddingTop: 'var(--mantine-spacing-md)',
            paddingBottom: 'var(--mantine-spacing-xs)',
          }}
        >
          <Stack gap="xs">
            <PeriodNavigator month={search.month} year={search.year} />
            <TextSearch />
          </Stack>
        </Box>

        <TransactionList currentUserId={currentUserId} />

        <MobileBottomBar>
          <ClearFiltersButton variant="icon" />
          <ActionIcon
            size="xl"
            radius="xl"
            variant="filled"
            onClick={openDrawer}
            aria-label="Abrir filtros"
          >
            <IconFilter size={20} />
          </ActionIcon>
        </MobileBottomBar>

        <Drawer
          opened={drawerOpened}
          onClose={closeDrawer}
          position="bottom"
          title="Filtros"
          size="auto"
          styles={{
            content: { borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0', maxHeight: '75dvh', overflowY: 'auto' },
          }}
        >
          <TransactionFilters orientation="column" hideTextSearch />
        </Drawer>
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <Box
        style={{
          position: 'sticky',
          top: 'calc(-1 * var(--mantine-spacing-md))',
          zIndex: 10,
          background: 'var(--mantine-color-body)',
          marginTop: 'calc(-1 * var(--mantine-spacing-md))',
          paddingTop: 'var(--mantine-spacing-md)',
          paddingBottom: 'var(--mantine-spacing-xs)',
        }}
      >
        <Stack gap="sm">
          <PeriodNavigator month={search.month} year={search.year} />
          <TransactionFilters orientation="row" />
        </Stack>
      </Box>
      <TransactionList currentUserId={currentUserId} />
    </Stack>
  )
}
