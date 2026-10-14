import { describe, expect, it } from 'vitest'
import type { BillingContract, BillingMilestone, BillingPlan, BillingTerm, BillingVariation, InvoiceDto } from '../api/contract'
import type { Company, Deal } from '../data/types'
import { dto } from '../testing/invoicingWorld'
import { ardorioByDeal, isRetainerInvoice, moneyForDeal, unscheduledGap } from './billing'
import { buildForecast, byFinancialYear, fyLabel, latestDay, rangeMonths, reconcileGap, summarise, type ForecastInput } from './forecast'
import { endEffect } from './term'
import { instalmentsDue, notCommittedLabel, renewalDue, termCommitment, termLine, termStateText, termSummary, termYearOn } from './termMoney'
import { scheduleTotal, termSchedule } from './termSchedule'

// Term agreements in the money views: Customers by deal, the deal's money, the forecast. Ex GST cents throughout.
// The plans are what the server stores: its own schedule, CPI re-pricing and early end, with the variations it appends.

const TODAY = '2026-10-14'
const COS = [{ id: 'co1', name: 'Harbour Group', archived: false }, { id: 'co2', name: 'Kestrel', archived: false }] as Company[]
const deal = (id: string, companyId = 'co1', over: Partial<Deal> = {}) =>
  ({ id, companyId, businessId: 'ard', status: 'won', value: 0, title: id, name: id, close: '', stageId: 'sg1', closedAt: '2025-06-01T09:00', stageChangedAt: '2025-06-01T09:00', ...over }) as Deal
const contract = (baselineCents: number): BillingContract => ({ baselineCents, engagementType: 'term-agreement', contractedOn: '2025-06-01', contractedBy: 'Me', estimateAtWonCents: baselineCents })
const vo = (id: string, label: string, amountCents: number): BillingVariation => ({ id, label, amountCents, reason: label, status: 'approved', createdAt: '2026-06-20T00:00:00Z', createdBy: 'Server' })
const term = (over: Partial<BillingTerm>): BillingTerm => ({
  startDate: '2025-11-01', termMonths: 60, annualCents: 6000000, frequency: 'annual', timing: 'advance', escalation: 'none', escalationBp: 0,
  exit: 'committed', breakNoticeDays: 0, autoDraft: true, draftFrom: '2025-06-01', ...over,
})
const inv = (id: string, dealId: string, milestoneId: string | null, cents: number, status: InvoiceDto['status'], issueDate: string, over: Partial<InvoiceDto> = {}): InvoiceDto =>
  dto({ id, invoiceNumber: `INV-${id}`, dealId, companyId: dealId === 'brk' ? 'co2' : 'co1', milestoneId, status, subtotalCents: cents, issueDate, source: 'term', ...over })
const TEST = { markedAt: '2026-09-01', markedBy: 'u', reason: 'demo' }
const input = (o: Partial<ForecastInput>): ForecastInput => ({
  today: TODAY, deals: [], companies: COS, plans: [], invoices: [], lagDays: 30, prob: () => 0, retainerUntil: '2031-12-31', ...o,
})
const fy = (o: Partial<ForecastInput>) => {
  const f = buildForecast(input(o))
  const s = summarise(f, rangeMonths('fy', TODAY, latestDay(f.entries)))
  return { f, s, years: Object.fromEntries(byFinancialYear(s).map(r => [fyLabel(r.fy), r.bucket])) }
}

// ── A: 5 years, billed annually in advance, $60,000 a year, no rise, committed, with a $40,000 build fee ────────────
const BUILD: BillingMilestone = { id: 'build', label: 'Build', amountCents: 4000000, plannedDate: '2025-10-15', deliveredOn: '2025-10-20', deliveredBy: 'Me' }
const T_A = term({})
const PLAN_A: BillingPlan = {
  id: 'bp_five', dealId: 'five', businessId: 'ard', term: T_A, contract: contract(4000000 + 30000000), variations: [],
  // A retainer on the same deal must not pull term invoices out of project money.
  retainer: { amountCents: 100000, interval: 'monthly' },
  milestones: [BUILD, ...termSchedule(T_A)],
}
const INV_A = [
  inv('b', 'five', 'build', 4000000, 'paid', '2025-10-21', { source: 'manual' }),
  inv('y1', 'five', 'inst_1_1', 6000000, 'paid', '2025-11-01'),
  // Never earned or invoiced: a cancelled and a test invoice for year 2.
  inv('y2v', 'five', 'inst_2_1', 6000000, 'void', '2026-10-01'),
  inv('y2t', 'five', 'inst_2_1', 6000000, 'paid', '2026-10-01', { test: TEST }),
]

