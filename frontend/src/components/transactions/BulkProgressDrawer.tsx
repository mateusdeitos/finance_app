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
import { useDrawerContext } from "@/utils/renderDrawer";
import { useSequentialProgress } from "@/hooks/useSequentialProgress";

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
  const { state, progress, currentLabel, errorInfo } = useSequentialProgress({
    items,
    action,
    onInvalidate,
    onSuccess,
  });

  const isProcessing = state === "processing";

  return (
    <Drawer
      opened={opened}
      onClose={isProcessing ? () => {} : close}
      closeOnEscape={!isProcessing}
      closeOnClickOutside={!isProcessing}
      position="bottom"
      data-testid={testIdPrefix}
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
                {errorInfo.remaining.map((label, idx) => (
                  <Text key={`${idx}-${label}`} size="xs" c="dimmed" pl="sm">
                    {"•"} {label}
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
