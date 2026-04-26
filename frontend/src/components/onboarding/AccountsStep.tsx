import { Avatar, Checkbox, Group, Stack, Text } from '@mantine/core'
import { OnboardingTestIds } from '@/testIds'
import type { SuggestedAccount } from './onboardingDefaults'

interface Props {
  accounts: SuggestedAccount[]
  selectedSlugs: Set<string>
  onToggle: (slug: string) => void
}

export function AccountsStep({ accounts, selectedSlugs, onToggle }: Props) {
  return (
    <Stack gap="md" data-testid={OnboardingTestIds.StepAccounts}>
      <Stack gap={4}>
        <Text fw={600} size="lg">Suas contas</Text>
        <Text c="dimmed" size="sm">
          Contas representam de onde o seu dinheiro entra ou sai: conta corrente, cartões de crédito,
          carteira digital ou uma reserva. Selecione as contas que você quer começar a usar — você pode
          editar, criar ou desativar contas a qualquer momento depois.
        </Text>
      </Stack>

      <Stack gap="xs">
        {accounts.map((account) => {
          const checked = selectedSlugs.has(account.slug)
          return (
            <Group
              key={account.slug}
              gap="sm"
              wrap="nowrap"
              align="center"
              data-testid={OnboardingTestIds.AccountRow(account.slug)}
              style={{
                padding: '0.75rem',
                borderRadius: 8,
                border: '1px solid var(--mantine-color-gray-3)',
                cursor: 'pointer',
              }}
              onClick={() => onToggle(account.slug)}
            >
              <Checkbox
                checked={checked}
                onChange={() => onToggle(account.slug)}
                onClick={(e) => e.stopPropagation()}
                data-testid={OnboardingTestIds.CheckboxAccount(account.slug)}
              />
              <Avatar
                radius="xl"
                size="md"
                style={{ backgroundColor: account.avatar_background_color, color: 'white' }}
              >
                {account.name.charAt(0)}
              </Avatar>
              <Text fw={500}>{account.name}</Text>
            </Group>
          )
        })}
      </Stack>
    </Stack>
  )
}
