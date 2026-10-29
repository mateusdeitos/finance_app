import { Box, Button, Group, Menu } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
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
      <Group justify="flex-end">
        <Button.Group>
          <Button
            type="submit"
            loading={loading}
            rightSection={<ShortcutHint keys={[MOD_LABEL, "↵"]} />}
            data-testid={TransactionsTestIds.BtnSave}
          >
            Salvar
          </Button>
          {(onSaveAndCreateAnother || onSaveAsTemplate) && (
            <Menu shadow="md" position="top-end">
              <Menu.Target>
                <Button
                  type="button"
                  px={8}
                  disabled={loading}
                  aria-label="Mais opções de salvamento"
                  data-testid={TransactionsTestIds.BtnSaveActionsMenu}
                >
                  <IconChevronDown size={16} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {onSaveAsTemplate && (
                  <Menu.Item
                    onClick={onSaveAsTemplate}
                    disabled={loading}
                    data-testid={TransactionsTestIds.BtnSaveAsTemplate}
                  >
                    Salvar como modelo
                  </Menu.Item>
                )}
                {onSaveAndCreateAnother && (
                  <Menu.Item
                    onClick={onSaveAndCreateAnother}
                    disabled={loading}
                    rightSection={<ShortcutHint keys={[MOD_LABEL, "⇧", "↵"]} />}
                    data-testid={TransactionsTestIds.BtnSaveAndCreateAnother}
                  >
                    Salvar e criar outra
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </Button.Group>
      </Group>
    </Box>
  );
}
