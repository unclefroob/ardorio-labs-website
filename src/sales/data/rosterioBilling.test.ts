import { describe, expect, it } from 'vitest'
import type { RosterioAccount, RosterioBilling } from '../api/contract'
import { billingPill, listBillingPill } from './rosterioBilling'

const acct = (o: Partial<RosterioAccount> = {}): RosterioAccount => ({ id: 'a1', name: 'Acme', isActive: true, isTrial: false, memberCount: 3, ...o })
const none = new Set<string>()

describe('Billing column on Customers › Rosterio', () => {
  it('a managed account with no running billing is not billed yet', () => {
    expect(listBillingPill(acct({ pricingSource: 'custom', billingState: null }), none)).toEqual({ label: 'Not billed yet', tone: 'warn' })
    expect(listBillingPill(acct({ pricingSource: 'custom' }), none)?.label).toBe('Not billed yet')
    expect(listBillingPill(acct({ pricingSource: 'custom', billingState: 'stopped' }), none)?.label).toBe('Not billed yet')
  })

  it('a managed account shows its state in a word', () => {
    const word = (s: NonNullable<RosterioAccount['billingState']>): string | undefined => listBillingPill(acct({ pricingSource: 'custom', billingState: s }), none)?.label
    expect(word('scheduled')).toBe('Scheduled')
    expect(word('awaiting_card')).toBe('Waiting for a card')
    expect(word('active')).toBe('Billing')
    expect(word('stopping')).toBe('Ending')
    expect(word('starting')).toBe('Setting up…')
  })

  it('a paying self-serve account pays at checkout', () => {
    expect(listBillingPill(acct({ pricingSource: 'plan' }), none)?.label).toBe('Paid · checkout')
    expect(listBillingPill(acct({ pricingSource: 'plan', isTrial: true }), none)).toBeNull()
  })

  it('a failed invoice outranks everything, and an account with no price says nothing', () => {
    expect(listBillingPill(acct({ pricingSource: 'custom', billingState: 'active' }), new Set(['a1']))).toEqual({ label: 'Payment failed', tone: 'bad' })
    expect(listBillingPill(acct({ pricingSource: 'plan' }), new Set(['a1']))?.label).toBe('Payment failed')
    expect(listBillingPill(acct({ pricingSource: null }), none)).toBeNull()
    expect(listBillingPill(acct(), none)).toBeNull()
  })
})

describe('Billing chip on the company card', () => {
  const view = (o: Partial<RosterioBilling> = {}): RosterioBilling => ({
    accountId: 'a1', accountName: 'Acme', timezone: 'Australia/Sydney', today: '2026-10-17', billingEmail: null, terms: null, amounts: null, options: [], billing: null, canStart: false, cannotStartReason: null, ...o,
  })
  it('without terms the account is self-serve; with terms and no billing it is not billed yet', () => {
    expect(billingPill(view()).label).toBe('Self-serve: pays at checkout')
    expect(billingPill(view({ terms: { billingModel: 'flat', amountCents: 1, interval: 'monthly', effectiveFrom: '2026-01-01', effectiveUntil: null, contractReference: null, status: 'active' } })).label).toBe('Not billed yet')
  })
})
