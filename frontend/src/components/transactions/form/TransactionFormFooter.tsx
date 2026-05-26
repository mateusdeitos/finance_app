import { Box, Button, Group, Stack } from "@mantine/core";
import { ShortcutHint, MOD_LABEL } from "@/components/ShortcutHint";
import { useIsMobile } from "@/hooks/useIsMobile";
import { TransactionsTestIds } from "@/testIds";

interface Props {
  loading: boolean;
  /** Optional "Salvar e criar outra" handler — a wrapped RHF submit. */
  onSaveAndCreateAnother?: () => void;
}

const footerStyle: React.CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 3,
  background: "var(--mantine-color-body)",
  borderTop: "1px solid var(--mantine-color-default-border)",
  paddingTop: "var(--mantine-spacing-md)",
  paddingBottom: "var(--mantine-spacing-md)",
  marginTop: "var(--mantine-spacing-md)",
};

export function TransactionFormFooter({ loading, onSaveAndCreateAnother }: Props) {
  // Render exactly one Salvar button so e2e selectors (and screen readers)
  // never see two `BtnSave` testids at once.
  const isMobile = useIsMobile();

  return (
    <Box style={footerStyle}>
      {isMobile ? (
        <Stack gap="xs">
          <Button
            type="submit"
            fullWidth
            size="md"
            loading={loading}
            data-testid={TransactionsTestIds.BtnSave}
          >
            Salvar
          </Button>
          {onSaveAndCreateAnother && (
            <Button
              type="button"
              variant="subtle"
              fullWidth
              size="sm"
              loading={loading}
              onClick={onSaveAndCreateAnother}
            >
              Salvar e criar outra
            </Button>
          )}
        </Stack>
      ) : (
        <Group justify="space-between">
          {onSaveAndCreateAnother ? (
            <Button
              type="button"
              variant="subtle"
              loading={loading}
              onClick={onSaveAndCreateAnother}
              rightSection={<ShortcutHint keys={[MOD_LABEL, "⇧", "↵"]} />}
            >
              Salvar e criar outra
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            loading={loading}
            rightSection={<ShortcutHint keys={[MOD_LABEL, "↵"]} />}
            data-testid={TransactionsTestIds.BtnSave}
          >
            Salvar
          </Button>
        </Group>
      )}
    </Box>
  );
}
