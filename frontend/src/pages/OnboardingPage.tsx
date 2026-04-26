import { useMemo, useState } from 'react'
import { Alert, Button, Container, Group, Paper, Stack, Stepper, Text } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useCompleteOnboarding, useOnboardingStatus } from '@/hooks/useOnboardingStatus'
import { AccountsStep } from '@/components/onboarding/AccountsStep'
import { CategoriesStep } from '@/components/onboarding/CategoriesStep'
import { ImportStep } from '@/components/onboarding/ImportStep'
import {
  SUGGESTED_ACCOUNTS,
  SUGGESTED_CATEGORIES,
  type SuggestedCategory,
} from '@/components/onboarding/onboardingDefaults'
import type { OnboardingSetupRequest } from '@/api/onboarding'
import { OnboardingTestIds } from '@/testIds'

const STEP_ACCOUNTS = 0
const STEP_CATEGORIES = 1
const STEP_IMPORT = 2

function buildInitialSlugs(items: { slug: string }[]): Set<string> {
  return new Set(items.map((i) => i.slug))
}

function buildInitialCategorySlugs(categories: SuggestedCategory[]): Set<string> {
  const slugs = new Set<string>()
  categories.forEach((parent) => {
    slugs.add(parent.slug)
    parent.children?.forEach((child) => slugs.add(child.slug))
  })
  return slugs
}

export function OnboardingPage() {
  const [step, setStep] = useState(STEP_ACCOUNTS)
  const [selectedAccountSlugs, setSelectedAccountSlugs] = useState<Set<string>>(() =>
    buildInitialSlugs(SUGGESTED_ACCOUNTS),
  )
  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<Set<string>>(() =>
    buildInitialCategorySlugs(SUGGESTED_CATEGORIES),
  )

  const { invalidate: invalidateOnboarding } = useOnboardingStatus()
  const { invalidate: invalidateAccounts } = useAccounts()
  const { invalidate: invalidateCategories } = useCategories()

  const { mutation: completeMutation } = useCompleteOnboarding({
    onSuccess: () => {
      invalidateOnboarding()
      invalidateAccounts()
      invalidateCategories()
      setStep(STEP_IMPORT)
    },
  })

  const payload = useMemo<OnboardingSetupRequest>(() => {
    const accounts = SUGGESTED_ACCOUNTS.filter((a) => selectedAccountSlugs.has(a.slug)).map((a) => ({
      name: a.name,
      initial_balance: a.initial_balance,
      avatar_background_color: a.avatar_background_color,
    }))

    const categories = SUGGESTED_CATEGORIES.filter((c) => selectedCategorySlugs.has(c.slug)).map(
      (parent) => ({
        name: parent.name,
        emoji: parent.emoji,
        children: (parent.children ?? [])
          .filter((child) => selectedCategorySlugs.has(child.slug))
          .map((child) => ({ name: child.name, emoji: child.emoji })),
      }),
    )

    return { accounts, categories }
  }, [selectedAccountSlugs, selectedCategorySlugs])

  function toggleAccount(slug: string) {
    setSelectedAccountSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function toggleCategory(slug: string) {
    setSelectedCategorySlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function handleSubmit() {
    completeMutation.mutate(payload)
  }

  const error = completeMutation.error?.message

  return (
    <Container size="sm" py="md" data-testid={OnboardingTestIds.Page}>
      <Stack gap="lg">
        <Stack gap={4}>
          <Text fw={700} size="xl">Bem-vindo ao FinanceApp 👋</Text>
          <Text c="dimmed" size="sm">
            Vamos configurar o essencial para você começar — em três passos rápidos.
          </Text>
        </Stack>

        <Stepper
          active={step}
          allowNextStepsSelect={false}
          onStepClick={(s) => {
            if (s < step) setStep(s)
          }}
          size="sm"
          data-testid={OnboardingTestIds.Stepper}
        >
          <Stepper.Step label="Contas" />
          <Stepper.Step label="Categorias" />
          <Stepper.Step label="Importar" />
        </Stepper>

        <Paper withBorder radius="md" p="md">
          {step === STEP_ACCOUNTS && (
            <AccountsStep
              accounts={SUGGESTED_ACCOUNTS}
              selectedSlugs={selectedAccountSlugs}
              onToggle={toggleAccount}
            />
          )}
          {step === STEP_CATEGORIES && (
            <CategoriesStep
              categories={SUGGESTED_CATEGORIES}
              selectedSlugs={selectedCategorySlugs}
              onToggle={toggleCategory}
            />
          )}
          {step === STEP_IMPORT && <ImportStep />}
        </Paper>

        {error && (
          <Alert
            color="red"
            icon={<IconAlertCircle size={16} />}
            title="Não foi possível concluir"
            data-testid={OnboardingTestIds.AlertError}
          >
            {error}
          </Alert>
        )}

        {step !== STEP_IMPORT && (
          <Group justify="space-between">
            <Button
              variant="subtle"
              onClick={() => setStep((s) => Math.max(STEP_ACCOUNTS, s - 1))}
              disabled={step === STEP_ACCOUNTS || completeMutation.isPending}
              data-testid={OnboardingTestIds.BtnBack}
            >
              Voltar
            </Button>
            {step === STEP_ACCOUNTS ? (
              <Button
                onClick={() => setStep(STEP_CATEGORIES)}
                data-testid={OnboardingTestIds.BtnNext}
              >
                Próximo
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                loading={completeMutation.isPending}
                data-testid={OnboardingTestIds.BtnFinish}
              >
                Concluir
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </Container>
  )
}
