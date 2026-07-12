import { Box, Button, Group } from "@mantine/core";
import { ShortcutHint, MOD_LABEL } from "@/components/ShortcutHint";
import { useIsMobile } from "@/hooks/useIsMobile";
import { TransactionsTestIds } from "@/testIds";

interface Props {
  loading: boolean;
  /** Optional "Salvar e criar outra" handler — a wrapped RHF submit. */
  onSaveAndCreateAnother?: () => void;
}

const desktopFooterStyle: React.CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 3,
  background: "var(--mantine-color-body)",
  borderTop: "1px solid var(--mantine-color-default-border)",
  paddingTop: "var(--mantine-spacing-md)",
  paddingBottom: "var(--mantine-spacing-md)",
  marginTop: "var(--mantine-spacing-md)",
};

const mobileFooterStyle: React.CSSProperties = {
  paddingTop: "var(--mantine-spacing-md)",
  paddingBottom: "var(--mantine-spacing-md)",
  marginTop: "var(--mantine-spacing-md)",
};

export function TransactionFormFooter({ loading, onSaveAndCreateAnother }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // Salvar lives in the drawer header on mobile. Footer only carries the
    // secondary "Salvar e criar outra" action and is not sticky so it doesn't
    // overlap form fields when the on-screen keyboard opens.
    if (!onSaveAndCreateAnother) return null;
    return (
      <Box style={mobileFooterStyle}>
        <Button
          type="button"
          variant="subtle"
          fullWidth
          size="sm"
          loading={loading}
          onClick={onSaveAndCreateAnother}
          data-testid={TransactionsTestIds.BtnSaveAndCreateAnother}
        >
          Salvar e criar outra
        </Button>
      </Box>
    );
  }

  return (
    <Box style={desktopFooterStyle}>
      <Group justify="space-between">
        {onSaveAndCreateAnother ? (
          <Button
            type="button"
            variant="subtle"
            loading={loading}
            onClick={onSaveAndCreateAnother}
            rightSection={<ShortcutHint keys={[MOD_LABEL, "⇧", "↵"]} />}
            data-testid={TransactionsTestIds.BtnSaveAndCreateAnother}
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