describe('term agreement A: 5 years annual in advance, with a build fee', () => {
  it('the schedule is five instalments of $60,000 on each anniversary, and the contract is the build fee plus the schedule', () => {
    const inst = PLAN_A.milestones.filter(m => m.kind === 'instalment')
    expect(inst.map(m => [m.id, m.plannedDate, m.amountCents])).toEqual([
      ['inst_1_1', '2025-11-01', 6000000], ['inst_2_1', '2026-11-01', 6000000], ['inst_3_1', '2027-11-01', 6000000], ['inst_4_1', '2028-11-01', 6000000], ['inst_5_1', '2029-11-01', 6000000],
    ])
    expect(scheduleTotal(PLAN_A.milestones)).toBe(34000000)
  })

  it('earned is the delivered build fee plus the invoiced instalments; term invoices are project money', () => {
    const m = moneyForDeal(deal('five'), PLAN_A, INV_A)
    expect(m).toMatchObject({ contracted: 34000000, earned: 10000000, invoiced: 10000000, collected: 10000000, outstanding: 0, retainerInvoiced: 0, scheduled: 34000000, unscheduled: 0, overBilled: 0 })
    expect(isRetainerInvoice({ source: 'term', milestoneId: null }, PLAN_A)).toBe(false)
    expect(unscheduledGap(m, 'term-agreement')).toBe(0)
  })

  it('a draft instalment invoice neither earns the instalment nor counts as invoiced: issuing it does both', () => {
    // Revenue is recognised when invoiced. The server drafts on each invoice date by itself, so a draft earns nothing.
    const draft = moneyForDeal(deal('five'), PLAN_A, [...INV_A, inv('y2d', 'five', 'inst_2_1', 6000000, 'draft', '2026-11-01')])
    expect(draft.earned).toBe(10000000)
    expect(draft.invoiced).toBe(10000000)
    const sent = moneyForDeal(deal('five'), PLAN_A, [...INV_A, inv('y2d', 'five', 'inst_2_1', 6000000, 'sent', '2026-11-01')])
    expect(sent.earned).toBe(16000000)
    expect(sent.invoiced).toBe(16000000)
    // A cancelled or test invoice never earns it either.
    expect(moneyForDeal(deal('five'), PLAN_A, [...INV_A, inv('y2d', 'five', 'inst_2_1', 6000000, 'void', '2026-11-01')]).earned).toBe(10000000)
    expect(moneyForDeal(deal('five'), PLAN_A, [...INV_A, inv('y2d', 'five', 'inst_2_1', 6000000, 'sent', '2026-11-01', { test: TEST })]).earned).toBe(10000000)
  })

  it('Customers by deal: the agreement with its annual fee and end, and every issued invoice as the revenue report counts it', () => {
    const r = ardorioByDeal([deal('five')], COS, [PLAN_A], INV_A, TODAY)
    const row = r.companies[0].deals[0]
    expect(row.engagement).toBe('term-agreement')
    expect(row.term?.summary).toMatchObject({ annualCents: 6000000, year: 1, years: 5, termEnd: '2030-11-01', lastDay: '2030-10-31', endsInDays: 1479, endedOn: null })
    expect(termLine(row.term!.summary)).toBe('Annual fee $60,000.00 · to 31 Oct 2030 · ends in 1479 days')
    expect(termLine(row.term!.summary)).not.toMatch(/MRR|ARR|recurring|per month/i)
    expect(row.term).toMatchObject({ committedCents: 34000000, notCommittedCents: 0, breakAt: null, dueNotInvoiced: [] })
    expect(row.next?.id).toBe('inst_2_1')
    expect(row.deliveredNotInvoiced).toEqual([])
    expect(r.unscheduled).toEqual([])
    expect(r.tiles).toMatchObject({ contractedCents: 34000000, earnedCents: 10000000, invoicedCents: 10000000, collectedCents: 10000000, notCommittedCents: 0 })
    // The term invoice is counted like any other in "every issued invoice" (the revenue report's own rule).
    expect(r.tiles.all).toEqual({ invoiced: 10000000, collected: 10000000, outstanding: 0, overdue: 0 })
    expect(r.tiles.retainer.invoiced).toBe(0)
    expect(r.companies[0].terms.map(x => x.deal.id)).toEqual(['five'])
  })

  it('the forecast places each future instalment on its invoice date, by financial year, and the backlog reconciles', () => {
    const { f, s, years } = fy({ deals: [deal('five')], plans: [PLAN_A], invoices: INV_A })
    const inst = f.entries.filter(e => e.kind === 'instalment')
    expect(inst.map(e => [e.label, e.invoiceDay, e.collectDay, e.cents])).toEqual([
      ['Year 2 of 5', '2026-11-01', '2026-12-01', 6000000], ['Year 3 of 5', '2027-11-01', '2027-12-01', 6000000],
      ['Year 4 of 5', '2028-11-01', '2028-12-01', 6000000], ['Year 5 of 5', '2029-11-01', '2029-12-01', 6000000],
    ])
    expect(f.backlog).toBe(24000000)
    expect(f.notCommitted).toBe(0)
    expect(s.byMonth.get('2026-11')?.invoiced).toBe(6000000)
    expect(Object.fromEntries(Object.entries(years).map(([k, b]) => [k, b.invoiced]))).toEqual({ FY27: 6000000, FY28: 6000000, FY29: 6000000, FY30: 6000000 })
    expect(reconcileGap(f, s)).toBe(0)
  })

  it('the slip control never moves instalments: their dates are agreed', () => {
    const f = buildForecast(input({ deals: [deal('five')], plans: [PLAN_A], invoices: INV_A, slip: 2 }))
    const e = f.entries.find(x => x.id === 'ms:five:inst_2_1')
    expect(e).toMatchObject({ invoiceDay: '2026-11-01', flags: [] })
  })
})

