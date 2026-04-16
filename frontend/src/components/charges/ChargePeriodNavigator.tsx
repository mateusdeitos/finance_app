import { ActionIcon, Group } from '@mantine/core'
import { DateValue, MonthPickerInput } from '@mantine/dates'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import classes from './ChargePeriodNavigator.module.css'

import '@mantine/dates/styles.css'

interface ChargePeriodNavigatorProps {
  month: number
  year: number
}

export function ChargePeriodNavigator({ month, year }: ChargePeriodNavigatorProps) {
  const navigate = useNavigate({ from: '/charges' })
  const search = useSearch({ from: '/_authenticated/charges' })

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
    // Parse year/month directly to avoid UTC->local timezone shift
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
