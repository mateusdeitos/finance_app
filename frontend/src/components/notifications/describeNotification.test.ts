import { describe, it, expect } from 'vitest'
import { describeNotification } from './describeNotification'
import { formatBalance } from '@/utils/formatCents'
import { Notifications } from '@/types/notifications'

function makeNotification(
  type: Notifications.NotificationType,
  entityType: Notifications.EntityType = 'charge',
): Notifications.Notification {
  return {
    id: 1,
    type,
    entity_type: entityType,
    entity_id: 10,
    read: false,
    created_at: new Date().toISOString(),
  }
}

const AMOUNT = 5000
const PARTNER = 'Ana'

describe('describeNotification', () => {
  // charge_received
  describe('charge_received', () => {
    it('known amount + description', () => {
      const result = describeNotification(makeNotification('charge_received'), {
        amount: AMOUNT,
        amountState: 'known',
        partnerName: PARTNER,
        description: 'Aluguel',
      })
      expect(result).toBe(`${PARTNER} te cobrou ${formatBalance(AMOUNT)}: Aluguel`)
    })

    it('known amount + null description omits colon portion', () => {
      const result = describeNotification(makeNotification('charge_received'), {
        amount: AMOUNT,
        amountState: 'known',
        partnerName: PARTNER,
        description: null,
      })
      expect(result).toBe(`${PARTNER} te cobrou ${formatBalance(AMOUNT)}`)
    })

    it('loading state degrades to no-amount copy', () => {
      const result = describeNotification(makeNotification('charge_received'), {
        amount: null,
        amountState: 'loading',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} criou uma cobrança para você`)
    })

    it('missing state uses dash in amount slot', () => {
      const result = describeNotification(makeNotification('charge_received'), {
        amount: null,
        amountState: 'missing',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} te cobrou —`)
    })
  })

  // charge_accepted
  describe('charge_accepted', () => {
    it('known amount', () => {
      const result = describeNotification(makeNotification('charge_accepted'), {
        amount: AMOUNT,
        amountState: 'known',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} aceitou sua cobrança de ${formatBalance(AMOUNT)}`)
    })

    it('loading state', () => {
      const result = describeNotification(makeNotification('charge_accepted'), {
        amount: null,
        amountState: 'loading',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} aceitou sua cobrança`)
    })

    it('missing state', () => {
      const result = describeNotification(makeNotification('charge_accepted'), {
        amount: null,
        amountState: 'missing',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} aceitou sua cobrança de —`)
    })
  })

  // split_created
  describe('split_created', () => {
    it('known amount', () => {
      const result = describeNotification(makeNotification('split_created', 'transaction'), {
        amount: AMOUNT,
        amountState: 'known',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} adicionou uma transação dividida de ${formatBalance(AMOUNT)}`)
    })

    it('loading state', () => {
      const result = describeNotification(makeNotification('split_created', 'transaction'), {
        amount: null,
        amountState: 'loading',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} adicionou uma transação dividida`)
    })

    it('missing state', () => {
      const result = describeNotification(makeNotification('split_created', 'transaction'), {
        amount: null,
        amountState: 'missing',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} adicionou uma transação dividida de —`)
    })
  })

  // split_updated
  describe('split_updated', () => {
    it('known amount', () => {
      const result = describeNotification(makeNotification('split_updated', 'transaction'), {
        amount: AMOUNT,
        amountState: 'known',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} atualizou uma transação dividida (${formatBalance(AMOUNT)})`)
    })

    it('loading state', () => {
      const result = describeNotification(makeNotification('split_updated', 'transaction'), {
        amount: null,
        amountState: 'loading',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} atualizou uma transação dividida`)
    })

    it('missing state uses dash in parentheses', () => {
      const result = describeNotification(makeNotification('split_updated', 'transaction'), {
        amount: null,
        amountState: 'missing',
        partnerName: PARTNER,
      })
      expect(result).toBe(`${PARTNER} atualizou uma transação dividida (—)`)
    })
  })

  // fallbacks
  describe('fallbacks', () => {
    it('null partnerName falls back to "Seu parceiro(a)"', () => {
      const result = describeNotification(makeNotification('charge_received'), {
        amount: AMOUNT,
        amountState: 'known',
        partnerName: null,
      })
      expect(result).toBe(`Seu parceiro(a) te cobrou ${formatBalance(AMOUNT)}`)
    })

    it('unknown type returns "Nova notificação"', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = describeNotification(makeNotification('unknown_type' as any), {
        amount: AMOUNT,
        amountState: 'known',
        partnerName: PARTNER,
      })
      expect(result).toBe('Nova notificação')
    })
  })
})
