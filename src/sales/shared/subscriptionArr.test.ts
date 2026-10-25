import { describe, expect, it } from 'vitest'
import type { Deal } from '../data/types'
import { account } from '../testing/rosterioWorld'
import { payingAccounts, subscriptionArr } from './subscriptionArr'

const deal = (id: string, businessId: string, value: number, over: Partial<Deal> = {}) => ({ id, businessId, value, status: 'won', recurring: true, ...over }) as Deal
const paid = (id: string, monthlyCost?: number) => account({ id, name: id, ...(monthlyCost === undefined ? {} : { monthlyCost }) })

describe('subscriptionArr', () => {
  const deals = [deal('r1', 'ros', 30000), deal('a1', 'adv', 12000), deal('p1', 'pth', 8000), deal('o', 'adv', 5000, { status: 'open' }), deal('n', 'adv', 900, { recurring: false })]

  it('uses Rosterio accounts for Rosterio and leaves its won deals out, so no customer counts twice', () => {
    const a = subscriptionArr({ deals, rosterioInView: true, filtered: false, paying: [paid('x', 1000), paid('y', 500)] })
    expect(a).toMatchObject({ fromAccounts: 18000, fromDeals: 20000, total: 38000, priced: 2, paying: 2, rosterioNote: null })
  })
  it('counts an unpriced paying account in the denominator and adds nothing for it', () => {
    const a = subscriptionArr({ deals, rosterioInView: true, filtered: false, paying: [paid('x', 1000), paid('y')] })
    expect(a).toMatchObject({ fromAccounts: 12000, priced: 1, paying: 2 })
  })
  it('falls back to the deals, with a note, when Rosterio sent no prices', () => {
    const a = subscriptionArr({ deals, rosterioInView: true, filtered: false, paying: [paid('x'), paid('y')] })
    expect(a).toMatchObject({ total: 50000, fromAccounts: 0, rosterioNote: 'no-prices' })
  })
  it('falls back to the deals while the accounts have not been read', () => {
    expect(subscriptionArr({ deals, rosterioInView: true, filtered: false })).toMatchObject({ total: 50000, rosterioNote: 'no-prices' })
  })
  it('does not use accounts when an owner, team, source or Mine filter is on, because accounts have no owner', () => {
    expect(subscriptionArr({ deals, rosterioInView: true, filtered: true, paying: [paid('x', 1000)] })).toMatchObject({ total: 50000, rosterioNote: 'filtered' })
  })
  it('ignores accounts and says nothing about Rosterio when it is not in view', () => {
    expect(subscriptionArr({ deals: deals.filter(d => d.businessId !== 'ros'), rosterioInView: false, filtered: false, paying: [paid('x', 1000)] })).toMatchObject({ total: 20000, fromAccounts: 0, rosterioNote: null })
  })
})

describe('payingAccounts', () => {
  it('keeps active paying accounts, and leaves out trials, ended accounts and test accounts', () => {
    const accounts = [paid('a'), account({ id: 'b', isTrial: true, trialEndDate: '2999-01-01T00:00:00.000Z' }), account({ id: 'c', isActive: false, status: 'cancelled' }), paid('t')]
    expect(payingAccounts(accounts, new Set(['t'])).map(a => a.id)).toEqual(['a'])
  })
})
