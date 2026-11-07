import { describe, expect, it } from 'vitest'
import type { RosterioAccount, RosterioBilling, RosterioInvoice } from '../api/contract'
import { accountCollection, type AccountCollection } from '../shared/rosterioCollection'
import { billingPill, listBillingPill } from './rosterioBilling'

const acct = (o: Partial<RosterioAccount> = {}): RosterioAccount => ({ id: 'a1', name: 'Acme', isActive: true, isTrial: false, memberCount: 3, ...o })
const none = new Map<string, AccountCollection>()
const NOW = Date.parse('2026-11-07T00:00:00Z')
const inv = (o: Partial<RosterioInvoice> = {}): RosterioInvoice => ({
  id: 'i1', number: 'RS-1', accountId: 'a1', companyId: null, customerName: 'Acme', status: 'open', failed: false, overdue: false,
  amountDueCents: 12000, amountPaidCents: 0, amountRemainingCents: 12000, currency: 'aud', createdAt: '2026-11-01T00:00:00Z', dueAt: null, paidAt: null,
  periodStart: null, periodEnd: null, attemptCount: 0, nextAttemptAt: null, lastError: null, hostedUrl: null, pdfUrl: null, customerId: 'cus_1', xero: null, xeroContact: null, ...o,
})
const states = (...l: RosterioInvoice[]): Map<string, AccountCollection> => new Map([['a1', accountCollection(l, NOW)!]])

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

  it('an account with no price says nothing', () => {
    expect(listBillingPill(acct({ pricingSource: null }), none)).toBeNull()
    expect(listBillingPill(acct(), none)).toBeNull()
  })

  it('an account with invoices reads from them: the worst open state and what is owing', () => {
    const custom = acct({ pricingSource: 'custom', billingState: 'active' })
    expect(listBillingPill(custom, states(inv({ attemptCount: 2 })))).toEqual({ label: 'Failed, no retries left', tone: 'bad', sub: 'A$120.00 owing' })
    expect(listBillingPill(custom, states(inv({ dueAt: '2026-11-02T00:00:00Z' })))).toEqual({ label: 'Overdue', tone: 'bad', sub: 'A$120.00 owing' })
    expect(listBillingPill(acct({ pricingSource: 'plan' }), states(inv({ attemptCount: 1, nextAttemptAt: '2026-11-10T00:00:00Z' })))?.tone).toBe('warn')
    expect(listBillingPill(custom, states(inv({ dueAt: '2026-11-21T00:00:00Z' })))).toEqual({ label: 'Open', tone: 'info', sub: 'A$120.00 owing' })
  })

  it('stopped billing outranks Paid up', () => {
    const paid = inv({ status: 'paid', amountRemainingCents: 0, paidAt: '2026-10-01T00:00:00Z' })
    expect(listBillingPill(acct({ pricingSource: 'custom', billingState: 'stopped' }), states(paid))?.label).toBe('Not billed yet')
  })

  it('a clean account is Paid up, ahead of the checkout and billing-state pills', () => {
    const paid = inv({ status: 'paid', amountRemainingCents: 0, amountPaidCents: 12000 })
    expect(listBillingPill(acct({ pricingSource: 'plan' }), states(paid))).toEqual({ label: 'Paid up', tone: 'ok' })
    expect(listBillingPill(acct({ pricingSource: 'custom', billingState: 'active' }), states(paid))?.label).toBe('Paid up')
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
