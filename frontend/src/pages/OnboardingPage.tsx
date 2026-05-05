import { useMemo, useState } from 'react'
import { Alert, Button, Container, Group, Paper, Stack, Stepper, Text } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useCompleteOnboarding, useOnboardingStatus } from '@/hooks/useOnboardingStatus'
import { AccountsStep } from '@/components/onboarding/AccountsStep'
import { CategoriesStep } from '@/components/onboarding/CategoriesStep'
import { ImportStep } from '@/components/onboarding/ImportStep'
import { PRESET_COLORS } from '@/components/accounts/ColorSwatchPicker'
import {
  buildInitialAccounts,
  buildInitialCategories,
  type OnboardingAccount,
  type OnboardingCategoryItem,
} from '@/components/onboarding/onboardingDefaults'
import type { OnboardingSetupRequest } from '@/api/onboarding'
import { OnboardingTestIds } from '@/testIds'

const STEP_ACCOUNTS = 0
const STEP_CATEGORIES = 1
const STEP_IMPORT = 2

export function OnboardingPage() {
  const [step, setStep] = useState(STEP_ACCOUNTS)
  const [accounts, setAccounts] = useState<OnboardingAccount[]>(buildInitialAccounts)
  const [categories, setCategories] = useState<OnboardingCategoryItem[]>(buildInitialCategories)

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

  // --- Account handlers ---

  function toggleAccount(id: string) {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a)))
  }

  function updateAccountBalance(id: string, cents: number) {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, initial_balance: cents } : a)))
  }

  function updateAccountDescription(id: string, description: string) {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, description } : a)))
  }

  function addAccount(name: string) {
    const usedColors = new Set(accounts.map((a) => a.avatar_background_color))
    const nextColor = PRESET_COLORS.find((c) => !usedColors.has(c)) ?? PRESET_COLORS[accounts.length % PRESET_COLORS.length]
    const id = `custom_${Date.now()}`
    setAccounts((prev) => [
      ...prev,
      { id, name, description: '', initial_balance: 0, avatar_background_color: nextColor, selected: true, isCustom: true },
    ])
  }

  function removeAccount(id: string) {
    setAccounts((prev) => prev.filter((a) => a.id !== id))
  }

  // --- Category handlers ---

  function toggleCategory(id: string) {
    setCategories((prev) =>
      prev.map((p) => {
        if (p.id === id) return { ...p, selected: !p.selected }
        return { ...p, children: p.children.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)) }
      }),
    )
  }

  function updateCategoryName(id: string, name: string) {
    setCategories((prev) =>
      prev.map((p) => {
        if (p.id === id) return { ...p, name }
        return { ...p, children: p.children.map((c) => (c.id === id ? { ...c, name } : c)) }
      }),
    )
  }

  function addParentCategory(name: string) {
    const id = `custom_${Date.now()}`
    setCategories((prev) => [
      ...prev,
      { id, name, emoji: '📌', selected: true, isCustom: true, children: [] },
    ])
  }

  function addChildCategory(parentId: string, name: string) {
    const id = `custom_${Date.now()}_child`
    setCategories((prev) =>
      prev.map((p) =>
        p.id === parentId
          ? { ...p, children: [...p.children, { id, name, emoji: '📌', selected: true, isCustom: true, children: [] }] }
          : p,
      ),
    )
  }

  function removeCategory(id: string) {
    setCategories((prev) => {
      const withoutParent = prev.filter((p) => p.id !== id)
      if (withoutParent.length < prev.length) return withoutParent
      return prev.map((p) => ({ ...p, children: p.children.filter((c) => c.id !== id) }))
    })
  }

  // --- Payload ---

  const payload = useMemo<OnboardingSetupRequest>(() => {
    const accs = accounts
      .filter((a) => a.selected)
      .map((a) => ({
        name: a.name,
        description: a.description || undefined,
        initial_balance: a.initial_balance,
        avatar_background_color: a.avatar_background_color,
      }))

    const cats = categories
      .filter((c) => c.selected)
      .map((p) => ({
        name: p.name,
        emoji: p.emoji,
        children: p.children
          .filter((c) => c.selected)
          .map((c) => ({ name: c.name, emoji: c.emoji })),
      }))

    return { accounts: accs, categories: cats }
  }, [accounts, categories])

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
              accounts={accounts}
              onToggle={toggleAccount}
              onUpdateBalance={updateAccountBalance}
              onUpdateDescription={updateAccountDescription}
              onAddAccount={addAccount}
              onRemoveAccount={removeAccount}
            />
          )}
          {step === STEP_CATEGORIES && (
            <CategoriesStep
              categories={categories}
              onToggle={toggleCategory}
              onUpdateName={updateCategoryName}
              onAddParent={addParentCategory}
              onAddChild={addChildCategory}
              onRemove={removeCategory}
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
