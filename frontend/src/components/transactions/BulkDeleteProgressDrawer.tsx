import {
  Button,
  Drawer,
  Group,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { deleteTransaction } from "@/api/transactions";
import { useDrawerContext } from "@/utils/renderDrawer";
import { PropagationSetting } from "./PropagationSettingsDrawer";

interface TransactionToDelete {
  id: number;
  description: string;
  propagationSettings?: PropagationSetting;
}

interface BulkDeleteProgressDrawerProps {
  transactions: TransactionToDelete[];
  onSuccess: () => void;
  onInvalidate: () => void;
}

type ProcessState = "processing" | "success" | "error";

interface ErrorInfo {
  description: string;
  reason: string;
  remaining: string[];
}

export function BulkDeleteProgressDrawer({
  transactions,
  onSuccess,
  onInvalidate,
}: BulkDeleteProgressDrawerProps) {
  const { opened, close } = useDrawerContext<void>();
  const [state, setState] = useState<ProcessState>("processing");
  const [progress, setProgress] = useState(0);
  const [currentLabel, setCurrentLabel] = useState("");
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    async function run() {
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        setCurrentLabel(tx.description);
        setProgress(Math.round((i / transactions.length) * 100));

        try {
          await deleteTransaction(tx.id, tx.propagationSettings);
        } catch (err) {
          let reason = "Erro desconhecido";
          if (err instanceof Response) {
            try {
              const body = await err.json();
              reason = body.message ?? reason;
            } catch {
              reason = `Erro ${err.status}`;
            }
          }
          setErrorInfo({
            description: tx.description,
            reason,
            remaining: transactions.slice(i + 1).map((t) => t.description),
          });
          setState("error");
          return;
        }
      }

      setProgress(100);
      setCurrentLabel("");
      setState("success");
      onInvalidate();
      onSuccess();
    }

    run();
  }, []);

  const isProcessing = state === "processing";

  return (
    <Drawer
      opened={opened}
      onClose={isProcessing ? () => {} : close}
      closeOnEscape={!isProcessing}
      closeOnClickOutside={!isProcessing}
      position="bottom"
      data-testid={`drawer_bulk_delete_${state}`}
      title={
        state === "success"
          ? "Transações excluídas"
          : state === "error"
            ? "Erro ao excluir"
            : "Excluindo transações..."
      }
      withCloseButton={!isProcessing}
      styles={{
        inner: { left: "35vw", right: "35vw", width: "30vw" },
        content: {
          borderRadius: "var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0",
          height: "auto",
          maxHeight: "80dvh",
        },
      }}
    >
      <Stack gap="md" pb="sm">
        {state !== "success" && (
          <Progress
            value={progress}
            animated={isProcessing}
            color={state === "error" ? "red" : "blue"}
            data-testid="bulk_delete_progress"
          />
        )}

        {isProcessing && (
          <Text size="sm" c="dimmed" ta="center" data-testid="bulk_delete_current_label">
            {currentLabel}
          </Text>
        )}

        {state === "success" && (
          <Stack gap="sm" align="center" data-testid="bulk_delete_success">
            <Group justify="center" gap="xs">
              <ThemeIcon color="teal" radius="xl" size="lg">
                <IconCheck size={18} />
              </ThemeIcon>
              <Text size="sm" fw={500}>
                {transactions.length} transaç
                {transactions.length !== 1 ? "ões excluídas" : "ão excluída"} com
                sucesso
              </Text>
            </Group>
            <Button variant="default" onClick={() => close()} data-testid="btn_bulk_delete_done">
              Fechar
            </Button>
          </Stack>
        )}

        {state === "error" && errorInfo && (
          <Stack gap="xs" data-testid="bulk_delete_error">
            <Group gap="xs">
              <ThemeIcon color="red" radius="xl" size="md">
                <IconX size={14} />
              </ThemeIcon>
              <Text size="sm" fw={500}>
                Falha ao excluir &quot;{errorInfo.description}&quot;
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {errorInfo.reason}
            </Text>
            {errorInfo.remaining.length > 0 && (
              <>
                <Text size="xs" c="dimmed" mt="xs">
                  Não processadas ({errorInfo.remaining.length}):
                </Text>
                {errorInfo.remaining.map((desc) => (
                  <Text key={desc} size="xs" c="dimmed" pl="sm">
                    • {desc}
                  </Text>
                ))}
              </>
            )}
            <Button variant="default" onClick={() => close()} mt="xs" data-testid="btn_bulk_delete_close_error">
              Fechar
            </Button>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}
