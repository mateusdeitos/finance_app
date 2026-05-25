import { useState } from 'react'
import { Box, Button, CopyButton, Group, Stack, Text, TextInput } from '@mantine/core'
import { IconCheck, IconCopy, IconInfoCircle } from '@tabler/icons-react'
import { useMe } from '@/hooks/useMe'
import { CommonTestIds } from '@/testIds'
import { useDrawerContext } from '@/utils/renderDrawer'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { PartnerAvatarPair } from '@/components/connections/PartnerAvatarPair'
import { SplitSelector } from '@/components/connections/SplitSelector'
import { SplitFlowDiagram } from '@/components/connections/SplitFlowDiagram'

function buildInviteUrl(externalId: string, splitPct: number) {
  const base = `${window.location.origin}/connect-with/${externalId}`
  if (splitPct === 50) return base
  return `${base}?split=${splitPct}`
}

export function InviteDrawer() {
  const { opened, reject } = useDrawerContext<void>()
  const { query: meQuery } = useMe()
  const user = meQuery.data

  const [partnerName, setPartnerName] = useState('')
  const [splitValue, setSplitValue] = useState<number | 'custom'>(50)
  const [customSplit, setCustomSplit] = useState(65)

  const effectiveSplit = splitValue === 'custom' ? customSplit : splitValue
  const trimmedPartner = partnerName.trim()
  const partnerHasName = trimmedPartner.length > 0
  const partnerDisplay = partnerHasName ? trimmedPartner : 'Parceiro(a)'

  const inviteUrl = user?.external_id
    ? buildInviteUrl(user.external_id, effectiveSplit)
    : ''

  const userName = user?.name ?? 'Você'
  const userFirstName = userName.split(' ')[0] ?? userName

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Criar conexão"
      data-testid={CommonTestIds.DrawerInvite}
      padding={0}
    >
      <Stack gap={0} style={{ minHeight: '100%' }}>
        <PartnerAvatarPair
          userName={userFirstName}
          userAvatarUrl={user?.avatar_url}
          partnerName={trimmedPartner || undefined}
        />

        <Stack gap="lg" p="md">
          <Box>
            <Group justify="space-between" align="baseline" mb={6}>
              <Text size="sm" fw={600} c="dimmed">
                Como você chama essa pessoa?
              </Text>
              <Text size="xs" c="dimmed">Opcional</Text>
            </Group>
            <TextInput
              data-testid={CommonTestIds.InvitePartnerNameInput}
              value={partnerName}
              onChange={(e) => setPartnerName(e.currentTarget.value)}
              placeholder="Ex.: Amanda, meu marido, mãe…"
              maxLength={40}
            />
            <Text size="xs" c="dimmed" mt={6}>
              Só pra ficar mais claro pra você aqui. O nome real virá quando a outra
              pessoa aceitar.
            </Text>
          </Box>

          <SplitSelector
            value={splitValue}
            customValue={customSplit}
            userName={userFirstName}
            userAvatarUrl={user?.avatar_url}
            partnerName={partnerDisplay}
            partnerHasName={partnerHasName}
            onChange={setSplitValue}
            onCustomChange={setCustomSplit}
          />

          <SplitFlowDiagram
            split={effectiveSplit}
            userName={userFirstName}
            userAvatarUrl={user?.avatar_url}
            partnerName={partnerDisplay}
            partnerHasName={partnerHasName}
          />
        </Stack>

        <Box
          mt="auto"
          p="md"
          style={{
            borderTop: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-body)',
            position: 'sticky',
            bottom: 0,
          }}
        >
          <Stack gap={8}>
            <CopyButton value={inviteUrl} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  fullWidth
                  size="md"
                  color={copied ? 'teal' : 'blue'}
                  onClick={copy}
                  disabled={!inviteUrl}
                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  data-testid={CommonTestIds.InviteCopyLink}
                  title={inviteUrl}
                >
                  {copied ? 'Link copiado!' : 'Copiar link de convite'}
                </Button>
              )}
            </CopyButton>
            <Group gap={6} justify="center">
              <IconInfoCircle size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed">
                Link único — envie no seu app favorito
              </Text>
            </Group>
          </Stack>
        </Box>
      </Stack>
    </ResponsiveDrawer>
  )
}
