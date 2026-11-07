import { describe, expect, it } from 'vitest'
import type { RosterioInvoice } from '../api/contract'
import { accountCollection, ageBucket, ageText, collectionOf, collectionTotals } from './rosterioCollection'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-07T00:00:00Z')
const ago = (days: number): string => new Date(NOW - days * DAY).toISOString()
const inv = (o: Partial<RosterioInvoice> = {}): RosterioInvoice => ({
  id: 'i1', number: 'RS-1', accountId: 'acc1', companyId: null, customerName: 'Spuntino', status: 'open', failed: false, overdue: false,
  amountDueCents: 10000, amountPaidCents: 0, amountRemainingCents: 10000, currency: 'aud', createdAt: ago(3), dueAt: null, paidAt: null,
  periodStart: null, periodEnd: null, attemptCount: 0, nextAttemptAt: null, lastError: null, hostedUrl: null, pdfUrl: null, customerId: 'cus_1', xero: null, xeroContact: null, ...o,
})

describe('collectionOf', () => {
  it('failed with no retries left is late and bad', () => {
    const c = collectionOf(inv({ attemptCount: 2 }), NOW)
    expect(c).toMatchObject({ key: 'failed-final', label: 'Failed, no retries left', tone: 'bad', rank: 0, late: true, owingCents: 10000 })
  })

  it('failed with a retry coming is warn, not late, and names the date', () => {
    const c = collectionOf(inv({ attemptCount: 1, nextAttemptAt: '2026-11-10T00:00:00Z' }), NOW)
    expect(c).toMatchObject({ key: 'retrying', tone: 'warn', rank: 1, late: false })
    expect(c.label).toMatch(/^Failed, retrying 10 Nov/)
  })

  it('a retrying invoice is never overdue, even well past its due date', () => {
    expect(collectionOf(inv({ attemptCount: 1, nextAttemptAt: '2026-11-10T00:00:00Z', dueAt: ago(30) }), NOW).key).toBe('retrying')
  })

  it('a first charge still to come is not overdue, whatever the due date says', () => {
    expect(collectionOf(inv({ nextAttemptAt: '2026-11-10T00:00:00Z', dueAt: ago(5) }), NOW)).toMatchObject({ key: 'open', late: false })
  })

  it('an open invoice with nothing owing has no age and does not hold an account back from Paid up', () => {
    const settled = inv({ amountRemainingCents: 0 })
    expect(collectionOf(settled, NOW)).toMatchObject({ key: 'open', owingCents: 0, ageDays: null })
    expect(accountCollection([settled, inv({ id: 'p', status: 'paid', amountRemainingCents: 0, paidAt: ago(1) })], NOW)?.key).toBe('paid-up')
  })

  it('a paid date in the future is not collected yet', () => {
    expect(collectionTotals([inv({ status: 'paid', amountPaidCents: 500, amountRemainingCents: 0, paidAt: ago(-2) })], NOW).collected30).toBe(0)
  })

  it('counts failed invoices with no retries left apart from those retrying', () => {
    const t = collectionTotals([inv({ id: 'a', attemptCount: 1, nextAttemptAt: '2026-11-10T00:00:00Z' }), inv({ id: 'b', attemptCount: 2 })], NOW)
    expect(t).toMatchObject({ failedCount: 2, finalCount: 1, overdueCount: 1, atRiskCount: 2 })
  })

  it('past its due date with no attempt is overdue', () => {
    expect(collectionOf(inv({ dueAt: ago(1) }), NOW)).toMatchObject({ key: 'overdue', label: 'Overdue', tone: 'bad', rank: 2, late: true })
  })

  it('due exactly now is not yet overdue, a second later is', () => {
    expect(collectionOf(inv({ dueAt: new Date(NOW).toISOString() }), NOW).key).toBe('open')
    expect(collectionOf(inv({ dueAt: new Date(NOW - 1000).toISOString() }), NOW).key).toBe('overdue')
  })

  it('an open invoice with no due date, or one in the future, is plain open and never red', () => {
    for (const dueAt of [null, '2026-11-21T00:00:00Z']) {
      expect(collectionOf(inv({ dueAt }), NOW)).toMatchObject({ key: 'open', label: 'Open', tone: 'info', rank: 3, late: false })
    }
  })

  it('nothing owing is plain open, however many attempts or however late', () => {
    expect(collectionOf(inv({ amountRemainingCents: 0, attemptCount: 3, dueAt: ago(10) }), NOW)).toMatchObject({ key: 'open', owingCents: 0, late: false })
  })

  it('ignores the API overdue and failed flags', () => {
    expect(collectionOf(inv({ overdue: true, failed: true }), NOW).key).toBe('open')
  })

  it('other statuses', () => {
    expect(collectionOf(inv({ status: 'paid' }), NOW)).toMatchObject({ key: 'paid', label: 'Paid', tone: 'ok', rank: 4, owingCents: 0, ageDays: null })
    expect(collectionOf(inv({ status: 'uncollectible' }), NOW)).toMatchObject({ key: 'written-off', label: 'Written off', tone: '', rank: 5 })
    expect(collectionOf(inv({ status: 'void' }), NOW)).toMatchObject({ key: 'void', label: 'Void', tone: '', rank: 6 })
    expect(collectionOf(inv({ status: 'draft' }), NOW)).toMatchObject({ key: 'draft', label: 'Draft', tone: '', rank: 7 })
  })

  it('age is whole days since the invoice date, for open invoices only, never negative', () => {
    expect(collectionOf(inv({ createdAt: ago(12) }), NOW).ageDays).toBe(12)
    expect(collectionOf(inv({ createdAt: new Date(NOW - 12 * DAY + 1000).toISOString() }), NOW).ageDays).toBe(11)
    expect(collectionOf(inv({ createdAt: new Date(NOW - 1000).toISOString() }), NOW).ageDays).toBe(0)
    expect(collectionOf(inv({ createdAt: ago(-2) }), NOW).ageDays).toBe(0)
    expect(collectionOf(inv({ status: 'paid', createdAt: ago(12) }), NOW).ageDays).toBeNull()
  })
})

