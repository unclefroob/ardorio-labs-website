import { describe, expect, it } from 'vitest'
import type { BillingPlan } from '../api/contract'
import type { Deal } from '../data/types'
import { emptyBucket, type FcBucket, type FcEntry } from './forecast'
import { attentionOf, nextToInvoice, outlookBars, outlookTotals, recurringRunRate, splitBucket, weightedArdPipeline } from './revenueOutlook'
import { summarise } from './forecast'

const TODAY = '2026-10-14'
const entry = (id: string, over: Partial<FcEntry>): FcEntry => ({
  id, series: 'project', kind: 'milestone', dealId: 'd1', dealName: 'Deal', companyId: 'c1', label: id, cents: 100000, invoiceDay: '2026-11-01', collectDay: '2026-12-01', issued: false, flags: [], ...over,
})
const bucketOf = (items: Array<[FcEntry, 'invoiced' | 'collected' | 'retainer' | 'retainerCollected' | 'pipeline']>): FcBucket => {
  const b = emptyBucket()
  for (const [e, role] of items) {
    b[role] += e.cents
    if (role === 'pipeline') b.pipelineValue += e.valueCents ?? 0
    b.items.push({ e, role })
  }
  return b
}
const deal = (id: string, over: Partial<Deal> = {}) => ({ id, businessId: 'ard', status: 'won', value: 60000, ...over }) as Deal
const term = (over: Partial<NonNullable<BillingPlan['term']>> = {}): NonNullable<BillingPlan['term']> => ({
  startDate: '2026-07-01', termMonths: 36, annualCents: 6000000, frequency: 'annual', timing: 'advance', escalation: 'none', escalationBp: 0, exit: 'committed', breakNoticeDays: 0, autoDraft: false, draftFrom: '2026-07-01', ...over,
})
const plan = (dealId: string, over: Partial<BillingPlan> = {}): BillingPlan => ({ id: `bp_${dealId}`, dealId, businessId: 'ard', milestones: [], ...over })

describe('splitBucket: project money apart from recurring money', () => {
  const m = entry('m', { cents: 400000 })
  const inst = entry('i', { kind: 'instalment', cents: 150000 })
  const ret = entry('r', { series: 'retainer', kind: 'retainer', cents: 25000 })
  it('counts milestones as project and instalments and retainers as recurring, when invoiced', () => {
    const b = bucketOf([[m, 'invoiced'], [inst, 'invoiced'], [ret, 'retainer']])
    expect(splitBucket(b, 'invoiced')).toEqual({ project: 400000, recurring: 175000 })
  })
  it('reads the collected roles when the basis is collected', () => {
    const b = bucketOf([[m, 'collected'], [inst, 'collected'], [ret, 'retainerCollected'], [m, 'invoiced']])
    expect(splitBucket(b, 'collected')).toEqual({ project: 400000, recurring: 175000 })
  })
  it('ignores pipeline entirely', () => {
    const p = entry('p', { series: 'pipeline', kind: 'pipeline', cents: 999999, valueCents: 2000000, prob: 50 })
    expect(splitBucket(bucketOf([[p, 'pipeline']]), 'invoiced')).toEqual({ project: 0, recurring: 0 })
  })
})

describe('outlookBars and outlookTotals', () => {
  const entries = [
    entry('a', { cents: 300000, invoiceDay: '2026-10-20', collectDay: '2026-11-20' }),
    entry('b', { kind: 'instalment', cents: 100000, invoiceDay: '2026-11-01', collectDay: '2026-12-01' }),
    entry('c', { series: 'pipeline', kind: 'pipeline', cents: 50000, valueCents: 100000, prob: 50, invoiceDay: '2026-11-10', collectDay: null }),
  ]
  const s = summarise({ entries }, ['2026-10', '2026-11', '2026-12'])
  it('gives one bar a month, with the pipeline in its own number', () => {
    const bars = outlookBars(s, 'm12', 'invoiced', ym => ym)
    expect(bars.map(b => [b.key, b.project, b.recurring, b.pipeline])).toEqual([['2026-10', 300000, 0, 0], ['2026-11', 0, 100000, 50000], ['2026-12', 0, 0, 0]])
  })
  it('never adds the pipeline to the contracted total', () => {
    expect(outlookTotals(s, 'invoiced')).toEqual({ project: 300000, recurring: 100000, contracted: 400000, pipeline: 50000, pipelineValue: 100000 })
  })
  it('moves the same entries to their collect months on the collected basis', () => {
    const bars = outlookBars(s, 'm12', 'collected', ym => ym)
    expect(bars.map(b => [b.key, b.project + b.recurring])).toEqual([['2026-10', 0], ['2026-11', 300000], ['2026-12', 100000]])
  })
  it('groups by financial year for the fy range', () => {
    const bars = outlookBars(s, 'fy', 'invoiced', ym => ym)
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ project: 300000, recurring: 100000, pipeline: 50000 })
  })
})

