import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Stack, TextInput, Button, Group, Alert } from '@mantine/core'
import { useResetFormOnChange } from '@/hooks/useResetFormOnChange'

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  emoji: z.string().optional(),
})

export type CategoryFormValues = z.infer<typeof schema>

interface Props {
  initialValues?: Partial<CategoryFormValues>
  onSubmit: (values: CategoryFormValues) => void
  isPending: boolean
  error?: string
}

export function CategoryForm({ initialValues, onSubmit, isPending, error }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', emoji: '', ...initialValues },
  })

  const resetValues = useMemo<CategoryFormValues | undefined>(
    () => (initialValues ? { name: '', emoji: '', ...initialValues } : undefined),
    [initialValues],
  )
  useResetFormOnChange(reset, resetValues)

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="md">
        {error && (
          <Alert color="red" title="Erro" variant="light">
            {error}
          </Alert>
        )}

        <TextInput
          label="Nome"
          required
          {...register('name')}
          error={errors.name?.message}
        />

        <TextInput
          label="Emoji"
          placeholder="ex: 🍕"
          maxLength={10}
          {...register('emoji')}
          error={errors.emoji?.message}
        />

        <Group justify="flex-end" mt="sm">
          <Button type="submit" loading={isPending}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
