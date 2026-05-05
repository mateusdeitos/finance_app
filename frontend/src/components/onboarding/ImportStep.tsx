import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconFileImport, IconCircleCheck } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { OnboardingTestIds } from '@/testIds'

export function ImportStep() {
  const navigate = useNavigate()

  return (
    <Stack gap="lg" data-testid={OnboardingTestIds.StepImport}>
      <Group gap="sm" align="center">
        <ThemeIcon color="green" variant="light" radius="xl" size="lg">
          <IconCircleCheck size={20} />
        </ThemeIcon>
        <Text fw={600} size="lg">Tudo pronto!</Text>
      </Group>

      <Text c="dimmed" size="sm">
        Suas contas e categorias foram criadas. Para começar a acompanhar seus gastos de verdade, o
        próximo passo é trazer suas transações para o app.
      </Text>

      <Paper withBorder radius="md" p="md">
        <Group gap="md" align="flex-start" wrap="nowrap">
          <ThemeIcon color="blue" variant="light" radius="md" size="lg">
            <IconFileImport size={20} />
          </ThemeIcon>
          <Stack gap={4}>
            <Text fw={600}>Importe suas transações</Text>
            <Text c="dimmed" size="sm">
              Você pode importar um extrato em CSV do seu banco, da fatura do cartão de crédito ou
              exportado de outros apps de finanças. Assim, você não precisa cadastrar transação por
              transação para ter o histórico completo.
            </Text>
          </Stack>
        </Group>
      </Paper>

      <Group justify="space-between" mt="md">
        <Button
          variant="subtle"
          onClick={() => void navigate({ to: '/transactions' })}
          data-testid={OnboardingTestIds.BtnSkipImport}
        >
          Pular por enquanto
        </Button>
        <Button
          leftSection={<IconFileImport size={16} />}
          onClick={() => void navigate({ to: '/transactions/import' })}
          data-testid={OnboardingTestIds.BtnGoToImport}
        >
          Importar transações
        </Button>
      </Group>
    </Stack>
  )
}
