import { Box, Button, Group, Modal, Skeleton, Stack, Tabs, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { zodValidator } from '@tanstack/zod-adapter'
import { useMemo, useState } from 'react'
import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { useMe } from '@/hooks/useMe'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useCharges } from '@/hooks/useCharges'
import { useChargesPendingCount } from '@/hooks/useChargesPendingCount'
import { useRejectCharge } from '@/hooks/useRejectCharge'
import { useCancelCharge } from '@/hooks/useCancelCharge'
import { fetchBalance } from '@/api/transactions'
import { QueryKeys } from '@/utils/queryKeys'
import { renderDrawer } from '@/utils/renderDrawer'
import { Charges } from '@/types/charges'
import { ChargeCard } from '@/components/charges/ChargeCard'
import { PeriodNavigator } from '@/components/transactions/PeriodNavigator'
import { CreateChargeDrawer } from '@/components/charges/CreateChargeDrawer'
import { AcceptChargeDrawer } from '@/components/charges/AcceptChargeDrawer'

const now = new Date()

const chargeSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(now.getMonth() + 1),
  year: z.coerce.number().int().default(now.getFullYear()),
})

export const Route = createFileRoute('/_authenticated/charges')({
  validateSearch: zodValidator(chargeSearchSchema),
  component: ChargesPage,
})

function ChargesPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { query: meQuery } = useMe((me) => me.id)
  const currentUserId = meQuery.data
  const { query: chargesQuery, invalidate: invalidateCharges } = useCharges({
    month: search.month,
    year: search.year,
  })
  const { invalidate: invalidatePendingCount } = useChargesPendingCount()
  const { invalidate: invalidateTransactions } = useTransactions({ month: search.month, year: search.year })
  const { query: accountsQuery } = useAccounts()
  const { mutation: rejectMutation } = useRejectCharge()
  const { mutation: cancelMutation } = useCancelCharge()

  // Fetch balance for the current period to pass to ChargeCards
  const balanceQuery = useQuery({
    queryKey: [QueryKeys.Balance, { month: search.month, year: search.year, accumulated: false }],
    queryFn: () => fetchBalance({ month: search.month, year: search.year, accumulated: false }),
  })

  // Extract balance amount in cents from the query result
  const balanceAmount = balanceQuery.data?.balance ?? undefined

  // Confirmation modal state
  const [confirmAction, setConfirmAction] = useState<{ type: 'reject' | 'cancel'; charge: Charges.Charge } | null>(null)

  // Derive partner names from accounts data
  const connectionPartnerMap = useMemo(() => {
    const map = new Map<number, string>()
    if (accountsQuery.data) {
      for (const account of accountsQuery.data) {
        if (account.user_connection && account.user_connection.connection_status === 'accepted') {
          map.set(account.user_connection.id, account.name)
        }
      }
    }
    return map
  }, [accountsQuery.data])

  function getPartnerName(charge: Charges.Charge): string {
    return connectionPartnerMap.get(charge.connection_id) ?? 'Parceiro(a)'
  }

  // Split charges into received and sent
  const receivedCharges = useMemo(() =>
    (chargesQuery.data?.charges ?? []).filter(c => c.payer_user_id === currentUserId),
    [chargesQuery.data, currentUserId]
  )
  const sentCharges = useMemo(() =>
    (chargesQuery.data?.charges ?? []).filter(c => c.charger_user_id === currentUserId),
    [chargesQuery.data, currentUserId]
  )

  // Action handlers
  function handleAccept(charge: Charges.Charge) {
    void renderDrawer(() => (
      <AcceptChargeDrawer charge={charge} partnerName={getPartnerName(charge)} />
    ))
  }

  function handleRejectClick(charge: Charges.Charge) {
    setConfirmAction({ type: 'reject', charge })
  }

  function handleCancelClick(charge: Charges.Charge) {
    setConfirmAction({ type: 'cancel', charge })
  }

  function handleConfirm() {
    if (!confirmAction) return
    const { type, charge } = confirmAction
    const mutate = type === 'reject' ? rejectMutation : cancelMutation
    mutate.mutate(charge.id, {
      onSuccess: () => {
        invalidateCharges()
        invalidatePendingCount()
        invalidateTransactions()
        notifications.show({
          color: 'teal',
          title: type === 'reject' ? 'Cobranca recusada' : 'Cobranca cancelada',
          message: type === 'reject' ? 'Cobranca recusada com sucesso.' : 'Cobranca cancelada com sucesso.',
          autoClose: 3000,
        })
        setConfirmAction(null)
      },
      onError: () => {
        // On error, keep modal open; user can retry or close
      },
    })
  }

  return (
    <Stack gap="md">
      {/* Sticky header */}
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
        <Group justify="space-between" align="center">
          <PeriodNavigator month={search.month} year={search.year} onPeriodChange={(m, y) => navigate({ search: { ...search, month: m, year: y } })} />
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => void renderDrawer(() => (
              <CreateChargeDrawer periodMonth={search.month} periodYear={search.year} />
            ))}
          >
            Nova Cobranca
          </Button>
        </Group>
      </Box>

      {/* Tabs */}
      <Tabs defaultValue="received">
        <Tabs.List>
          <Tabs.Tab value="received">Recebidas</Tabs.Tab>
          <Tabs.Tab value="sent">Enviadas</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="received" pt="md">
          {chargesQuery.isLoading ? (
            <Stack gap="sm">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height={80} radius="md" />
              ))}
            </Stack>
          ) : receivedCharges.length === 0 ? (
            <Stack align="center" gap="sm" py="xl">
              <Text size="lg" fw={700}>Nenhuma cobranca recebida</Text>
              <Text size="sm" c="dimmed">Voce nao tem cobrancas recebidas neste periodo.</Text>
            </Stack>
          ) : (
            <Stack gap="sm">
              {receivedCharges.map(charge => (
                <ChargeCard
                  key={charge.id}
                  charge={charge}
                  currentUserId={currentUserId!}
                  partnerName={getPartnerName(charge)}
                  balanceAmount={balanceAmount}
                  onAccept={() => handleAccept(charge)}
                  onReject={() => handleRejectClick(charge)}
                />
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="sent" pt="md">
          {chargesQuery.isLoading ? (
            <Stack gap="sm">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height={80} radius="md" />
              ))}
            </Stack>
          ) : sentCharges.length === 0 ? (
            <Stack align="center" gap="sm" py="xl">
              <Text size="lg" fw={700}>Nenhuma cobranca enviada</Text>
              <Text size="sm" c="dimmed">Voce nao tem cobrancas enviadas neste periodo.</Text>
            </Stack>
          ) : (
            <Stack gap="sm">
              {sentCharges.map(charge => (
                <ChargeCard
                  key={charge.id}
                  charge={charge}
                  currentUserId={currentUserId!}
                  partnerName={getPartnerName(charge)}
                  balanceAmount={balanceAmount}
                  onCancel={() => handleCancelClick(charge)}
                />
              ))}
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>

      {/* Confirmation Modal for reject/cancel */}
      <Modal
        opened={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'reject' ? 'Recusar cobranca' : 'Cancelar cobranca'}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            {confirmAction?.type === 'reject'
              ? 'Tem certeza que deseja recusar esta cobranca? Esta acao nao pode ser desfeita.'
              : 'Tem certeza que deseja cancelar esta cobranca? Esta acao nao pode ser desfeita.'}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmAction(null)}>
              Voltar
            </Button>
            <Button
              color="red"
              loading={rejectMutation.isPending || cancelMutation.isPending}
              onClick={handleConfirm}
            >
              {confirmAction?.type === 'reject' ? 'Recusar' : 'Cancelar cobranca'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
