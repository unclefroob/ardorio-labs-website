import { describe, expect, it } from 'vitest'
import type { BillingPlan } from '../api/contract'
import type { Goal } from '../data/types'
import { formatCentsTile } from './money'
import { ARD_PERIODS, contractedInRange, coverageText, goalTarget, monthBars, monthName, monthsBetween, periodProgress, pipelineCoverage, recordedLateLine, reportRange, wonByMonth, wonValueTarget } from './revenueReport'

const contract = (contractedOn: string, baselineCents: number) => ({ baselineCents, engagementType: 'fixed-price' as const, contractedOn, contractedBy: 'Me', estimateAtWonCents: baselineCents })
const vo = (id: string, amountCents: number, status: 'approved' | 'proposed' | 'rejected', decidedAt?: string) =>
  ({ id, label: id, amountCents, reason: 'x', status, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'Me', ...(decidedAt ? { decidedAt, decidedBy: 'Me' } : {}) })
const plan = (dealId: string, over: Partial<BillingPlan>): BillingPlan => ({ id: `bp_${dealId}`, dealId, businessId: 'ard', milestones: [], ...over })
const deal = (id: string, over: Record<string, unknown> = {}) => ({ id, businessId: 'ard' as const, archived: false, ...over })
const goal = (over: Partial<Goal>): Goal => ({ id: 'g', businessId: 'ard', ownerType: 'team', ownerId: 't1', metric: 'won_value', target: 100000, period: 'month', createdBy: 'u', ...over })

describe('contractedInRange', () => {
  it('counts baselines frozen in range and approved variations decided in range, nothing else', () => {
    const plans = [
      plan('a', { contract: contract('2026-10-05', 4800000), variations: [vo('v1', 600000, 'approved', '2026-10-07T01:00:00.000Z'), vo('v2', 240000, 'proposed'), vo('v3', 100000, 'rejected', '2026-10-08T01:00:00.000Z')] }),
      // Frozen before the range: only its variation decided in range counts, a reduction included.
      plan('b', { contract: contract('2026-08-01', 9000000), variations: [vo('v4', -150000, 'approved', '2026-10-02T01:00:00.000Z'), vo('v5', 500000, 'approved', '2026-09-30T01:00:00.000Z')] }),
      plan('c', { contract: contract('2026-10-03', 1000000) }), // archived deal
      plan('d', { contract: contract('2026-10-03', 1000000) }), // another business's deal id
      plan('e', {}), // no contract
    ]
    const deals = [deal('a'), deal('b'), deal('c', { archived: true }), deal('d', { businessId: 'ros' }), deal('e')]
    expect(contractedInRange(plans, deals, '2026-10-01', '2026-10-31')).toBe(4800000 + 600000 - 150000)
  })

  it('includes both ends of the range, reading decidedAt as the org day', () => {
    // 2026-09-30T14:30Z is 1 Oct 00:30 in Melbourne.
    const plans = [plan('a', { contract: contract('2026-10-31', 100), variations: [vo('v', 7, 'approved', '2026-09-30T14:30:00.000Z')] })]
    expect(contractedInRange(plans, [deal('a')], '2026-10-01', '2026-10-31')).toBe(107)
    expect(contractedInRange(plans, [deal('a')], '2026-11-01', '2026-11-30')).toBe(0)
  })
})

describe('wonValueTarget', () => {
  it('adds team goals, or the individual ones when there is no team goal, for that period only', () => {
    expect(wonValueTarget([goal({ target: 50000 }), goal({ id: 'g2', target: 20000 }), goal({ id: 'g3', ownerType: 'user', target: 9999 })], 'month')).toBe(70000)
    expect(wonValueTarget([goal({ ownerType: 'user', target: 30000 }), goal({ id: 'g2', ownerType: 'user', target: 10000 })], 'month')).toBe(40000)
    expect(wonValueTarget([goal({ period: 'week' })], 'month')).toBeNull()
    expect(wonValueTarget([goal({ metric: 'calls' }), goal({ id: 'g2', businessId: 'ros' })], 'month')).toBeNull()
  })
})

describe('pipelineCoverage', () => {
  it('is weighted pipeline over what is still needed for the goal', () => {
    expect(pipelineCoverage(304000, 600000, 412000)).toEqual({ kind: 'ratio', ratio: 304000 / 188000, weighted: 304000, needed: 188000, target: 600000, won: 412000 })
    expect(coverageText(304000 / 188000)).toBe('1.6×')
    expect(coverageText(2.4)).toBe('2.4×')
  })
  it('says there is no goal, or that it is met, instead of dividing by nothing', () => {
    expect(pipelineCoverage(1000, null, 0)).toEqual({ kind: 'no-goal' })
    expect(pipelineCoverage(1000, 5000, 5000)).toEqual({ kind: 'met', target: 5000, won: 5000 })
  })
})

