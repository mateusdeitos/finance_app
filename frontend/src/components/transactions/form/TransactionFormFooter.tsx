import { Box, Button, Group } from "@mantine/core";
import { ShortcutHint, MOD_LABEL } from "@/components/ShortcutHint";
import { useIsMobile } from "@/hooks/useIsMobile";
import { TransactionsTestIds } from "@/testIds";

interface Props {
  loading: boolean;
  /** Optional "Salvar e criar outra" handler — a wrapped RHF submit. */
  onSaveAndCreateAnother?: () => void;
  /** Create-form only (MNG-02): opens the SaveAsTemplateDrawer. Absent on the edit form. */
  onSaveAsTemplate?: () => void;
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

export function TransactionFormFooter({
  loading,
  onSaveAndCreateAnother,
  onSaveAsTemplate,
}: Props) {
  const isMobile = useIsMobile();

  const saveAsTemplateButton = onSaveAsTemplate && (
    <Button
      type="button"
      variant="subtle"
      size={isMobile ? "sm" : undefined}
      fullWidth={isMobile}
      onClick={onSaveAsTemplate}
      data-testid={TransactionsTestIds.BtnSaveAsTemplate}
    >
      Salvar como modelo
    </Button>
  );

  if (isMobile) {
    // Salvar lives in the drawer header on mobile. Footer only carries the
    // secondary "Salvar e criar outra" / "Salvar como modelo" actions and is
    // not sticky so it doesn't overlap form fields when the on-screen
    // keyboard opens.
    if (!onSaveAndCreateAnother && !onSaveAsTemplate) return null;
    return (
      <Box style={mobileFooterStyle}>
        <Group gap="xs" grow={!!(onSaveAndCreateAnother && onSaveAsTemplate)}>
          {onSaveAndCreateAnother && (
            <Button
              type="button"
              variant="subtle"
              fullWidth={!onSaveAsTemplate}
              size="sm"
              loading={loading}
              onClick={onSaveAndCreateAnother}
              data-testid={TransactionsTestIds.BtnSaveAndCreateAnother}
            >
              Salvar e criar outra
            </Button>
          )}
          {saveAsTemplateButton}
        </Group>
      </Box>
    );
  }

  return (
    <Box style={desktopFooterStyle}>
      <Group justify="space-between">
        <Group gap="xs">
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
          {saveAsTemplateButton}
        </Group>
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
