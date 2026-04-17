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
import { useDrawerContext } from "@/utils/renderDrawer";

export interface BulkProgressItem {
  id: number;
  label: string;
}

interface BulkProgressDrawerProps {
  items: BulkProgressItem[];
  action: (item: BulkProgressItem) => Promise<void>;
  titles: {
    processing: string;
    success: string;
    error: string;
  };
  successMessage: (count: number) => string;
  onInvalidate: () => void;
  onSuccess: () => void;
  testIdPrefix?: string;
}

type ProcessState = "processing" | "success" | "error";

interface ErrorInfo {
  description: string;
  reason: string;
  remaining: string[];
}

export function BulkProgressDrawer({
  items,
  action,
  titles,
  successMessage,
  onInvalidate,
  onSuccess,
  testIdPrefix = "bulk_progress",
}: BulkProgressDrawerProps) {
  const { opened, close } = useDrawerContext<void>();
  const [state, setState] = useState<ProcessState>("processing");
  const [progress, setProgress] = useState(0);
  const [currentLabel, setCurrentLabel] = useState("");
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    async function run() {
      for (let i = 0; i < items.length; i++) {
        setCurrentLabel(items[i].label);
        setProgress(Math.round((i / items.length) * 100));

        try {
          await action(items[i]);
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
            description: items[i].label,
            reason,
            remaining: items.slice(i + 1).map((t) => t.label),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isProcessing = state === "processing";

  return (
    <Drawer
      opened={opened}
      onClose={isProcessing ? () => {} : close}
      closeOnEscape={!isProcessing}
      closeOnClickOutside={!isProcessing}
      position="bottom"
      data-testid={`${testIdPrefix}_${state}`}
      title={
        state === "success"
          ? titles.success
          : state === "error"
            ? titles.error
            : titles.processing
      }
      withCloseButton={!isProcessing}
      styles={{
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
            data-testid="bulk_progress_bar"
          />
        )}

        {isProcessing && (
          <Text size="sm" c="dimmed" ta="center" data-testid="bulk_current_label">
            {currentLabel}
          </Text>
        )}

        {state === "success" && (
          <Stack gap="sm" align="center" data-testid="bulk_success">
            <Group justify="center" gap="xs">
              <ThemeIcon color="teal" radius="xl" size="lg">
                <IconCheck size={18} />
              </ThemeIcon>
              <Text size="sm" fw={700}>
                {successMessage(items.length)}
              </Text>
            </Group>
            <Button variant="default" onClick={() => close()} data-testid="btn_bulk_done">
              Fechar
            </Button>
          </Stack>
        )}

        {state === "error" && errorInfo && (
          <Stack gap="xs" data-testid="bulk_error">
            <Group gap="xs">
              <ThemeIcon color="red" radius="xl" size="md">
                <IconX size={14} />
              </ThemeIcon>
              <Text size="sm" fw={700}>
                Falha ao atualizar &quot;{errorInfo.description}&quot;
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
                {errorInfo.remaining.map((label) => (
                  <Text key={label} size="xs" c="dimmed" pl="sm">
                    {"\u2022"} {label}
                  </Text>
                ))}
              </>
            )}
            <Button variant="default" onClick={() => close()} mt="xs" data-testid="btn_bulk_close_error">
              Fechar
            </Button>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}
