import { describe, expect, it } from 'vitest'
import type { BillingPlan, InvoiceDto } from '../api/contract'
import { dto } from '../testing/invoicingWorld'
import { billingProgress, companyBilling, latestInvoices, scheduleRows, wonNotInvoiced } from './billing'
import { buildMarkTest, deleteNumberMatches, filterInvoices, isTest, milestoneStatus, tabCounts, testMenu, tileFacts, withoutTest } from './invoices'
import type { Deal, Company } from '../data/types'

const T = { markedAt: '2026-10-12T00:00:00Z', markedBy: 'u-me', reason: 'Practice' }
const real = (o: Partial<InvoiceDto> = {}) => dto({ id: 'r', ...o })
const test = (o: Partial<InvoiceDto> = {}) => dto({ id: 't', test: T, ...o })

describe('buildMarkTest', () => {
  it('trims and accepts 1..200 characters of plain text', () => {
    expect(buildMarkTest('  Practice  ')).toEqual({ ok: true, input: { reason: 'Practice' } })
    expect(buildMarkTest('x'.repeat(200)).ok).toBe(true)
  })
  it('rejects empty, whitespace-only, over-long and control characters', () => {
    expect(buildMarkTest('').ok).toBe(false)
    expect(buildMarkTest('   ').ok).toBe(false)
    expect(buildMarkTest('x'.repeat(201)).ok).toBe(false)
    for (const bad of ['a\nb', 'a\tb', 'a\u0000b', 'a\u007fb', 'a b']) expect(buildMarkTest(bad).ok).toBe(false)
  })
  it('counts the trimmed length, so padding does not use up the limit', () => {
    expect(buildMarkTest(`  ${'x'.repeat(200)}  `).ok).toBe(true)
  })
})

describe('deleteNumberMatches', () => {
  it('is exact: case, spaces and prefixes all fail', () => {
    expect(deleteNumberMatches('INV-0002', 'INV-0002')).toBe(true)
    for (const t of ['', 'inv-0002', ' INV-0002', 'INV-0002 ', 'INV-000', 'INV-00022']) expect(deleteNumberMatches(t, 'INV-0002')).toBe(false)
  })
})

describe('testMenu', () => {
  it('marks real invoices of any status, unmarks tests, and deletes only for a super user on a test', () => {
    for (const status of ['draft', 'sent', 'paid', 'void'] as const) expect(testMenu(real({ status }), false)).toEqual({ mark: true, unmark: false, deletePermanently: false })
    expect(testMenu(real(), true).deletePermanently).toBe(false)
    expect(testMenu(test(), false)).toEqual({ mark: false, unmark: true, deletePermanently: false })
    expect(testMenu(test(), true)).toEqual({ mark: false, unmark: true, deletePermanently: true })
  })
})

describe('exclusion from derived figures', () => {
  it('isTest and withoutTest', () => {
    expect(isTest(test())).toBe(true)
    expect(isTest({})).toBe(false)
    expect(withoutTest([real(), test()])).toHaveLength(1)
  })
  it('tab counts leave tests out', () => {
    const c = tabCounts([real(), real({ status: 'paid' }), test(), test({ status: 'draft' })])
    expect(c).toEqual({ all: 2, draft: 0, sent: 1, overdue: 0, paid: 1 })
  })
  it('the list filter hides tests unless includeTest is set', () => {
    const list = [real({ id: 'a', invoiceNumber: 'INV-1' }), test({ id: 'b', invoiceNumber: 'INV-2' })]
    expect(filterInvoices(list, { tab: 'all', query: '', companyId: '' }).map(i => i.id)).toEqual(['a'])
    expect(filterInvoices(list, { tab: 'all', query: '', companyId: '', includeTest: true }).map(i => i.id).sort()).toEqual(['a', 'b'])
  })
  it('tile facts never count a test invoice', () => {
    const tiles = { outstandingCents: 0, overdueCents: 0, paidThisMonthCents: 0, draftCount: 0, draftCents: 0 }
    const f = tileFacts([real({ totalCents: 100 }), test({ totalCents: 9999 }), test({ status: 'paid', totalCents: 5, payment: { method: 'card', paidAt: '2026-10-05', amountCents: 777, reference: '' } })], tiles, '2026-10-11')
    expect(f.outstanding).toMatchObject({ incCents: 100, count: 1 })
    expect(f.paidThisMonth).toMatchObject({ incCents: 0, count: 0 })
  })
  it('milestone status ignores a test invoice, even a paid one', () => {
    expect(milestoneStatus('m1', [test({ milestoneId: 'm1', status: 'paid' })])).toBe('Planned')
    expect(milestoneStatus('m1', [test({ milestoneId: 'm1', status: 'paid' }), real({ milestoneId: 'm1', status: 'draft' })])).toBe('Draft invoice')
  })
  it('billed progress ignores test invoices', () => {
    const p = billingProgress(10000, [real({ status: 'sent', subtotalCents: 1000 }), test({ status: 'paid', subtotalCents: 5000 })])
    expect(p).toMatchObject({ paid: 0, invoiced: 1000, billed: 1000, unbilled: 9000 })
  })
  it('schedule rows do not link a test invoice', () => {
    const plan = { dealId: 'd', businessId: 'ard', milestones: [{ id: 'm1', label: 'One', amountCents: 100 }] } as BillingPlan
    const rows = scheduleRows(plan, [test({ milestoneId: 'm1', status: 'sent' })])
    expect(rows[0]).toMatchObject({ status: 'Planned', invoice: null })
  })
  it('company billing totals and the latest list ignore tests', () => {
    const t = companyBilling([real({ status: 'sent', subtotalCents: 100 }), test({ status: 'paid', subtotalCents: 900 }), test({ status: 'sent', overdue: true, subtotalCents: 700 })])
    expect(t).toEqual({ invoicedCents: 100, paidCents: 0, outstandingCents: 100, overdueCents: 0 })
    expect(latestInvoices([real({ id: 'a' }), test({ id: 'b' })]).map(i => i.id)).toEqual(['a'])
  })
  it('a won deal whose only invoice is a test still counts as not invoiced', () => {
    const deal = { id: 'd1', businessId: 'ard', status: 'won', companyId: 'c1', closedAt: null, stageChangedAt: '2026-10-01' } as unknown as Deal
    const co = { id: 'c1', archived: false } as unknown as Company
    expect(wonNotInvoiced([deal], [co], [test({ dealId: 'd1' })]).map(d => d.id)).toEqual(['d1'])
    expect(wonNotInvoiced([deal], [co], [real({ dealId: 'd1' })])).toEqual([])
  })
})
