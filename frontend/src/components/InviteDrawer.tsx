import { Drawer, Stack, Text, TextInput, Button, CopyButton, Group } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { useMe } from '@/hooks/useMe'
import { useDrawerContext } from '@/utils/renderDrawer'

export function InviteDrawer() {
  const { opened, reject } = useDrawerContext<void>()
  const { query: meQuery } = useMe()
  const user = meQuery.data

  const inviteUrl = user?.external_id
    ? `${window.location.origin}/connect-with/${user.external_id}`
    : ''

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      title="Criar Conexão"
      position="right"
      size="md"
      data-testid="drawer_invite"
    >
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          Compartilhe o link abaixo com seu parceiro. Ao acessar o link, ele poderá aceitar a conexão com você.
        </Text>

        <Stack gap="xs">
          <Text size="sm" fw={500}>Seu link de convite</Text>
          <Group gap="xs" wrap="nowrap">
            <TextInput
              value={inviteUrl}
              readOnly
              style={{ flex: 1 }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <CopyButton value={inviteUrl} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  color={copied ? 'teal' : 'blue'}
                  onClick={copy}
                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Stack>
      </Stack>
    </Drawer>
  )
}