// ── B: 3 years, quarterly in arrears, CPI assumed 3%, year 2 confirmed at 3.5% ─────────────────────────────────────
const T_B_ASSUMED = term({ startDate: '2025-07-01', termMonths: 36, annualCents: 12000000, frequency: 'quarterly', timing: 'arrears', escalation: 'cpi', escalationBp: 300 })
const T_B = { ...T_B_ASSUMED, cpiConfirmed: [{ year: 2, bp: 350, confirmedOn: '2026-06-20', confirmedBy: 'Me' }] }
// The server re-priced year 2 and 3 (none invoiced then) and appended one approved variation for the difference.
const B_BASE = scheduleTotal(termSchedule(T_B_ASSUMED))
const B_DIFF = scheduleTotal(termSchedule(T_B)) - B_BASE
const PLAN_B: BillingPlan = {
  id: 'bp_cpi', dealId: 'cpi', businessId: 'ard', term: T_B, contract: contract(B_BASE),
  variations: [vo('vcpi', 'CPI year 2: 3.5% (assumed 3%)', B_DIFF)], milestones: termSchedule(T_B),
}
const INV_B = [
  inv('q1', 'cpi', 'inst_1_1', 3000000, 'paid', '2025-09-30'), inv('q2', 'cpi', 'inst_1_2', 3000000, 'paid', '2025-12-31'),
  inv('q3', 'cpi', 'inst_1_3', 3000000, 'paid', '2026-03-31'), inv('q4', 'cpi', 'inst_1_4', 3000000, 'paid', '2026-06-30'),
  // Year 2 quarter 1, drafted by the server on 30 Sep 2026 and sent.
  inv('q5', 'cpi', 'inst_2_1', 3105000, 'sent', '2026-09-30'),
]

