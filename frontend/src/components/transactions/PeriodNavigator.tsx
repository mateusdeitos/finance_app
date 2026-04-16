import { ActionIcon, Group } from '@mantine/core'
import { DateValue, MonthPickerInput } from '@mantine/dates'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import classes from './PeriodNavigator.module.css'

import '@mantine/dates/styles.css'

interface PeriodNavigatorProps {
  month: number
  year: number
  onPeriodChange: (month: number, year: number) => void
}

export function PeriodNavigator({ month, year, onPeriodChange }: PeriodNavigatorProps) {
  const value = new Date(year, month - 1)

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

  function handleChange(date: DateValue) {
    if (!date) return
    // date is an ISO string like "2011-02-01T00:00:00.000Z"
    // Parse year/month directly to avoid UTC→local timezone shift
    const [year, month] = date.toISOString().split('-').map(Number)
    onPeriodChange(month, year)
  }

  return (
    <Group className={classes.root} gap="xs" wrap="nowrap">
      <ActionIcon variant="subtle" color="gray" onClick={goToPrev} aria-label="Mês anterior">
        <IconChevronLeft size={18} />
      </ActionIcon>
      <MonthPickerInput
        value={value}
        onChange={handleChange}
        valueFormat="MM/YYYY"
        classNames={{ input: classes.input }}
        aria-label="Período"
      />
      <ActionIcon variant="subtle" color="gray" onClick={goToNext} aria-label="Próximo mês">
        <IconChevronRight size={18} />
      </ActionIcon>
    </Group>
  )
}
