import { describe, it, expect } from 'vitest'
import { buildTransactionSearchFromNotification } from './notificationNavigation'

describe('buildTransactionSearchFromNotification', () => {
  it('derives month (1-12), year, and query from a date + description', () => {
    const result = buildTransactionSearchFromNotification('2026-03-15T00:00:00-03:00', 'Aluguel')
    expect(result).toEqual({ month: 3, year: 2026, query: 'Aluguel' })
  })

  it('uses 1-based month (January → 1, December → 12)', () => {
    expect(buildTransactionSearchFromNotification('2026-01-01T12:00:00-03:00', 'x')?.month).toBe(1)
    expect(buildTransactionSearchFromNotification('2026-12-31T12:00:00-03:00', 'x')?.month).toBe(12)
  })

  it('falls back to empty query when description is null', () => {
    const result = buildTransactionSearchFromNotification('2026-07-04T00:00:00-03:00', null)
    expect(result).toEqual({ month: 7, year: 2026, query: '' })
  })

  it('returns null when the date is null (caller falls back to plain deep link)', () => {
    expect(buildTransactionSearchFromNotification(null, 'desc')).toBeNull()
  })

  it('returns null when the date is unparseable', () => {
    expect(buildTransactionSearchFromNotification('not-a-date', 'desc')).toBeNull()
  })
})
