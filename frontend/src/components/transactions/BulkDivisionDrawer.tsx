import { useForm, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, Drawer, Stack, Text } from "@mantine/core";
import { useDrawerContext } from "@/utils/renderDrawer";
import { Transactions } from "@/types/transactions";
import { useMe } from "@/hooks/useMe";
import { useAccounts } from "@/hooks/useAccounts";
import { SplitSettingsFields } from "./form/SplitSettingsFields";
import { TransactionsTestIds } from "@/testIds";

// ─── Schema ──────────────────────────────────────────────────────────────────
// Percentage-only shape. No `amount` field in the form state, by design (D-02).
// The `totalAmount > 0` guard inside SplitSettingsFields hides the per-row cent
// preview automatically when the parent form has no `amount`.
const bulkDivisionSchema = z.object({
  split_settings: z
    .array(
      z.object({
        connection_id: z.number().int().min(1, "Selecione uma conta"),
        percentage: z.number().int().min(1).max(100),
      }),
    )
    .min(1, "Adicione ao menos uma divisão")
    .refine(
      (rows) => rows.reduce((sum, r) => sum + (r.percentage ?? 0), 0) <= 100,
      { message: "A soma das porcentagens deve ser menor ou igual a 100%" },
    ),
});

type BulkDivisionFormValues = z.infer<typeof bulkDivisionSchema>;

// Drawer shell styles — mirror SelectDateDrawer.tsx exactly (D-09).
const drawerStyles = {
  content: {
    borderRadius: "var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0",
    height: "auto",
    maxHeight: "80dvh",
  },
  body: { paddingBottom: "var(--mantine-spacing-xl)" },
} as const;

// ─── BulkDivisionDrawer ──────────────────────────────────────────────────────

export function BulkDivisionDrawer() {
  const { opened, close, reject } = useDrawerContext<Transactions.SplitSetting[]>();

  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data ?? 0;

  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const connectedAccounts = accounts.filter(
    (a) => a.user_connection && a.user_connection.connection_status === "accepted",
  );

  // Loading guard: while me/accounts are still loading, render a minimal
  // loading body and do NOT mount the form — otherwise `useForm` would
  // initialize with stale defaults (currentUserId=0, connectedAccounts=[]).
  if (meQuery.isLoading || accountsQuery.isLoading) {
    return (
      <Drawer
        opened={opened}
        onClose={reject}
        position="bottom"
        title="Alterar divisão"
        data-testid={TransactionsTestIds.DrawerBulkDivision}
        styles={drawerStyles}
      >
        <Text c="dimmed">Carregando...</Text>
      </Drawer>
    );
  }

  // Pre-selection (D-06, D-07, UI-03, UI-04):
  // - 1 connected account → seed with connection's stored default_split_percentage.
  // - 2+ connected accounts → empty row ({ connection_id: 0, percentage: 0 }).
  // The isFrom / default-percentage lookup mirrors SplitSettingsFields.tsx:62-64.
  const defaultSplitRow: Transactions.SplitSetting = (() => {
    if (connectedAccounts.length === 1) {
      const only = connectedAccounts[0];
      const conn = only.user_connection!;
      const isFrom = conn.from_user_id === currentUserId;
      const defaultPct = isFrom ? conn.from_default_split_percentage : conn.to_default_split_percentage;
      return { connection_id: conn.id, percentage: defaultPct };
    }
    return { connection_id: 0, percentage: 0 };
  })();

  return (
    <BulkDivisionDrawerForm
      opened={opened}
      close={close}
      reject={reject}
      hasConnectedAccounts={connectedAccounts.length > 0}
      defaultSplitRow={defaultSplitRow}
    />
  );
}

// ─── Inner form component ────────────────────────────────────────────────────
// Extracted so the form is only mounted AFTER the loading guard resolves,
// guaranteeing `useForm` never runs with stale defaults.
interface BulkDivisionDrawerFormProps {
  opened: boolean;
  close: (value: Transactions.SplitSetting[]) => void;
  reject: (error?: unknown) => void;
  hasConnectedAccounts: boolean;
  defaultSplitRow: Transactions.SplitSetting;
}

function BulkDivisionDrawerForm({
  opened,
  close,
  reject,
  hasConnectedAccounts,
  defaultSplitRow,
}: BulkDivisionDrawerFormProps) {
  const methods = useForm<BulkDivisionFormValues>({
    resolver: zodResolver(bulkDivisionSchema),
    defaultValues: {
      split_settings: [
        {
          connection_id: defaultSplitRow.connection_id,
          percentage: defaultSplitRow.percentage ?? 0,
        },
      ],
    },
    mode: "onChange",
  });

  // Live sum for submit gating — valid when ≤ 100%.
  const rows = useWatch({
    control: methods.control,
    name: "split_settings",
  }) as BulkDivisionFormValues["split_settings"] | undefined;
  const sum = (rows ?? []).reduce((acc, r) => acc + (Number(r?.percentage) || 0), 0);
  const isSumValid = sum <= 100;

  // Submit: return raw SplitSetting[] (D-10). Phase 14 handles cents conversion.
  const onSubmit = methods.handleSubmit((values) => {
    const result: Transactions.SplitSetting[] = values.split_settings.map((r) => ({
      connection_id: r.connection_id,
      percentage: r.percentage,
    }));
    close(result);
  });

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      position="bottom"
      title="Alterar divisão"
      data-testid={TransactionsTestIds.DrawerBulkDivision}
      styles={drawerStyles}
    >
      {!hasConnectedAccounts ? (
        <Alert color="yellow" variant="light">
          Você precisa de uma conta conectada para usar a ação de divisão.
        </Alert>
      ) : (
        <FormProvider {...methods}>
          <form onSubmit={onSubmit}>
            <Stack gap="md">
              <SplitSettingsFields onlyPercentage={true} />
              <Button
                type="submit"
                disabled={!isSumValid}
                style={{ alignSelf: "flex-start" }}
                data-testid={TransactionsTestIds.BtnApplyBulkDivision}
              >
                Aplicar
              </Button>
            </Stack>
          </form>
        </FormProvider>
      )}
    </Drawer>
  );
}
