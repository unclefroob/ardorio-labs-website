import { describe, expect, it } from 'vitest'
import type { Deal } from '../data/types'
import { customerOf } from './customerOf'

const deal = (o: Partial<Deal>): Deal => ({ id: 'd', name: 'Rostering', companyId: 'co1', businessId: 'ard', status: 'won', archived: false, ...o } as Deal)

describe('is this company a paying customer of this business', () => {
  it('a won deal in this business makes it one', () => {
    expect(customerOf({ id: 'co1' }, 'ard', { deals: [deal({})] })).toEqual({ customer: true, why: 'Won: Rostering' })
    expect(customerOf({ id: 'co1' }, 'ard', { deals: [deal({}), deal({ id: 'd2' })] }).why).toBe('2 won deals')
  })

  it('an open, archived or other-business deal does not', () => {
    for (const d of [deal({ status: 'open' }), deal({ archived: true }), deal({ businessId: 'ros' }), deal({ companyId: 'co2' })]) {
      expect(customerOf({ id: 'co1' }, 'ard', { deals: [d] }).customer).toBe(false)
    }
  })

  it('Rosterio: a live account is a customer, a trial is not', () => {
    expect(customerOf({ id: 'co1' }, 'ros', { deals: [], rosterio: { state: 'provisioned', plan: 'pro' } })).toEqual({ customer: true, why: 'Rosterio account (pro)' })
    expect(customerOf({ id: 'co1' }, 'ros', { deals: [], rosterio: { state: 'provisioned', isTrial: true } })).toEqual({ customer: false, why: 'On a Rosterio trial' })
  })

  it('marked Customer on the relationship counts; nothing at all does not', () => {
    expect(customerOf({ id: 'co1' }, 'pth', { deals: [], rel: { status: 'Customer' } }).customer).toBe(true)
    expect(customerOf({ id: 'co1' }, 'pth', { deals: [] })).toEqual({ customer: false, why: '' })
    expect(customerOf(undefined, 'ard', { deals: [] }).customer).toBe(false)
  })
})