describe('ageBucket and ageText', () => {
  it('buckets at 7/8 and 30/31', () => {
    expect([0, 7, 8, 30, 31].map(ageBucket)).toEqual(['0-7', '0-7', '8-30', '8-30', '30+'])
  })
  it('reads days plainly', () => {
    expect([0, 1, 12].map(ageText)).toEqual(['Today', '1 day', '12 days'])
  })
})

describe('accountCollection', () => {
  it('the worst open state wins, with the total owing and the oldest age', () => {
    const a = accountCollection([
      inv({ id: 'a', createdAt: ago(40) }),
      inv({ id: 'b', createdAt: ago(10), attemptCount: 1, nextAttemptAt: '2026-11-10T00:00:00Z', amountRemainingCents: 5000 }),
      inv({ id: 'c', createdAt: ago(5), dueAt: ago(1), amountRemainingCents: 2500 }),
      inv({ id: 'p', status: 'paid' }),
    ], NOW)
    expect(a).toMatchObject({ key: 'retrying', tone: 'warn', late: false, owingCents: 17500, oldestDays: 40 })
    expect(a?.worst?.id).toBe('b')
  })

  it('failed-final beats retrying, and the oldest of equals is the worst', () => {
    const a = accountCollection([
      inv({ id: 'x', createdAt: ago(5), attemptCount: 1 }),
      inv({ id: 'y', createdAt: ago(20), attemptCount: 1 }),
      inv({ id: 'z', attemptCount: 1, nextAttemptAt: '2026-11-10T00:00:00Z' }),
    ], NOW)
    expect(a).toMatchObject({ key: 'failed-final', late: true })
    expect(a?.worst?.id).toBe('y')
  })

  it('nothing owing and a paid invoice is Paid up', () => {
    expect(accountCollection([inv({ status: 'paid' }), inv({ id: 'v', status: 'void' })], NOW)).toMatchObject({ key: 'paid-up', label: 'Paid up', tone: 'ok', owingCents: 0, oldestDays: null, worst: null })
  })

  it('only void or draft invoices, or none, give nothing', () => {
    expect(accountCollection([], NOW)).toBeNull()
    expect(accountCollection([inv({ status: 'void' }), inv({ status: 'draft' })], NOW)).toBeNull()
  })

  it('void and draft are ignored beside a live invoice', () => {
    expect(accountCollection([inv({ status: 'void', createdAt: ago(90) }), inv({ id: 'o' })], NOW)).toMatchObject({ key: 'open', oldestDays: 3 })
  })
})

describe('collectionTotals', () => {
  const LIST = [
    inv({ id: 'ff', attemptCount: 2, amountRemainingCents: 1000 }),
    inv({ id: 'rt', attemptCount: 1, nextAttemptAt: '2026-11-10T00:00:00Z', amountRemainingCents: 2000 }),
    inv({ id: 'od', dueAt: ago(2), amountRemainingCents: 4000 }),
    inv({ id: 'op', dueAt: '2026-11-21T00:00:00Z', amountRemainingCents: 8000 }),
    inv({ id: 'pd', status: 'paid', amountPaidCents: 500, paidAt: ago(5) }),
    inv({ id: 'v', status: 'void', amountRemainingCents: 9999 }),
  ]

  it('adds up each figure from the raw fields', () => {
    expect(collectionTotals(LIST, NOW)).toEqual({ collected30: 500, outstanding: 15000, overdue: 5000, overdueCount: 2, atRisk: 7000, atRiskCount: 3, failedCount: 2, finalCount: 1 })
  })

  it('collected counts paid invoices paid in the last 30 days: day 30 in, day 31 out, unpaid-date out', () => {
    const paid = (id: string, paidAt: string | null) => inv({ id, status: 'paid', amountPaidCents: 100, paidAt })
    expect(collectionTotals([paid('a', ago(30)), paid('b', ago(31)), paid('c', null)], NOW).collected30).toBe(100)
  })

  it('nothing owing leaves every figure at zero', () => {
    expect(collectionTotals([inv({ amountRemainingCents: 0, attemptCount: 1 })], NOW)).toEqual({ collected30: 0, outstanding: 0, overdue: 0, overdueCount: 0, atRisk: 0, atRiskCount: 0, failedCount: 0, finalCount: 0 })
  })
})
