import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  completeOnboarding,
  fetchOnboardingStatus,
  type OnboardingSetupRequest,
  type OnboardingStatus,
} from '@/api/onboarding'
import { QueryKeys } from '@/utils/queryKeys'

export function useOnboardingStatus<T = OnboardingStatus>(select?: (data: OnboardingStatus) => T) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Onboarding],
    queryFn: fetchOnboardingStatus,
    staleTime: 5 * 60 * 1000,
    select,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.Onboarding] })
  return { query, invalidate }
}

interface CompleteOptions {
  onSuccess?: () => void
}

export function useCompleteOnboarding({ onSuccess }: CompleteOptions = {}) {
  const mutation = useMutation({
    mutationFn: (payload: OnboardingSetupRequest) => completeOnboarding(payload),
    onSuccess,
  })
  return { mutation }
}
