import { Avatar, Box, Stack, Text, ThemeIcon, useMantineColorScheme } from '@mantine/core'
import { IconLink } from '@tabler/icons-react'
import { UserAvatar } from '@/components/UserAvatar'

interface PartnerAvatarPairProps {
  userName: string
  userAvatarUrl?: string
  partnerName?: string
}

export function PartnerAvatarPair({ userName, userAvatarUrl, partnerName }: PartnerAvatarPairProps) {
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'
  const partnerInitial = partnerName?.trim().charAt(0).toUpperCase() || ''
  const placeholder = partnerInitial === ''

  return (
    <Box
      px="lg"
      pt="lg"
      pb="md"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, rgba(86, 143, 179, 0.12) 0%, transparent 100%)'
          : 'linear-gradient(180deg, var(--mantine-color-blue-0) 0%, transparent 100%)',
        borderBottom: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Stack align="center" gap="sm">
        <Box style={{ display: 'flex', alignItems: 'center' }}>
          <UserAvatar
            name={userName}
            avatarUrl={userAvatarUrl}
            size="xl"
            color="blue"
          />
          <ThemeIcon
            size={28}
            radius="xl"
            variant="filled"
            color="blue"
            style={{
              marginInline: -10,
              border: '2px solid var(--mantine-color-body)',
              zIndex: 1,
            }}
          >
            <IconLink size={14} />
          </ThemeIcon>
          <Avatar
            size="xl"
            radius="xl"
            color={placeholder ? 'gray' : 'grape'}
            variant={placeholder ? 'outline' : 'filled'}
            style={
              placeholder
                ? { borderStyle: 'dashed', borderWidth: 2 }
                : undefined
            }
          >
            {placeholder ? '?' : partnerInitial}
          </Avatar>
        </Box>

        <Stack gap={4} align="center">
          <Text fw={700} size="lg" ta="center">
            Convide quem divide a vida com você
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw={340}>
            Despesas, transferências e acertos compartilhados — sem planilha no meio.
          </Text>
        </Stack>
      </Stack>
    </Box>
  )
}
