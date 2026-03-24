import { useRef, forwardRef, useImperativeHandle } from 'react'
import { TextInput } from '@mantine/core'

interface Props {
  value: number // in cents
  onChange: (cents: number) => void
  error?: string
  label?: string
  required?: boolean
}

export interface CurrencyInputHandle {
  focus: () => void
}

const MAX_CENTS = 9_999_999_999 // R$ 99.999.999,99

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export const CurrencyInput = forwardRef<CurrencyInputHandle, Props>(function CurrencyInput(
  { value, onChange, error, label, required }: Props,
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Let browser handle shortcuts and navigation
    if (e.ctrlKey || e.metaKey) return
    if (['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return

    e.preventDefault()

    const el = e.currentTarget
    const allSelected = el.selectionStart === 0 && el.selectionEnd === el.value.length

    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (allSelected) {
        onChange(0)
      } else if (e.key === 'Backspace') {
        onChange(Math.floor(value / 10))
      }
      return
    }

    if (/^\d$/.test(e.key)) {
      const next = allSelected ? parseInt(e.key, 10) : value * 10 + parseInt(e.key, 10)
      if (next <= MAX_CENTS) onChange(next)
    }
  }

  return (
    <TextInput
      ref={inputRef}
      label={label}
      required={required}
      value={formatCents(value)}
      onChange={() => {}}
      onKeyDown={handleKeyDown}
      onFocus={(e) => e.currentTarget.select()}
      error={error}
      inputMode="numeric"
    />
  )
})
