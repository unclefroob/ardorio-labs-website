import { describe, expect, it } from 'vitest'
import type { RosterioAccount } from '../api/contract'
import type { Company, Deal } from '../data/types'
import { accountTab, defaultProduct, isRosterioTab, statusTab, trialDaysLeft, wonCustomers, wonThisQuarter } from './customers'
import { standing } from '../data/rosterio'

const NOW = Date.parse('2026-10-11T00:00:00Z')
const acct = (o: Partial<RosterioAccount> = {}): RosterioAccount => ({ id: 'a', name: 'A', isActive: true, isTrial: false, memberCount: 1, ...o })
const co = (id: string, archived = false): Company => ({ id, name: id, archived } as unknown as Company)
const deal = (id: string, companyId: string, o: Partial<Deal> = {}): Deal =>
  ({ id, title: id, name: id, businessId: 'pth', companyId, status: 'won', value: 1000, closedAt: '2026-09-01T00:00:00Z', stageChangedAt: '2026-08-01T00:00:00Z', ownerId: 'u', ...o }) as unknown as Deal

describe('which tab an account belongs to', () => {
  it('active and not on a trial is Paid', () => expect(accountTab(acct(), NOW)).toBe('paid'))
  it('a running trial is Trials, including one that ends today and one with no end date', () => {
    expect(accountTab(acct({ isTrial: true, trialEndDate: '2026-10-15T00:00:00Z' }), NOW)).toBe('trials')
    expect(accountTab(acct({ isTrial: true, trialEndDate: '2026-10-11T00:00:00Z' }), NOW)).toBe('trials')
    expect(accountTab(acct({ isTrial: true }), NOW)).toBe('trials')
  })
  it('an ended trial is Ended', () => expect(accountTab(acct({ isTrial: true, trialEndDate: '2026-07-01T00:00:00Z' }), NOW)).toBe('ended'))
  it('a cancelled or switched-off account is Ended, even if its status is missing or it is flagged as a trial', () => {
    expect(accountTab(acct({ isActive: false, status: 'cancelled' }), NOW)).toBe('ended')
    expect(accountTab(acct({ isActive: false }), NOW)).toBe('ended')
    expect(accountTab(acct({ isActive: false, isTrial: true, trialEndDate: '2026-12-01T00:00:00Z' }), NOW)).toBe('ended')
  })
  it('an account with no status at all that is active is Paid', () => expect(accountTab(acct({ status: undefined }), NOW)).toBe('paid'))
  it('statusTab and trialDaysLeft read the standing', () => {
    expect(statusTab(standing(acct(), NOW))).toBe('paid')
    expect(trialDaysLeft(standing(acct({ isTrial: true, trialEndDate: '2026-10-15T00:00:00Z' }), NOW))).toBe(4)
    expect(trialDaysLeft(standing(acct(), NOW))).toBeUndefined()
  })
  it('knows the tab names', () => {
    expect(isRosterioTab('needs')).toBe(true)
    expect(isRosterioTab('all')).toBe(false)
  })
})

describe('customers of a product with no account feed', () => {
  it('a company with several won deals is one customer: summed value, most recent deal', () => {
    const r = wonCustomers([deal('d1', 'c1', { value: 24000, closedAt: '2026-09-03T00:00:00Z' }), deal('d2', 'c1', { value: 1000, closedAt: '2026-06-01T00:00:00Z' })], [co('c1')], 'pth')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ value: 25000, deals: 2, wonOn: '2026-09-03T00:00:00Z' })
    expect(r[0].deal.id).toBe('d1')
  })
  it('open and lost deals do not make a customer', () => {
    expect(wonCustomers([deal('d1', 'c1', { status: 'open' }), deal('d2', 'c1', { status: 'lost' })], [co('c1')], 'pth')).toEqual([])
  })
  it('archived companies, unknown companies and other businesses are left out', () => {
    expect(wonCustomers([deal('d1', 'c1')], [co('c1', true)], 'pth')).toEqual([])
    expect(wonCustomers([deal('d1', 'missing')], [co('c1')], 'pth')).toEqual([])
    expect(wonCustomers([deal('d1', 'c1', { businessId: 'ros' })], [co('c1')], 'pth')).toEqual([])
  })
  it('falls back to the stage change date when a deal has no close date, and sorts newest first', () => {
    const r = wonCustomers([deal('d1', 'c1', { closedAt: null, stageChangedAt: '2026-01-01T00:00:00Z' }), deal('d2', 'c2', { closedAt: '2026-05-01T00:00:00Z' })], [co('c1'), co('c2')], 'pth')
    expect(r.map(x => x.company.id)).toEqual(['c2', 'c1'])
    expect(r[1].wonOn).toBe('2026-01-01T00:00:00Z')
  })
  it('counts the deals won this calendar quarter', () => {
    const ds = [deal('d1', 'c1', { closedAt: '2026-10-02T00:00:00' }), deal('d2', 'c1', { closedAt: '2026-09-30T00:00:00' }), deal('d3', 'c2', { closedAt: '2026-11-01T00:00:00' }), deal('d4', 'c3', { closedAt: '2026-10-03T00:00:00' })]
    expect(wonThisQuarter(ds, [co('c1'), co('c2'), co('c3', true)], 'pth', new Date(2026, 10, 20))).toBe(2)
  })
})

describe('the product the page opens on', () => {
  it('an explicit choice the viewer belongs to wins', () => expect(defaultProduct(['ros', 'pth'], 'pth', 'ros')).toBe('pth'))
  it('a choice the viewer does not belong to is ignored', () => expect(defaultProduct(['ros'], 'pth', null)).toBe('ros'))
  it('then the workspace they are in, then the first they belong to', () => {
    expect(defaultProduct(['ard', 'pth'], undefined, 'pth')).toBe('pth')
    expect(defaultProduct(['ard', 'pth'], undefined, 'ros')).toBe('ard')
    expect(defaultProduct(['ard', 'pth'], undefined, null)).toBe('ard')
  })
  it('nothing when they belong to nothing', () => expect(defaultProduct([], undefined, null)).toBeUndefined())
})