describe('term agreement B: quarterly in arrears, CPI with year 2 confirmed', () => {
  it('the confirmed year re-prices the schedule and the variation keeps contracted equal to it', () => {
    expect(B_BASE).toBe(12000000 + 12360000 + 12730800)
    expect(B_DIFF).toBe(121800)
    const q = PLAN_B.milestones.map(m => [m.id, m.plannedDate, m.amountCents])
    expect(q.slice(4, 6)).toEqual([['inst_2_1', '2026-09-30', 3105000], ['inst_2_2', '2026-12-31', 3105000]])
    expect(q.slice(8, 9)).toEqual([['inst_3_1', '2027-09-30', 3198150]])
    const m = moneyForDeal(deal('cpi'), PLAN_B, INV_B)
    expect(m).toMatchObject({ contracted: 37212600, scheduled: 37212600, unscheduled: 0, earned: 15105000, invoiced: 15105000, collected: 12000000, outstanding: 3105000 })
  })

  it('the annual fee shown is the fee of the current term year, after CPI', () => {
    const s = termSummary(T_B, TODAY)
    expect(s).toMatchObject({ year: 2, years: 3, annualCents: 12420000, termEnd: '2028-07-01', lastDay: '2028-06-30' })
    expect(termLine(s)).toBe('Annual fee $124,200.00 (year 2 of 3) · to 30 Jun 2028 · ends in 626 days')
  })

  it('the forecast places each quarter at its period end, by month and by financial year', () => {
    const { f, s, years } = fy({ deals: [deal('cpi')], plans: [PLAN_B], invoices: INV_B })
    expect(f.entries.filter(e => e.kind === 'instalment').map(e => [e.label, e.invoiceDay, e.cents])).toEqual([
      ['Year 2 of 3, quarter 2', '2026-12-31', 3105000], ['Year 2 of 3, quarter 3', '2027-03-31', 3105000], ['Year 2 of 3, quarter 4', '2027-06-30', 3105000],
      ['Year 3 of 3, quarter 1', '2027-09-30', 3198150], ['Year 3 of 3, quarter 2', '2027-12-31', 3198150], ['Year 3 of 3, quarter 3', '2028-03-31', 3198150], ['Year 3 of 3, quarter 4', '2028-06-30', 3198150],
    ])
    expect(s.byMonth.get('2026-12')?.invoiced).toBe(3105000)
    // The sent year 2 quarter 1 invoice is collected 30 days after its issue date.
    expect(s.byMonth.get('2026-10')?.collected).toBe(3105000)
    expect(years.FY27.invoiced).toBe(9315000)
    expect(years.FY28.invoiced).toBe(12792600)
    expect(f.backlog).toBe(37212600 - 15105000)
    expect(reconcileGap(f, s)).toBe(0)
  })
})

// ── C: break at each anniversary, 5 years annual in advance from 1 Mar 2025, fixed 3%, 90 days' notice ────────────
const T_C = term({ startDate: '2025-03-01', annualCents: 5000000, escalation: 'fixed', escalationBp: 300, exit: 'break', breakNoticeDays: 90 })
const C_TOTAL = scheduleTotal(termSchedule(T_C))
const PLAN_C: BillingPlan = { id: 'bp_brk', dealId: 'brk', businessId: 'ard', term: T_C, contract: contract(C_TOTAL), variations: [], milestones: termSchedule(T_C) }
const INV_C = [inv('c1', 'brk', 'inst_1_1', 5000000, 'paid', '2025-03-01'), inv('c2', 'brk', 'inst_2_1', 5150000, 'paid', '2026-03-01')]

