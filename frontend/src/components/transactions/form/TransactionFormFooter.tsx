import { Box, Button, Group, Stack } from "@mantine/core";
import { ShortcutHint, MOD_LABEL } from "@/components/ShortcutHint";
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
  return (
    <Box style={footerStyle}>
      {/* Mobile (< sm): Salvar full-width, "Salvar e criar outra" as a subtle link below */}
      <Stack gap="xs" hiddenFrom="sm">
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

      {/* Desktop (>= sm): horizontal layout, primary Salvar on the right */}
      <Group justify="space-between" visibleFrom="sm">
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
    </Box>
  );
}
