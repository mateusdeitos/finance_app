import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Code,
  FileInput,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Flex,
} from "@mantine/core";
import { IconAlertCircle, IconArrowLeft, IconCircleCheck, IconFileTypeCsv } from "@tabler/icons-react";
import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import { useForm, useFieldArray, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTransaction } from "@/api/transactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useParseImportCSV } from "@/hooks/useParseImportCSV";
import { Transactions } from "@/types/transactions";
import { parseApiError } from "@/utils/apiErrors";
import { ImportReviewRow } from "@/components/transactions/import/ImportReviewRow";
import { ImportCSVBulkToolbar } from "@/components/transactions/import/ImportCSVBulkToolbar";
import { ImportConfirmButton } from "@/components/transactions/import/ImportConfirmButton";
import {
  importFormSchema,
  type ImportFormValues,
  type ImportRowFormValues,
} from "@/components/transactions/form/importFormSchema";
import { useQueryClient } from "@tanstack/react-query";
import { QueryKeys } from "@/utils/queryKeys";

export const Route = createFileRoute("/_authenticated/transactions_/import")({
  component: ImportReviewPage,
});

// ─── CSV column reference ──────────────────────────────────────────────────────

const CSV_COLUMNS = [
  { col: "Data", required: true, description: "Formato DD/MM/AAAA" },
  { col: "Descrição", required: true, description: "Texto livre" },
  {
    col: "Valor",
    required: true,
    description: "Valor da transação, se negativo será considerada uma despesa, se positivo uma receita",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPayload(row: ImportRowFormValues): Transactions.CreateTransactionPayload {
  const payload: Transactions.CreateTransactionPayload = {
    transaction_type: row.transaction_type,
    account_id: row.account_id ?? undefined,
    amount: row.amount,
    date: row.date,
    description: row.description,
  };
  if (row.category_id) payload.category_id = row.category_id;
  if (row.transaction_type === "transfer" && row.destination_account_id) {
    payload.destination_account_id = row.destination_account_id;
  }
  if (
    row.recurrenceEnabled &&
    row.recurrenceType &&
    row.recurrenceCurrentInstallment != null &&
    row.recurrenceTotalInstallments != null
  ) {
    payload.recurrence_settings = {
      type: row.recurrenceType,
      current_installment: row.recurrenceCurrentInstallment,
      total_installments: row.recurrenceTotalInstallments,
    };
  }
  if (row.split_settings?.length) {
    payload.split_settings = row.split_settings;
  }
  return payload;
}

function parsedRowToFormValues(r: Transactions.ParsedImportRow, accountId: number): ImportRowFormValues {
  return {
    row_index: r.row_index,
    original_description: r.description,
    status: r.status,
    parse_errors: r.parse_errors ?? [],
    action: r.status === "duplicate" ? "duplicate" : "import",
    import_status: "idle",
    import_error: "",
    account_id: accountId,
    date: r.date ?? "",
    description: r.description,
    amount: r.amount,
    transaction_type: r.type,
    category_id: r.category_id ?? null,
    destination_account_id: r.destination_account_id ?? null,
    recurrenceEnabled: !!r.recurrence_type,
    recurrenceType: r.recurrence_type ?? null,
    recurrenceCurrentInstallment: null,
    recurrenceTotalInstallments: r.recurrence_count ?? null,
    split_settings: [],
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ImportReviewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importState, setImportState] = useState({
    importing: false,
    paused: false,
  });
  const pauseRef = useRef(false);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { accountId: 0, rows: [] },
  });

  const { totalSuccess, total } = useWatch({
    control: form.control,
    name: "rows",
    compute: (rows) => ({
      totalSuccess: rows.filter((r) => r.action === "import" && r.import_status === "success").length,
      total: rows.filter((r) => r.action === "import").length,
    }),
  });

  const { fields, remove } = useFieldArray({
    control: form.control,
    name: "rows",
  });

  const queryClient = useQueryClient();

  const invalidateTransactions = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] });

  const rows = useWatch({ control: form.control, name: "rows" });

  const importing = importState.importing;
  const paused = importState.paused;

  const {
    status: blockerStatus,
    proceed,
    reset: resetBlocker,
  } = useBlocker({
    blockerFn: () => true,
    condition: importing,
  });

  const blockMessage = importing
    ? "A importação está em andamento. Ao sair ela será pausada e os dados serão perdidos. Deseja continuar?"
    : "Você tem transações não importadas. Os dados serão perdidos ao sair. Deseja continuar?";

  // ─── Selection helpers ──────────────────────────────────────────────────────

  const handleToggleSelect = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleSelectAll = () => setSelected(new Set(rows.map((_, i) => i)));
  const handleClearSelection = () => setSelected(new Set());

  // ─── Bulk actions ───────────────────────────────────────────────────────────

  const handleBulkSetAction = (action: Transactions.ImportRowAction) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.action`, action);
    });
    setSelected(new Set());
  };

  const handleBulkSetDate = (date: string) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.date`, date);
    });
    setSelected(new Set());
  };

  const handleBulkSetCategory = (categoryId: number) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.category_id`, categoryId);
    });
    setSelected(new Set());
  };

  const handleBulkSetTransactionType = (type: Transactions.TransactionType) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.transaction_type`, type);
    });
    setSelected(new Set());
  };

  const handleSetDescription = (description: string) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.description`, description);
    });
    setSelected(new Set());
  };

  const handleRemoveSelected = () => {
    const sorted = [...selected].sort((a, b) => b - a);
    sorted.forEach((i) => remove(i));
    setSelected(new Set());
  };

  // ─── Import loop ────────────────────────────────────────────────────────────

  const handlePause = () => {
    pauseRef.current = true;
  };

  const start = () => setImportState((p) => ({ ...p, importing: true, paused: false }));

  const pause = () => setImportState((p) => ({ ...p, importing: false, paused: true }));

  const finish = () => setImportState((p) => ({ ...p, importing: false, paused: false }));

  const toImportRows = rows.filter((r) => r.action === "import");
  const errorCount = toImportRows.filter((r) => r.import_status === "error").length;
  const isDone = !importing && !paused && totalSuccess + errorCount > 0;
  const allImportedSuccess = isDone && total > 0 && totalSuccess === total;

  useEffect(() => {
    if (!allImportedSuccess) return;
    const timer = setTimeout(() => void navigate({ to: "/transactions" }), 3000);
    return () => clearTimeout(timer);
  }, [allImportedSuccess, navigate]);

  async function handleConfirm() {
    const isValid = await form.trigger("rows");
    if (!isValid) {
      const rowErrors = form.formState.errors.rows as (object | undefined)[] | undefined;
      if (rowErrors) {
        const firstErrorIndex = rowErrors.findIndex((e) => e !== undefined);
        if (firstErrorIndex >= 0) {
          rowRefs.current.get(firstErrorIndex)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      return;
    }

    const currentRows = form.getValues("rows");
    pauseRef.current = false;
    start();

    for (let i = 0; i < currentRows.length; i++) {
      if (pauseRef.current) break;

      const row = form.getValues(`rows.${i}`);
      if (row.action !== "import" || row.import_status === "success") continue;

      form.setValue(`rows.${i}.import_status`, "loading");

      try {
        await createTransaction(buildPayload(row));
        form.setValue(`rows.${i}.import_status`, "success");
      } catch (err: unknown) {
        let errorMsg = "Erro ao importar";
        if (err instanceof Response) {
          const apiError = await parseApiError(err);
          errorMsg = apiError.message || errorMsg;
        }
        form.setValue(`rows.${i}.import_status`, "error");
        form.setValue(`rows.${i}.import_error`, errorMsg);
      }
    }

    if (pauseRef.current) {
      pause();
    } else {
      const finalRows = form.getValues("rows");
      const { successIndices, hasErrors } = finalRows.reduce<{ successIndices: number[]; hasErrors: boolean }>(
        (acc, r, i) => {
          if (r.import_status === "success") acc.successIndices.push(i);
          if (r.action === "import" && r.import_status === "error") acc.hasErrors = true;
          return acc;
        },
        { successIndices: [], hasErrors: false },
      );

      if (hasErrors) remove(successIndices);

      finish();
      invalidateTransactions();
    }
  }

  const allSelected = fields.length > 0 && selected.size === fields.length;
  const someSelected = selected.size > 0;

  return (
    <FormProvider {...form}>
      <Stack gap="md" pb="2rem">
        {step === "upload" ? (
          <UploadStep
            onParsed={(parsedRows, accountId) => {
              form.reset({
                accountId,
                rows: parsedRows.map((r) => parsedRowToFormValues(r, accountId)),
              });
              setStep("review");
              setSelected(new Set());
              finish();
            }}
            onBack={() => void navigate({ to: "/transactions" })}
          />
        ) : allImportedSuccess ? (
          <Stack align="center" justify="center" gap="xs" py="xl" data-testid="finished_import_successfully_step">
            <IconCircleCheck size={64} color="var(--mantine-color-green-6)" />
            <Text fw={500} fz="lg">
              Importação concluída com sucesso!
            </Text>
            <Text fz="sm" c="dimmed">
              Redirecionando para transações...
            </Text>
          </Stack>
        ) : (
          <Stack gap="md" data-testid="import_review_step">
            {/* Header */}
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap="xs">
                <Button
                  variant="subtle"
                  leftSection={<IconArrowLeft size={16} />}
                  onClick={() => void navigate({ to: "/transactions" })}
                  size="sm"
                  disabled={importing}
                >
                  Voltar
                </Button>
                <Title order={4}>Revisão da importação</Title>
              </Group>

              <Group gap="xs">
                <Text fz="sm" c="dimmed">
                  {fields.length} linha{fields.length !== 1 ? "s" : ""} · {toImportRows.length} para importar
                </Text>
                <ImportConfirmButton
                  importing={importing}
                  paused={paused}
                  toImportCount={toImportRows.filter((r) => r.import_status !== "success").length}
                  onPause={handlePause}
                  onConfirm={() => void handleConfirm()}
                />
              </Group>
            </Group>

            {/* Summary after done with errors */}
            {isDone && errorCount > 0 && (
              <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="Importação concluída com erros">
                {errorCount} transaç{errorCount !== 1 ? "ões" : "ão"} com erro. Corrija e tente importar novamente.
              </Alert>
            )}

            {/* Bulk toolbar */}
            {someSelected && !importing && (
              <Paper p="xs" withBorder>
                <ImportCSVBulkToolbar
                  selectedCount={selected.size}
                  onRemove={handleRemoveSelected}
                  onBulkSetAction={handleBulkSetAction}
                  onBulkSetDate={handleBulkSetDate}
                  onBulkSetCategory={handleBulkSetCategory}
                  onBulkSetTransactionType={handleBulkSetTransactionType}
                  onBulkSetDescription={handleSetDescription}
                />
              </Paper>
            )}

            {/* Table */}
            <ScrollArea>
              <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={36}>
                      <Checkbox
                        size="xs"
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={allSelected ? handleClearSelection : handleSelectAll}
                        disabled={importing}
                      />
                    </Table.Th>
                    <Table.Th w={36} />
                    <Table.Th>Data</Table.Th>
                    <Table.Th>Descrição</Table.Th>
                    <Table.Th>Valor</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Categoria</Table.Th>
                    <Table.Th>Conta Destino</Table.Th>
                    <Table.Th>Parcelamento</Table.Th>
                    <Table.Th>Divisão</Table.Th>
                    <Table.Th>Ação</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {fields.map((field, i) => (
                    <ImportReviewRow
                      key={field.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(i, el);
                        else rowRefs.current.delete(i);
                      }}
                      rowIndex={i}
                      selected={selected.has(i)}
                      disabled={importing && !paused}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>

            {/* Navigation blocker modal */}
            <Modal
              opened={blockerStatus === "blocked"}
              onClose={() => resetBlocker?.()}
              title="Atenção"
              centered
              size="sm"
            >
              <Stack gap="md">
                <Text fz="sm">{blockMessage}</Text>
                <Group justify="flex-end" gap="xs">
                  <Button variant="default" onClick={() => resetBlocker?.()}>
                    Cancelar
                  </Button>
                  <Button color="red" onClick={() => proceed?.()}>
                    Sair mesmo assim
                  </Button>
                </Group>
              </Stack>
            </Modal>
          </Stack>
        )}
      </Stack>
    </FormProvider>
  );
}

// ─── Upload Step ───────────────────────────────────────────────────────────────

interface UploadStepProps {
  onParsed: (rows: Transactions.ParsedImportRow[], accountId: number) => void;
  onBack: () => void;
}

function UploadStep({ onParsed, onBack }: UploadStepProps) {
  const [decimalSeparator, setDecimalSeparator] = useState<Transactions.DecimalSeparatorValue>("comma");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountDescription, setAccountDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const ownAccountOptions = accounts
    .filter((a) => !a.user_connection && a.is_active)
    .map((a) => ({ value: String(a.id), label: a.name }));

  const { mutation } = useParseImportCSV();

  function handleSubmit() {
    setErrorMessage(null);
    if (!file) {
      setErrorMessage("Selecione um arquivo CSV.");
      return;
    }
    if (!accountId) {
      setErrorMessage("Selecione uma conta.");
      return;
    }

    mutation.mutate(
      { file, accountId, decimalSeparator },
      {
        onSuccess: (result) => onParsed(result.rows, accountId),
        onError: async (err: unknown) => {
          if (err instanceof Response) {
            const apiError = await parseApiError(err);
            const tag = apiError.tags[0] as string | undefined;
            setErrorMessage(
              (tag ? Transactions.IMPORT_ERROR_MESSAGES[tag] : undefined) ??
                apiError.message ??
                "Erro ao processar o arquivo.",
            );
          } else {
            setErrorMessage("Erro ao processar o arquivo.");
          }
        },
      },
    );
  }

  return (
    <Stack gap="md" maw={{ lg: 1280 }} data-testid="import_upload_step">
      <Group gap="xs">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={onBack} size="sm">
          Voltar
        </Button>
        <Title order={4}>Importar Transações</Title>
      </Group>

      <Flex direction="row" gap="xs">
        <Select
          label="Conta"
          placeholder="Selecione uma conta"
          required
          data={ownAccountOptions}
          value={accountId ? String(accountId) : null}
          onChange={(val) => setAccountId(val ? Number(val) : null)}
          data-testid="select_import_account"
        />

        <Select
          label="Formato da coluna 'Valor'"
          required
          data={[
            {
              label: "1.234,56",
              value: "comma",
            },
            {
              label: "1,243.56",
              value: "dot",
            },
          ]}
          value={decimalSeparator}
          onChange={(val) => setDecimalSeparator((val as Transactions.DecimalSeparatorValue | null) ?? "comma")}
          data-testid="select_decimal_separator"
        />
      </Flex>

      <FileInput
        label="Arquivo CSV"
        placeholder="Clique para selecionar"
        required
        accept="text/csv"
        leftSection={<IconFileTypeCsv size={16} />}
        value={file}
        onChange={setFile}
      />

      {errorMessage && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Erro">
          {errorMessage}
        </Alert>
      )}

      <Button
        onClick={handleSubmit}
        loading={mutation.isPending}
        leftSection={mutation.isPending ? <Loader size="xs" /> : undefined}
        disabled={!file || !accountId}
        data-testid="btn_process_csv"
      >
        Processar arquivo
      </Button>

      <Box mt="md">
        <Title order={6} mb="xs">
          Modelo de cabeçalho válido
        </Title>
        <Code block mb="xs">
          {CSV_COLUMNS.map((c) => c.col).join(";")}
        </Code>
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Coluna</Table.Th>
              <Table.Th>Obrigatório</Table.Th>
              <Table.Th>Descrição</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {CSV_COLUMNS.map((col) => (
              <Table.Tr key={col.col}>
                <Table.Td>
                  <Text fw={500} fz="xs">
                    {col.col}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text c={col.required ? "red" : "dimmed"} fz="xs">
                    {col.required ? "Sim" : "Não"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fz="xs" c="dimmed">
                    {col.description}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Stack>
  );
}