describe('month labels and the recorded-later note', () => {
  it('names months and writes the note from recordedLate', () => {
    expect(monthName('2026-06')).toBe('Jun 2026')
    expect(monthName('2026-06', true)).toBe('June 2026')
    expect(monthName('nope')).toBe('nope')
    expect(recordedLateLine({ month: '2026-06', count: 2, cents: 1240000 }, formatCentsTile)).toBe('June 2026 includes 2 records entered later ($12,400)')
    expect(recordedLateLine({ month: '2026-03', count: 1, cents: 8000050 }, formatCentsTile)).toBe('March 2026 includes 1 record entered later ($80,000.50)')
  })
  it('turns months into Invoiced and Collected bars in dollars', () => {
    expect(monthBars([{ month: '2026-07', invoicedCents: 5800000, collectedCents: 6150000, externalInvoicedCents: 0, externalCollectedCents: 0 }])).toEqual([{ l: 'Jul 2026', v: [58000, 61500] }])
  })
})

describe('Ardorio revenue report periods (boards 5 and 11)', () => {
  it('offers the financial year, the year before, the quarter and the month', () => {
    expect(ARD_PERIODS.map(p => p[1])).toEqual(['This financial year', 'Previous financial year', 'Quarter', 'Month'])
  })

  it('runs each period to today, compared with its own goal period; the previous year is whole and has no goal', () => {
    expect(reportRange('fy', '2026-10-09')).toEqual({ from: '2026-07-01', to: '2026-10-09', goal: 'year', noun: 'year', total: 'Year to date' })
    expect(reportRange('fy', '2026-03-02').from).toBe('2025-07-01')
    expect(reportRange('prevfy', '2026-10-09')).toEqual({ from: '2025-07-01', to: '2026-06-30', goal: null, noun: 'year', total: 'Jul 2025 to Jun 2026' })
    expect(reportRange('prevfy', '2026-06-30')).toMatchObject({ from: '2024-07-01', to: '2025-06-30' })
    expect(reportRange('quarter', '2026-10-09')).toEqual({ from: '2026-10-01', to: '2026-10-09', goal: 'quarter', noun: 'quarter', total: 'Quarter to date' })
    expect(reportRange('month', '2026-10-09')).toEqual({ from: '2026-10-01', to: '2026-10-09', goal: 'month', noun: 'month', total: 'Month to date' })
  })

  it('lists every month of a range, across a year end', () => {
    expect(monthsBetween('2025-11-15', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(monthsBetween('2026-10-01', '2026-10-09')).toEqual(['2026-10'])
  })

  it('says how far into the period today is, as the board does', () => {
    expect(periodProgress(reportRange('fy', '2026-10-09'), '2026-10-09')).toBe('The year is 4 of 12 months in (33%).')
    expect(periodProgress(reportRange('quarter', '2026-11-20'), '2026-11-20')).toBe('The quarter is 2 of 3 months in (67%).')
    expect(periodProgress(reportRange('month', '2026-10-09'), '2026-10-09')).toBe('The month is 9 of 31 days in (29%).')
  })

  it('adds up won value per month in cents, and the part recorded directly as won', () => {
    const won = [
      { closedAt: '2026-07-28T09:00:00', close: '2026-12-01', recordedWonDirectly: false, v: 90000 },
      { closedAt: null, close: '2026-08-14', recordedWonDirectly: true, v: 12000.5 },
      { closedAt: '2026-08-02T10:00:00', close: '2026-08-02', v: 1000 },
    ]
    const out = wonByMonth(won, d => d.v)
    expect(out.get('2026-07')).toEqual({ cents: 9000000, recordedCents: 0 })
    expect(out.get('2026-08')).toEqual({ cents: 1300050, recordedCents: 1200050 })
  })

  it('reads any metric’s goal target for a goal period, the team before individuals', () => {
    const gs = [goal({ id: 'a', metric: 'invoiced_cents', period: 'year', target: 4500000 }), goal({ id: 'b', metric: 'invoiced_cents', period: 'year', ownerType: 'user', ownerId: 'u1', target: 1 }), goal({ id: 'c', period: 'year', target: 600000 })]
    expect(goalTarget(gs, 'invoiced_cents', 'year')).toBe(4500000)
    expect(goalTarget(gs, 'collected_cents', 'year')).toBeNull()
    expect(wonValueTarget(gs, 'year')).toBe(600000)
    expect(wonValueTarget(gs, 'quarter')).toBeNull()
  })
})