describe('term agreement C: break at each anniversary', () => {
  it('committed is contracted minus the un-invoiced instalments from the next anniversary on', () => {
    expect(PLAN_C.milestones.map(m => m.amountCents)).toEqual([5000000, 5150000, 5304500, 5463635, 5627544])
    const c = termCommitment(PLAN_C, C_TOTAL, INV_C, TODAY)
    expect(c.breakAt).toBe('2027-03-01')
    expect(c.notCommitted).toBe(5304500 + 5463635 + 5627544)
    expect(c.committed).toBe(10150000)
    expect([...c.ids]).toEqual(['inst_3_1', 'inst_4_1', 'inst_5_1'])
    expect(notCommittedLabel(c.breakAt!)).toBe('Not yet committed (break at 1 Mar 2027)')
  })

  it('an instalment already invoiced is committed even after the anniversary, and none is left after the last anniversary', () => {
    const early = inv('c3', 'brk', 'inst_3_1', 5304500, 'draft', '2026-10-01')
    expect(termCommitment(PLAN_C, C_TOTAL, [...INV_C, early], TODAY).notCommitted).toBe(5463635 + 5627544)
    // In the last year no anniversary is left before the term ends: everything is committed.
    expect(termCommitment(PLAN_C, C_TOTAL, INV_C, '2029-03-02')).toMatchObject({ notCommitted: 0, committed: C_TOTAL, breakAt: null })
    // A committed agreement never has an uncommitted part.
    expect(termCommitment({ ...PLAN_C, term: { ...T_C, exit: 'committed', breakNoticeDays: 0 } }, C_TOTAL, INV_C, TODAY).notCommitted).toBe(0)
  })

  it('once the notice day of the next anniversary has passed, the year after it is committed and the break moves a year on', () => {
    // 90 days notice: for 1 Mar 2027 it is due by 1 Dec 2026, for 1 Mar 2028 by 2 Dec 2027.
    expect(termCommitment(PLAN_C, C_TOTAL, INV_C, '2026-12-01')).toMatchObject({ breakAt: '2027-03-01', notCommitted: 5304500 + 5463635 + 5627544 })
    const closed = termCommitment(PLAN_C, C_TOTAL, INV_C, '2026-12-02')
    expect(closed.breakAt).toBe('2028-03-01')
    expect(closed.notCommitted).toBe(5463635 + 5627544)
    expect(closed.committed).toBe(C_TOTAL - 5463635 - 5627544)
    expect([...closed.ids]).toEqual(['inst_4_1', 'inst_5_1'])
    // After the last notice day nothing can be broken: all committed.
    expect(termCommitment(PLAN_C, C_TOTAL, INV_C, '2028-12-02')).toMatchObject({ breakAt: null, notCommitted: 0, committed: C_TOTAL })
    // The Customers row follows the same break point.
    const r = ardorioByDeal([deal('brk', 'co2')], COS, [PLAN_C], INV_C, '2026-12-02')
    expect(r.companies[0].deals[0].term).toMatchObject({ notCommittedCents: 5463635 + 5627544, breakAt: '2028-03-01' })
  })

  it('Customers by deal: contracted stays the denominator, with the not yet committed part beside it', () => {
    const r = ardorioByDeal([deal('brk', 'co2')], COS, [PLAN_C], INV_C, TODAY)
    const co = r.companies[0]
    expect(co.contractedCents).toBe(C_TOTAL)
    expect(co.notCommittedCents).toBe(16395679)
    expect(r.tiles.notCommittedCents).toBe(16395679)
    expect(co.deals[0].term).toMatchObject({ committedCents: 10150000, notCommittedCents: 16395679, breakAt: '2027-03-01' })
    expect(co.deals[0].money.earned).toBe(10150000)
  })

  it('the forecast shows the committed part as backlog and the rest apart, on its dates, never in forecast invoiced or collected', () => {
    const { f, s, years } = fy({ deals: [deal('brk', 'co2')], plans: [PLAN_C], invoices: INV_C })
    expect(f.backlog).toBe(0)
    expect(f.notCommitted).toBe(16395679)
    expect(f.deals[0]).toMatchObject({ contracted: C_TOTAL, invoiced: 10150000, backlog: 0, scheduled: 0, unscheduled: 0, overScheduled: 0, notCommitted: 16395679, breakAt: '2027-03-01' })
    const nc = f.entries.filter(e => e.flags.includes('not-committed'))
    expect(nc.map(e => [e.invoiceDay, e.collectDay, e.cents])).toEqual([['2027-03-01', null, 5304500], ['2028-03-01', null, 5463635], ['2029-03-01', null, 5627544]])
    expect(s.byMonth.get('2027-03')).toMatchObject({ invoiced: 0, collected: 0, notCommitted: 5304500 })
    expect(years.FY27).toMatchObject({ invoiced: 0, notCommitted: 5304500 })
    expect(years.FY29.notCommitted).toBe(5627544)
    expect(s.inRange.invoiced + s.later.invoiced + s.noDate.invoiced).toBe(0)
    expect(reconcileGap(f, s)).toBe(0)
  })
})

