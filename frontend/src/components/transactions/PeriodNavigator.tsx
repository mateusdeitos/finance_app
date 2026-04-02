import { ActionIcon, Group } from '@mantine/core'
import { DateValue, MonthPickerInput } from '@mantine/dates'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import classes from './PeriodNavigator.module.css'

import '@mantine/dates/styles.css'

interface PeriodNavigatorProps {
  month: number
  year: number
}

export function PeriodNavigator({ month, year }: PeriodNavigatorProps) {
  const navigate = useNavigate({ from: '/transactions' })
  const search = useSearch({ from: '/_authenticated/transactions' })

  const value = new Date(year, month - 1)

  function goToPrev() {
    let m = month - 1
    let y = year
    if (m < 1) { m = 12; y -= 1 }
    navigate({ search: { ...search, month: m, year: y } })
  }

  function goToNext() {
    let m = month + 1
    let y = year
    if (m > 12) { m = 1; y += 1 }
    navigate({ search: { ...search, month: m, year: y } })
  }

  function handleChange(date: DateValue) {
    if (!date) return
    // date is an ISO string like "2011-02-01T00:00:00.000Z"
    // Parse year/month directly to avoid UTC→local timezone shift
    const [year, month] = date.toISOString().split('-').map(Number)
    navigate({ search: { ...search, month, year } })
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
