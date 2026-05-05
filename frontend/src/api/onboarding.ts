const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export interface OnboardingStatus {
  completed: boolean
}

export interface OnboardingAccountInput {
  name: string
  description?: string
  initial_balance: number
  avatar_background_color?: string
}

export interface OnboardingCategoryInput {
  name: string
  emoji?: string
  children?: OnboardingCategoryInput[]
}

export interface OnboardingSetupRequest {
  accounts: OnboardingAccountInput[]
  categories: OnboardingCategoryInput[]
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  const res = await fetch(`${apiUrl}/api/onboarding/status`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch onboarding status')
  return res.json()
}

export async function completeOnboarding(payload: OnboardingSetupRequest): Promise<void> {
  const res = await fetch(`${apiUrl}/api/onboarding/complete`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? 'Failed to complete onboarding')
  }
}