// ── D: ended early, quarterly in advance from 1 Jul 2025, 2 years, $80,000 a year, break; ended on 15 Nov 2026 ────
const T_D0 = term({ startDate: '2025-07-01', termMonths: 24, annualCents: 8000000, frequency: 'quarterly', exit: 'break', breakNoticeDays: 30 })
const D_FULL: BillingPlan = { id: 'bp_end', dealId: 'end', businessId: 'ard', term: T_D0, contract: contract(8000000 * 2), variations: [], milestones: termSchedule(T_D0) }
const INV_D = ['inst_1_1', 'inst_1_2', 'inst_1_3', 'inst_1_4', 'inst_2_1'].map((id, i) => inv(`d${i}`, 'end', id, 2000000, 'paid', '2025-07-01'))
// What the server stores after ending: later instalments removed, the one spanning the end cut, one negative variation.
const D_EFFECT = endEffect(D_FULL, '2026-11-15', INV_D)
const PLAN_D: BillingPlan = {
  ...D_FULL,
  term: { ...T_D0, autoDraft: false, ended: { endedOn: '2026-11-15', reason: 'Client sold the business', endedBy: 'Me', recordedAt: '2026-10-10T00:00:00Z' } },
  variations: [vo('vend', 'Ended early on 2026-11-15', -D_EFFECT.removedCents)],
  milestones: D_FULL.milestones
    .filter(m => !D_EFFECT.removed.some(r => r.id === m.id))
    .map(m => { const c = D_EFFECT.cut.find(x => x.id === m.id); return c ? { ...m, amountCents: c.to } : m }),
}

describe('term agreement D: ended early', () => {
  it('the instalments after the end are gone and the one spanning it is cut to the days before the end', () => {
    expect(D_EFFECT.removed.map(m => m.id)).toEqual(['inst_2_3', 'inst_2_4'])
    // 1 Oct to 14 Nov is 45 of the quarter's 92 days.
    expect(D_EFFECT.cut).toEqual([expect.objectContaining({ id: 'inst_2_2', from: 2000000, to: 978261 })])
    expect(D_EFFECT.removedCents).toBe(4000000 + 2000000 - 978261)
  })

  it('contracted still equals the schedule; nothing is not yet committed once ended; the due instalment is flagged', () => {
    const m = moneyForDeal(deal('end'), PLAN_D, INV_D)
    expect(m).toMatchObject({ contracted: 10978261, scheduled: 10978261, unscheduled: 0, earned: 10000000, invoiced: 10000000 })
    expect(termCommitment(PLAN_D, 10978261, INV_D, TODAY)).toMatchObject({ notCommitted: 0, breakAt: null })
    expect(instalmentsDue(PLAN_D, INV_D, TODAY).map(x => [x.id, x.amountCents])).toEqual([['inst_2_2', 978261]])
    const r = ardorioByDeal([deal('end')], COS, [PLAN_D], INV_D, TODAY)
    const row = r.companies[0].deals[0]
    expect(termStateText(row.term!.summary)).toBe('ended early on 15 Nov 2026')
    expect(renewalDue(row.term!.summary)).toBe(false)
    // An ended agreement is not listed as running on the company row.
    expect(r.companies[0].terms).toEqual([])
    expect(r.unscheduled).toEqual([])
  })

  it('the forecast has only the cut instalment, overdue to invoice this month, and reconciles', () => {
    const { f, s } = fy({ deals: [deal('end')], plans: [PLAN_D], invoices: INV_D })
    expect(f.entries.filter(e => e.kind === 'instalment').map(e => [e.label, e.invoiceDay, e.cents, e.flags])).toEqual([['Year 2 of 2, quarter 2', TODAY, 978261, ['overdue-invoice']]])
    expect(f.backlog).toBe(978261)
    expect(f.notCommitted).toBe(0)
    expect(reconcileGap(f, s)).toBe(0)
  })
})

describe('term summary helpers', () => {
  it('the term year turns at each anniversary, and stays in range before the start and after the end', () => {
    const t = term({ startDate: '2024-02-29', termMonths: 30 })
    expect(termYearOn(t, '2024-01-01')).toBe(1)
    expect(termYearOn(t, '2025-02-27')).toBe(1)
    expect(termYearOn(t, '2025-02-28')).toBe(2)
    expect(termYearOn(t, '2026-03-01')).toBe(3)
    expect(termYearOn(t, '2030-01-01')).toBe(3)
  })

  it('renewal is due in the last 90 days of a running term only', () => {
    expect(renewalDue({ endsInDays: 90, endedOn: null })).toBe(true)
    expect(renewalDue({ endsInDays: 91, endedOn: null })).toBe(false)
    expect(renewalDue({ endsInDays: 0, endedOn: null })).toBe(false)
    expect(renewalDue({ endsInDays: 30, endedOn: '2026-11-01' })).toBe(false)
    expect(termStateText({ endsInDays: 0, endedOn: null })).toBe('term over')
    expect(termStateText({ endsInDays: 1, endedOn: null })).toBe('ends in 1 day')
  })
})
