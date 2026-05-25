import { ActionIcon, Group } from '@mantine/core'
import { MonthPickerInput } from '@mantine/dates'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import classes from './PeriodNavigator.module.css'

import '@mantine/dates/styles.css'

interface PeriodNavigatorProps {
  month: number
  year: number
  onPeriodChange: (month: number, year: number) => void
  disabled?: boolean
}

export function PeriodNavigator({ month, year, onPeriodChange, disabled }: PeriodNavigatorProps) {
  const value = `${year}-${String(month).padStart(2, '0')}-01`

  function goToPrev() {
    let m = month - 1
    let y = year
    if (m < 1) { m = 12; y -= 1 }
    onPeriodChange(m, y)
  }

  function goToNext() {
    let m = month + 1
    let y = year
    if (m > 12) { m = 1; y += 1 }
    onPeriodChange(m, y)
  }

  function handleChange(date: string | null) {
    if (!date) return
    // date is a YYYY-MM-DD string emitted by MonthPickerInput
    const [year, month] = date.split('-').map(Number)
    onPeriodChange(month, year)
  }

  return (
    <Group
      className={classes.root}
      gap={2}
      wrap="nowrap"
      inert={disabled || undefined}
      style={{ opacity: disabled ? 0.5 : 1, transition: 'opacity 150ms ease' }}
    >
      <ActionIcon variant="subtle" color="gray" size="sm" onClick={goToPrev} aria-label="Mês anterior">
        <IconChevronLeft size={16} />
      </ActionIcon>
      <MonthPickerInput
        value={value}
        onChange={handleChange}
        valueFormat="MM/YYYY"
        size="xs"
        disabled={disabled}
        classNames={{ input: classes.input }}
        aria-label="Período"
      />
      <ActionIcon variant="subtle" color="gray" size="sm" onClick={goToNext} aria-label="Próximo mês">
        <IconChevronRight size={16} />
      </ActionIcon>
    </Group>
  )
}