describe('recurringRunRate', () => {
  it('counts a term in force at its current year fee and a retainer at twelve months', () => {
    const plans = [plan('t', { term: term() }), plan('r', { retainer: { amountCents: 250000, interval: 'monthly', nextInvoiceDate: '2026-11-01' } })]
    expect(recurringRunRate(plans, [deal('t'), deal('r')], TODAY)).toBe(6000000 + 3000000)
  })
  it('counts nothing for an ended term, a finished term, a future term, a retainer with no next date, or a deal that is not won', () => {
    const plans = [
      plan('ended', { term: term({ ended: { endedOn: '2026-09-01', reason: 'x', endedBy: 'u' } as never }) }),
      plan('over', { term: term({ startDate: '2020-01-01', termMonths: 12 }) }),
      plan('future', { term: term({ startDate: '2027-01-01' }) }),
      plan('nodate', { retainer: { amountCents: 100000, interval: 'monthly' } }),
      plan('open', { term: term() }),
      plan('arch', { term: term() }),
    ]
    const deals = [deal('ended'), deal('over'), deal('future'), deal('nodate'), deal('open', { status: 'open' }), deal('arch', { archived: true })]
    expect(recurringRunRate(plans, deals, TODAY)).toBe(0)
  })
  it('uses the escalated fee of the current term year', () => {
    const p = plan('e', { term: term({ startDate: '2025-07-01', termMonths: 36, escalation: 'fixed', escalationBp: 1000 }) })
    expect(recurringRunRate([p], [deal('e')], TODAY)).toBe(6600000)
  })
})

describe('attentionOf and nextToInvoice', () => {
  it('lists what needs someone, most urgent first, and nothing when all is well', () => {
    const f = {
      entries: [entry('o', { cents: 4200000, flags: ['overdue-invoice'] }), entry('ok', {})],
      unscheduled: 3600000, noContract: [deal('x'), deal('y')], notCommitted: 1550000,
    }
    expect(attentionOf(f).map(a => [a.key, a.amount, a.count ?? null, a.tone])).toEqual([['overdue', 4200000, 1, 'bad'], ['unscheduled', 3600000, null, 'warn'], ['noContract', 0, 2, 'warn'], ['notCommitted', 1550000, null, 'info']])
    expect(attentionOf({ entries: [], unscheduled: 0, noContract: [], notCommitted: 0 })).toEqual([])
  })
  it('does not count an issued item as overdue', () => {
    expect(attentionOf({ entries: [entry('i', { issued: true, flags: ['overdue-invoice'] })], unscheduled: 0, noContract: [], notCommitted: 0 })).toEqual([])
  })
  it('orders the next items by date, leaves out pipeline, issued, undated and not-committed, and stops at the limit', () => {
    const f = {
      entries: [
        entry('late', { invoiceDay: '2026-12-01' }), entry('overdue', { invoiceDay: '2026-10-01', flags: ['overdue-invoice'] }), entry('soon', { invoiceDay: '2026-11-01' }),
        entry('pipe', { series: 'pipeline', kind: 'pipeline', invoiceDay: '2026-10-02' }), entry('done', { issued: true, invoiceDay: '2026-10-03' }),
        entry('none', { invoiceDay: null }), entry('nc', { invoiceDay: '2026-10-04', flags: ['not-committed'] }),
      ],
    }
    expect(nextToInvoice(f).map(e => e.id)).toEqual(['overdue', 'soon', 'late'])
    expect(nextToInvoice(f, 2).map(e => e.id)).toEqual(['overdue', 'soon'])
  })
})

describe('weightedArdPipeline', () => {
  it('weights open Ardorio deals by stage probability, in cents, leaving out other businesses, won and archived deals', () => {
    const deals = [deal('a', { status: 'open', value: 50000 }), deal('b', { status: 'open', value: 100000, businessId: 'ros' }), deal('c'), deal('d', { status: 'open', archived: true })]
    expect(weightedArdPipeline(deals, () => 40)).toBe(2000000)
  })
})
