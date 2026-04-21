import { ActionIcon, Box, Button, Group, Modal, Skeleton, Stack, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMe } from "@/hooks/useMe";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useBalance } from "@/hooks/useBalance";
import { useCharges } from "@/hooks/useCharges";
import { useChargesPendingCount } from "@/hooks/useChargesPendingCount";
import { useRejectCharge } from "@/hooks/useRejectCharge";
import { useCancelCharge } from "@/hooks/useCancelCharge";
import { renderDrawer } from "@/utils/renderDrawer";
import { Charges } from "@/types/charges";
import { ChargeCard } from "@/components/charges/ChargeCard";
import { PeriodNavigator } from "@/components/transactions/PeriodNavigator";
import { CreateChargeDrawer } from "@/components/charges/CreateChargeDrawer";
import { AcceptChargeDrawer } from "@/components/charges/AcceptChargeDrawer";

export function ChargesPage() {
  const search = useSearch({ from: "/_authenticated/charges" });
  const navigate = useNavigate({ from: "/charges" });
  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data;

  const params = { month: search.month, year: search.year };
  const { query: chargesQuery, invalidate: invalidateCharges } = useCharges(params);
  const { query: receivedQuery } = useCharges(params, (data) =>
    data.charges.filter((c) => c.payer_user_id === currentUserId),
  );
  const { query: sentQuery } = useCharges(params, (data) =>
    data.charges.filter((c) => c.charger_user_id === currentUserId),
  );

  const { invalidate: invalidatePendingCount } = useChargesPendingCount();
  const { invalidate: invalidateTransactions } = useTransactions(params);

  const { query: partnerNameMapQuery } = useAccounts((accounts) => {
    const map = new Map<number, string>();
    for (const account of accounts) {
      if (account.user_connection && account.user_connection.connection_status === "accepted") {
        map.set(account.user_connection.id, account.name);
      }
    }
    return map;
  });

  const { query: balanceQuery } = useBalance(
    { month: search.month, year: search.year, accumulated: false },
    (data) => data.balance,
  );
  const balanceAmount = balanceQuery.data ?? undefined;

  const { mutation: rejectMutation } = useRejectCharge();
  const { mutation: cancelMutation } = useCancelCharge();

  // TODO(migration Phase 5): convert to renderDrawer with discriminated result
  const [confirmAction, setConfirmAction] = useState<
    { type: "reject" | "cancel"; charge: Charges.Charge } | null
  >(null);

  function getPartnerName(charge: Charges.Charge): string {
    return partnerNameMapQuery.data?.get(charge.connection_id) ?? "Parceiro(a)";
  }

  function handleAccept(charge: Charges.Charge) {
    void renderDrawer(() => <AcceptChargeDrawer charge={charge} partnerName={getPartnerName(charge)} />);
  }

  function handleRejectClick(charge: Charges.Charge) {
    setConfirmAction({ type: "reject", charge });
  }

  function handleCancelClick(charge: Charges.Charge) {
    setConfirmAction({ type: "cancel", charge });
  }

  function handleConfirm() {
    if (!confirmAction) return;
    const { type, charge } = confirmAction;
    const mutate = type === "reject" ? rejectMutation : cancelMutation;
    mutate.mutate(charge.id, {
      onSuccess: () => {
        invalidateCharges();
        invalidatePendingCount();
        invalidateTransactions();
        notifications.show({
          color: "teal",
          title: type === "reject" ? "Cobrança recusada" : "Cobrança cancelada",
          message: type === "reject" ? "Cobrança recusada com sucesso." : "Cobrança cancelada com sucesso.",
          autoClose: 3000,
        });
        setConfirmAction(null);
      },
    });
  }

  const receivedCharges = receivedQuery.data ?? [];
  const sentCharges = sentQuery.data ?? [];

  return (
    <Stack gap="md">
      <Box
        style={{
          position: "sticky",
          top: "calc(-1 * var(--mantine-spacing-md))",
          zIndex: 10,
          background: "var(--mantine-color-body)",
          marginTop: "calc(-1 * var(--mantine-spacing-md))",
          paddingTop: "var(--mantine-spacing-md)",
          paddingBottom: "var(--mantine-spacing-xs)",
        }}
      >
        <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
          <PeriodNavigator
            month={search.month}
            year={search.year}
            onPeriodChange={(m, y) => navigate({ search: { ...search, month: m, year: y } })}
          />
          <Button
            visibleFrom="xs"
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              void renderDrawer(() => <CreateChargeDrawer periodMonth={search.month} periodYear={search.year} />)
            }
          >
            Nova Cobrança
          </Button>
          <ActionIcon
            hiddenFrom="xs"
            size="lg"
            variant="filled"
            aria-label="Nova Cobrança"
            onClick={() =>
              void renderDrawer(() => <CreateChargeDrawer periodMonth={search.month} periodYear={search.year} />)
            }
          >
            <IconPlus size={18} />
          </ActionIcon>
        </Group>
      </Box>

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
              <Text size="lg" fw={700}>
                Nenhuma cobrança recebida
              </Text>
              <Text size="sm" c="dimmed">
                Voce nao tem cobrancas recebidas neste periodo.
              </Text>
            </Stack>
          ) : (
            <Stack gap="sm">
              {receivedCharges.map((charge) => (
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
              <Text size="lg" fw={700}>
                Nenhuma cobrança enviada
              </Text>
              <Text size="sm" c="dimmed">
                Voce nao tem cobrancas enviadas neste periodo.
              </Text>
            </Stack>
          ) : (
            <Stack gap="sm">
              {sentCharges.map((charge) => (
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

      <Modal
        opened={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === "reject" ? "Recusar cobrança" : "Cancelar cobrança"}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            {confirmAction?.type === "reject"
              ? "Tem certeza que deseja recusar esta cobrança? Esta acao nao pode ser desfeita."
              : "Tem certeza que deseja cancelar esta cobrança? Esta acao nao pode ser desfeita."}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmAction(null)}>
              Voltar
            </Button>
            <Button color="red" loading={rejectMutation.isPending || cancelMutation.isPending} onClick={handleConfirm}>
              {confirmAction?.type === "reject" ? "Recusar" : "Cancelar cobrança"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
