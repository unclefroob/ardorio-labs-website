import { describe, expect, it } from 'vitest'
import type { BillingContract, BillingMilestone, BillingPlan, BillingVariation, InvoiceDto } from '../api/contract'
import type { Company, Deal } from '../data/types'
import { dto } from '../testing/invoicingWorld'
import {
  addMonths, buildForecast, byFinancialYear, drillByDeal, fyLabel, fyOf, forecastBars, lagLine, latestDay, parseLag, paymentLag, rangeMonths, reconcileGap, summarise,
  type FcRange, type ForecastInput,
} from './forecast'

const TODAY = '2026-10-14'
const company = (id: string, name: string, over: Partial<Company> = {}) => ({ id, name, archived: false, ...over }) as Company
const deal = (id: string, over: Partial<Deal> = {}) =>
  ({ id, companyId: 'co1', businessId: 'ard', status: 'won', value: 60000, title: id, name: id, close: '', stageId: 'sg1', closedAt: '2026-07-28T09:00', stageChangedAt: '2026-07-28T09:00', ...over }) as Deal
const contract = (baselineCents: number, over: Partial<BillingContract> = {}): BillingContract =>
  ({ baselineCents, engagementType: 'fixed-price', contractedOn: '2026-06-01', contractedBy: 'Me', estimateAtWonCents: baselineCents, ...over })
const plan = (dealId: string, over: Partial<BillingPlan> = {}): BillingPlan => ({ id: `bp_${dealId}`, dealId, businessId: 'ard', milestones: [], ...over })
const ms = (id: string, dollars: number, plannedDate?: string, over: Partial<BillingMilestone> = {}): BillingMilestone => ({ id, label: id, amountCents: dollars * 100, ...(plannedDate ? { plannedDate } : {}), ...over })
const paid = (id: string, dealId: string, milestoneId: string | null, dollars: number, issueDate: string, paidAt: string, over: Partial<InvoiceDto> = {}) =>
  dto({ id, invoiceNumber: `INV-${id}`, dealId, companyId: 'co1', milestoneId, status: 'paid', subtotalCents: dollars * 100, issueDate, payment: { method: 'bank_transfer', paidAt, amountCents: dollars * 110, reference: '' } as never, ...over })
const TEST = { markedAt: '2026-09-01', markedBy: 'u', reason: 'demo' }
const COS = [company('co1', 'Ritchies'), company('co2', 'Kestrel')]
const PROB = (d: Deal): number => (d.stageId === 'sg50' ? 50 : d.stageId === 'sg20' ? 20 : 10)

const input = (o: Partial<ForecastInput>): ForecastInput => ({
  today: TODAY, deals: [], companies: COS, plans: [], invoices: [], lagDays: 30, prob: PROB, retainerUntil: '2028-12-31', ...o,
})
const run = (o: Partial<ForecastInput>, range: FcRange = 'fy') => {
  const f = buildForecast(input(o))
  const s = summarise(f, rangeMonths(range, TODAY, latestDay(f.entries)))
  return { f, s, fy: byFinancialYear(s) }
}
const fyTotals = (fy: ReturnType<typeof byFinancialYear>, k: 'invoiced' | 'collected') => Object.fromEntries(fy.map(r => [fyLabel(r.fy), r.bucket[k] / 100]))

// ── Ritchies, as in production: $970,000 contracted, two milestones paid 44 days after issue, 14 planned from
// 16 Nov 2026 to 15 Apr 2030, and two open deals with no close date.
const RITCHIES_MS = [
  ms('p1', 50000, '2026-06-15'), ms('p2', 41455, '2026-08-01'),
  // FY27: 417,409
  ms('a1', 70000, '2026-11-16'), ms('a2', 70000, '2027-01-15'), ms('a3', 70000, '2027-02-15'), ms('a4', 70000, '2027-03-15'), ms('a5', 70000, '2027-04-15'), ms('a6', 67409, '2027-06-15'),
  // FY28: 361,136
  ms('b1', 60000, '2027-08-16'), ms('b2', 60000, '2027-10-15'), ms('b3', 60000, '2027-12-15'), ms('b4', 60000, '2028-02-15'), ms('b5', 60000, '2028-04-17'), ms('b6', 61136, '2028-06-15'),
  // FY29 and FY30: 50,000 each
  ms('c1', 50000, '2029-04-16'), ms('d1', 50000, '2030-04-15'),
]
const RITCHIES = {
  deals: [
    deal('rit', { title: 'Ritchies platform' }),
    deal('op1', { status: 'open', value: 97500, close: '', stageId: 'sg50' }),
    deal('op2', { status: 'open', value: 100000, close: '', stageId: 'sg20' }),
  ],
  plans: [plan('rit', { contract: contract(97000000), milestones: RITCHIES_MS })],
  invoices: [
    paid('i1', 'rit', 'p1', 50000, '2026-07-01', '2026-08-14'),
    paid('i2', 'rit', 'p2', 41455, '2026-08-20', '2026-10-03T02:00:00.000Z'),
  ],
}

describe('Ardorio forecast: a Ritchies-shaped contract', () => {
  it('forecasts the remaining milestones by financial year, and the backlog reconciles', () => {
    const { f, s, fy } = run(RITCHIES)
    expect(f.backlog).toBe(87854500)
    expect(f.unscheduled).toBe(0)
    expect(f.overScheduled).toBe(0)
    expect(fy.map(r => r.label)).toEqual(['FY27 (Oct 2026 to Jun 2027)', 'FY28', 'FY29', 'FY30'])
    expect(fyTotals(fy, 'invoiced')).toEqual({ FY27: 417409, FY28: 361136, FY29: 50000, FY30: 50000 })
    expect(s.inRange.invoiced + s.later.invoiced + s.noDate.invoiced + f.unscheduled).toBe(f.backlog)
    expect(reconcileGap(f, s)).toBe(0)
    expect(s.later.invoiced).toBe(0)
  })

  it('shifts collected by the 44 days Ritchies takes to pay', () => {
    const { s, fy } = run({ ...RITCHIES, lagDays: 44 })
    // 15 Jun 2027 is paid 29 Jul 2027 (FY28); 15 Jun 2028 on 29 Jul 2028 (FY29).
    expect(fyTotals(fy, 'collected')).toEqual({ FY27: 350000, FY28: 367409, FY29: 111136, FY30: 50000 })
    // 16 Nov 2026 + 44 days is 30 Dec 2026.
    expect(s.byMonth.get('2026-12')?.collected).toBe(7000000)
    expect(s.byMonth.get('2026-11')?.collected).toBe(0)
  })

  it('takes the median once there are two paid invoices, and 30 days with only one', () => {
    expect(paymentLag(RITCHIES.invoices, TODAY)).toEqual({ days: 44, sample: 2, median: true })
    expect(lagLine(paymentLag(RITCHIES.invoices, TODAY))).toBe('Collected assumes 44 days to pay (median of 2 paid invoices)')
    expect(paymentLag(RITCHIES.invoices.slice(0, 1), TODAY)).toEqual({ days: 30, sample: 1, median: false })
    const three = [...RITCHIES.invoices, paid('i3', 'rit', null, 1000, '2026-09-01', '2026-09-11')]
    expect(paymentLag(three, TODAY)).toEqual({ days: 44, sample: 3, median: true })
    expect(lagLine(paymentLag(three, TODAY), 60)).toContain('Collected assumes 60 days to pay')
  })

  it('weights the two open deals in the pipeline No date bucket, never in the contracted totals', () => {
    const { s, f } = run(RITCHIES)
    expect(s.noDate.pipeline).toBe(4875000 + 2000000)
    expect(s.noDate.pipelineValue).toBe(9750000 + 10000000)
    expect(s.inRange.pipeline).toBe(0)
    expect(s.noDate.invoiced).toBe(0)
    expect(f.backlog).toBe(87854500)
  })
})

describe('Ardorio forecast: which invoices count', () => {
  const P = plan('d1', { contract: contract(3000000), milestones: [ms('m1', 10000, '2026-12-01'), ms('m2', 10000, '2027-01-10'), ms('m3', 10000, '2027-02-10')] })

  it('leaves out cancelled and test invoices: their milestones are still to invoice, and test payments set no lag', () => {
    const invoices = [
      dto({ id: 'v', dealId: 'd1', milestoneId: 'm1', status: 'void', subtotalCents: 1000000 }),
      paid('t', 'd1', 'm2', 10000, '2026-09-01', '2026-09-02', { test: TEST }),
      paid('t2', 'd1', null, 1, '2026-09-01', '2026-09-02', { test: TEST }),
      paid('t3', 'd1', null, 1, '2026-09-01', '2026-09-02', { test: TEST }),
    ]
    const { f, s } = run({ deals: [deal('d1')], plans: [P], invoices })
    expect(f.backlog).toBe(3000000)
    expect(s.inRange.invoiced).toBe(3000000)
    expect(f.entries.filter(e => e.kind === 'invoice')).toHaveLength(0)
    expect(paymentLag(invoices, TODAY).sample).toBe(0)
  })

  it('counts an external record as invoiced, and collects an unpaid one like any other', () => {
    const ext = { source: 'xero', reference: 'INV-0457', recordedBy: 'Me', recordedAt: '2026-09-01T00:00:00Z' } as never
    const invoices = [
      paid('e1', 'd1', 'm1', 10000, '2026-09-01', '2026-09-20', { source: 'external', external: ext }),
      dto({ id: 'e2', dealId: 'd1', companyId: 'co1', milestoneId: 'm2', status: 'sent', subtotalCents: 1000000, issueDate: '2026-10-10', source: 'external', external: ext }),
    ]
    const { f, s } = run({ deals: [deal('d1')], plans: [P], invoices })
    expect(f.backlog).toBe(1000000)
    expect(f.entries.filter(e => e.kind === 'milestone').map(e => e.label)).toEqual(['m3'])
    const e2 = f.entries.find(e => e.id === 'inv:e2')!
    expect(e2).toMatchObject({ issued: true, invoiceDay: null, collectDay: '2026-11-09', label: 'Xero INV-0457' })
    expect(s.byMonth.get('2026-11')?.collected).toBe(1000000)
    expect(s.byMonth.get('2026-11')?.invoiced).toBe(0)
  })

  it('collects an issued invoice this month and flags it when issue date + lag is already past', () => {
    const invoices = [dto({ id: 'late', dealId: 'd1', companyId: 'co1', milestoneId: 'm1', status: 'sent', subtotalCents: 1000000, issueDate: '2026-08-01' })]
    const { f, s } = run({ deals: [deal('d1')], plans: [P], invoices })
    expect(f.entries.find(e => e.id === 'inv:late')).toMatchObject({ collectDay: TODAY, flags: ['overdue-collect'] })
    expect(s.byMonth.get('2026-10')?.collected).toBe(1000000)
  })

  it('collects an issued invoice on no won deal, labelled', () => {
    const invoices = [dto({ id: 'u', dealId: null, companyId: 'co2', milestoneId: null, status: 'sent', subtotalCents: 50000, issueDate: '2026-10-01' })]
    const { f } = run({ deals: [deal('d1')], plans: [P], invoices })
    expect(f.entries.find(e => e.id === 'inv:u')).toMatchObject({ dealName: 'Not on a deal', collectDay: '2026-10-31', flags: ['not-on-deal'] })
  })

  it('counts only approved variations in the contract', () => {
    const vo = (id: string, amountCents: number, status: BillingVariation['status']): BillingVariation => ({ id, label: id, amountCents, reason: 'scope', status, createdAt: '2026-08-01T00:00:00Z', createdBy: 'Me' })
    const p = { ...P, variations: [vo('a', 500000, 'approved'), vo('b', 900000, 'proposed'), vo('c', -200000, 'rejected')] }
    const { f } = run({ deals: [deal('d1')], plans: [p] })
    expect(f.backlog).toBe(3500000)
    expect(f.unscheduled).toBe(500000)
  })
})

describe('Ardorio forecast: overdue to invoice, no date and unscheduled', () => {
  it('puts a past planned date, a delivered milestone and a draft invoice this month, flagged', () => {
    const p = plan('d1', {
      contract: contract(5000000),
      milestones: [
        ms('past', 10000, '2026-09-01'),
        ms('deliv', 10000, '2026-12-01', { deliveredOn: '2026-10-01' }),
        ms('draft', 10000, '2026-12-01'),
        ms('nodate', 10000),
        ms('future', 10000, '2027-03-03'),
      ],
    })
    const invoices = [dto({ id: 'dr', dealId: 'd1', milestoneId: 'draft', status: 'draft', subtotalCents: 1000000 })]
    const { f, s } = run({ deals: [deal('d1')], plans: [p], invoices })
    const by = Object.fromEntries(f.entries.map(e => [e.label, e]))
    expect(by.past).toMatchObject({ invoiceDay: TODAY, flags: ['overdue-invoice'] })
    expect(by.deliv).toMatchObject({ invoiceDay: TODAY, flags: ['delivered', 'overdue-invoice'] })
    expect(by.draft).toMatchObject({ invoiceDay: TODAY, flags: ['draft'] })
    expect(by.nodate).toMatchObject({ invoiceDay: null, collectDay: null })
    expect(s.byMonth.get('2026-10')?.invoiced).toBe(3000000)
    expect(s.noDate.invoiced).toBe(1000000)
    expect(s.noDate.collected).toBe(0)
    expect(s.byMonth.get('2027-03')?.invoiced).toBe(1000000)
    expect(reconcileGap(f, s)).toBe(0)
  })

  it('keeps value no milestone covers as Unscheduled, never spread, and over-scheduled apart', () => {
    const { f, s } = run({
      deals: [deal('d1'), deal('d2')],
      plans: [
        plan('d1', { contract: contract(10000000), milestones: [ms('m', 60000, '2026-12-01')] }),
        plan('d2', { contract: contract(1000000), milestones: [ms('n', 15000, '2026-12-01')] }),
      ],
    })
    expect(f.unscheduled).toBe(4000000)
    expect(f.overScheduled).toBe(500000)
    expect(f.backlog).toBe(11000000)
    expect(s.byMonth.get('2026-12')?.invoiced).toBe(7500000)
    expect(reconcileGap(f, s)).toBe(0)
  })

  it('leaves won deals with no contract out, and lists them', () => {
    const { f } = run({ deals: [deal('d1'), deal('nc')], plans: [plan('d1', { contract: contract(100) }), plan('nc', { milestones: [ms('x', 5, '2026-12-01')] })] })
    expect(f.noContract.map(d => d.id)).toEqual(['nc'])
    expect(f.entries.some(e => e.dealId === 'nc')).toBe(false)
    expect(f.backlog).toBe(100)
  })

  it('counts lost, open and archived deals in no backlog', () => {
    const p = (id: string) => plan(id, { contract: contract(100000), milestones: [ms('m', 1000, '2026-12-01')] })
    const { f } = run({ deals: [deal('l', { status: 'lost' }), deal('a', { archived: true }), deal('c', { companyId: 'co9' })], plans: [p('l'), p('a'), p('c')] })
    expect(f.backlog).toBe(0)
    expect(f.entries).toHaveLength(0)
  })
})

describe('Ardorio forecast: retainer', () => {
  const R = (over: Partial<BillingPlan['retainer']> = {}) => ({ amountCents: 200000, interval: 'monthly' as const, nextInvoiceDate: '2026-11-05', ...over })

  it('is its own series, monthly from the next invoice date, never in the project figures', () => {
    const { f, s } = run({ deals: [deal('d1')], plans: [plan('d1', { contract: contract(1000000), milestones: [ms('m', 10000, '2026-11-20')], retainer: R() })] }, 'm12')
    expect(s.byMonth.get('2026-11')).toMatchObject({ invoiced: 1000000, retainer: 200000 })
    expect(s.months.slice(1).every(m => s.byMonth.get(m)!.retainer === 200000)).toBe(true)
    expect(s.byMonth.get('2026-10')?.retainer).toBe(0)
    expect(s.inRange.retainer).toBe(200000 * 11)
    expect(s.byMonth.get('2026-12')?.retainerCollected).toBe(200000)
    expect(s.inRange.invoiced).toBe(1000000)
    expect(f.backlog).toBe(1000000)
    expect(f.entries.find(e => e.series === 'retainer')?.label).toBe('Retainer, November 2026')
  })

  it('forecasts nothing for an archived or not won deal, and lists a retainer with no date', () => {
    const p = (id: string, over = {}) => plan(id, { retainer: R(over) })
    const { f } = run({ deals: [deal('a', { archived: true }), deal('o', { status: 'open' }), deal('n')], plans: [p('a'), p('o'), p('n', { nextInvoiceDate: undefined })] })
    expect(f.entries.filter(e => e.series === 'retainer')).toHaveLength(0)
    expect(f.retainerNoDate.map(d => d.id)).toEqual(['n'])
  })

  it('collects an issued retainer invoice in the retainer series, and a draft is to issue this month', () => {
    const invoices = [
      dto({ id: 'r1', dealId: 'd1', companyId: 'co1', milestoneId: null, status: 'sent', source: 'retainer', subtotalCents: 200000, issueDate: '2026-10-05' }),
      dto({ id: 'r2', dealId: 'd1', companyId: 'co1', milestoneId: null, status: 'draft', source: 'retainer', subtotalCents: 200000, issueDate: '2026-10-12' }),
    ]
    const { s } = run({ deals: [deal('d1')], plans: [plan('d1', { retainer: R({ lastDraftedFor: '2026-11-05' }) })], invoices }, 'm12')
    expect(s.byMonth.get('2026-11')).toMatchObject({ retainerCollected: 400000, retainer: 0, collected: 0 })
    expect(s.byMonth.get('2026-10')?.retainer).toBe(200000)
  })

  it('keeps a support-retainer contract out of the project backlog and Unscheduled, and reports what it holds beside the retainer', () => {
    const sr = contract(2400000, { engagementType: 'support-retainer' })
    const { f, s } = run({ deals: [deal('d1')], plans: [plan('d1', { contract: sr, retainer: R() })], retainerUntil: '2027-06-30' }, 'm12')
    expect(f.backlog).toBe(0)
    expect(f.unscheduled).toBe(0)
    expect(f.deals).toEqual([])
    // November 2026 to June 2027: eight periods of $2,000.
    expect(s.inRange.retainer).toBe(1600000)
    expect(s.inRange.invoiced).toBe(0)
    expect(f.retainerContracts).toEqual([{ dealId: 'd1', dealName: 'd1', companyId: 'co1', contracted: 2400000, invoiced: 0, scheduled: 0, forecastRetainer: 1600000, left: 800000, beyond: 0 }])
    expect(reconcileGap(f, s)).toBe(0)
  })

  it('says when the retainer forecast runs past a support-retainer contract', () => {
    const sr = contract(2400000, { engagementType: 'support-retainer' })
    const { f } = run({ deals: [deal('d1')], plans: [plan('d1', { contract: sr, retainer: R() })] })
    // November 2026 to December 2028: 26 periods, $52,000 against $24,000.
    expect(f.retainerContracts[0]).toMatchObject({ forecastRetainer: 5200000, left: 0, beyond: 2800000 })
    expect(f.backlog).toBe(0)
  })

  it('counts only the milestones of a support-retainer contract as project backlog, and its retainer invoices against the contract', () => {
    const sr = contract(2400000, { engagementType: 'support-retainer' })
    const invoices = [dto({ id: 'r1', dealId: 'd1', companyId: 'co1', milestoneId: null, status: 'paid', source: 'retainer', subtotalCents: 200000, issueDate: '2026-10-05' })]
    const { f, s } = run({ deals: [deal('d1')], plans: [plan('d1', { contract: sr, milestones: [ms('setup', 5000, '2026-12-01')], retainer: R() })], invoices, retainerUntil: '2027-06-30' }, 'm12')
    expect(f.backlog).toBe(500000)
    expect(f.unscheduled).toBe(0)
    expect(f.deals).toMatchObject([{ dealId: 'd1', backlog: 500000, scheduled: 500000, unscheduled: 0, overScheduled: 0 }])
    expect(f.retainerContracts[0]).toMatchObject({ invoiced: 200000, scheduled: 500000, forecastRetainer: 1600000, left: 100000, beyond: 0 })
    expect(reconcileGap(f, s)).toBe(0)
  })

  it('forecasts a retainer that is behind as the scheduler drafts it: only the latest period, this month, the rest skipped', () => {
    const { f, s } = run({ deals: [deal('d1')], plans: [plan('d1', { retainer: R({ nextInvoiceDate: '2026-04-05' }) })] }, 'm12')
    const due = f.entries.filter(e => e.series === 'retainer' && e.invoiceDay === TODAY)
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ label: 'Retainer, October 2026', cents: 200000, flags: ['overdue-invoice'] })
    expect(s.byMonth.get('2026-10')?.retainer).toBe(200000)
    expect(s.byMonth.get('2026-11')?.retainer).toBe(200000)
    expect(f.retainerSkipped).toEqual([{ deal: expect.objectContaining({ id: 'd1' }), periods: ['2026-04-05', '2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05'] }])
    expect(f.entries.some(e => e.id === 'ret:d1:2026-09-05')).toBe(false)
  })

  it('skips nothing for one period due, and leaves out the period the server already claimed', () => {
    const one = run({ deals: [deal('d1')], plans: [plan('d1', { retainer: R({ nextInvoiceDate: '2026-10-14' }) })] }, 'm12')
    expect(one.f.retainerSkipped).toEqual([])
    expect(one.f.entries.find(e => e.id === 'ret:d1:2026-10-14')).toMatchObject({ invoiceDay: TODAY, flags: [] })
    // Claimed August: the server finishes that draft, then catches up from September to October.
    const claimed = run({ deals: [deal('d1')], plans: [plan('d1', { retainer: R({ nextInvoiceDate: '2026-08-05', lastDraftedFor: '2026-08-05' }) })] }, 'm12')
    expect(claimed.s.byMonth.get('2026-10')?.retainer).toBe(200000)
    expect(claimed.f.retainerSkipped.map(r => r.periods)).toEqual([['2026-09-05']])
  })
})

describe('Ardorio forecast: weighted pipeline', () => {
  it('is value x stage probability in the month of the close date, apart from the contracted figures', () => {
    const deals = [
      deal('o1', { status: 'open', value: 40000, close: '2027-02-10', stageId: 'sg50' }),
      deal('o2', { status: 'open', value: 10000, close: '2026-09-01', stageId: 'sg20' }),
      deal('o3', { status: 'open', value: 30000, close: '' }),
      deal('o4', { status: 'open', value: 99999, close: '2027-01-01', archived: true }),
      deal('o5', { status: 'open', value: 99999, close: '2027-01-01', businessId: 'ros' }),
    ]
    const { f, s } = run({ deals }, 'm12')
    expect(s.byMonth.get('2027-02')).toMatchObject({ pipeline: 2000000, pipelineValue: 4000000, invoiced: 0, collected: 0 })
    expect(f.entries.find(e => e.dealId === 'o2')).toMatchObject({ invoiceDay: TODAY, flags: ['close-passed'], cents: 200000 })
    expect(s.noDate).toMatchObject({ pipeline: 300000, pipelineValue: 3000000 })
    expect(f.entries.filter(e => e.series === 'pipeline')).toHaveLength(3)
    expect(f.backlog).toBe(0)
  })
})

describe('Ardorio forecast: slippage', () => {
  it('moves only planned, undelivered milestones still ahead: not overdue ones, issued invoices or pipeline', () => {
    const p = plan('d1', { contract: contract(4000000), milestones: [ms('fut', 10000, '2026-11-30'), ms('jan', 10000, '2027-01-31'), ms('past', 10000, '2026-09-01'), ms('sent', 10000, '2026-11-01')] })
    const invoices = [dto({ id: 's', dealId: 'd1', companyId: 'co1', milestoneId: 'sent', status: 'sent', subtotalCents: 1000000, issueDate: '2026-10-10' })]
    const deals = [deal('d1'), deal('o1', { status: 'open', value: 1000, close: '2026-11-15', stageId: 'sg50' })]
    const base = run({ deals, plans: [p], invoices }, 'm12')
    const two = run({ deals, plans: [p], invoices, slip: 2 }, 'm12')
    const day = (r: typeof base, id: string) => r.f.entries.find(e => e.id === id)
    expect(day(two, 'ms:d1:fut')).toMatchObject({ invoiceDay: '2027-01-30', collectDay: '2027-03-01', flags: ['slipped'] })
    expect(day(two, 'ms:d1:jan')?.invoiceDay).toBe('2027-03-31')
    expect(day(two, 'ms:d1:past')).toEqual(day(base, 'ms:d1:past'))
    expect(day(two, 'inv:s')).toEqual(day(base, 'inv:s'))
    expect(day(two, 'pl:o1')).toEqual(day(base, 'pl:o1'))
    expect(two.s.byMonth.get('2026-11')?.invoiced).toBe(0)
    expect(reconcileGap(two.f, two.s)).toBe(0)
  })
})

describe('Ardorio forecast: range, later and reconciliation', () => {
  it('lists 12 or 24 months from this month, or whole financial years to the latest forecast', () => {
    expect(rangeMonths('m12', TODAY)).toHaveLength(12)
    expect(rangeMonths('m12', TODAY)[0]).toBe('2026-10')
    expect(rangeMonths('m12', TODAY).at(-1)).toBe('2027-09')
    expect(rangeMonths('m24', TODAY).at(-1)).toBe('2028-09')
    expect(rangeMonths('fy', TODAY).at(-1)).toBe('2028-06')
    expect(rangeMonths('fy', TODAY, '2030-05-29').at(-1)).toBe('2030-06')
    expect(rangeMonths('fy', TODAY, '2060-01-01').at(-1)).toBe('2036-06')
  })

  it('summarises what is past the range as Later, so every range reconciles', () => {
    for (const r of ['m12', 'm24', 'fy'] as const) {
      const { f, s } = run({ ...RITCHIES, lagDays: 44 }, r)
      expect(reconcileGap(f, s)).toBe(0)
      expect(s.inRange.collected + s.later.collected).toBe(f.backlog)
    }
    const { s } = run(RITCHIES, 'm12')
    expect(s.inRange.invoiced).toBe(41740900 + 6000000) // Oct 2026 to Sep 2027: all of FY27 and August 2027
    expect(s.later.invoiced).toBe(87854500 - s.inRange.invoiced)
  })

  it('names financial years July to June and groups the months into them', () => {
    expect(fyOf('2026-06')).toBe(2026)
    expect(fyOf('2026-07')).toBe(2027)
    expect(fyLabel(2030)).toBe('FY30')
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2026-11-15', -24)).toBe('2024-11-15')
  })

  it('drills a bucket down to its deals, and charts invoiced, collected and pipeline side by side in dollars', () => {
    const { s } = run({ ...RITCHIES, deals: [...RITCHIES.deals, deal('o1', { status: 'open', value: 1000, close: '2026-11-15', stageId: 'sg50' })] }, 'm12')
    const nov = s.byMonth.get('2026-11')!
    const drill = drillByDeal(nov)
    expect(drill.map(d => d.dealName)).toEqual(['Ritchies platform', 'o1'])
    expect(drill[0].total).toEqual({ invoiced: 7000000 })
    expect(forecastBars(s)[1]).toEqual({ l: 'Nov 2026', v: [70000, 0, 500] })
  })
})

describe('Ardorio forecast: days to pay', () => {
  it('takes the median of paid invoices in the last 24 months, rounding an even count', () => {
    const list = [
      paid('a', 'x', null, 1, '2026-01-01', '2026-01-11'),
      paid('b', 'x', null, 1, '2026-01-01', '2026-01-21'),
      paid('c', 'x', null, 1, '2026-01-01', '2026-02-01'),
      paid('d', 'x', null, 1, '2026-01-01', '2026-02-02'),
      paid('old', 'x', null, 1, '2024-01-01', '2024-06-01'),
    ]
    expect(paymentLag(list, TODAY)).toEqual({ days: 26, sample: 4, median: true })
  })

  it('accepts a whole number of days from 0 to 365 only', () => {
    expect(parseLag('44')).toBe(44)
    expect(parseLag(' 0 ')).toBe(0)
    expect(parseLag('366')).toBeNull()
    expect(parseLag('4.5')).toBeNull()
    expect(parseLag('')).toBeNull()
  })
})

describe('Ardorio forecast: an invoice billed to an unlinked client but linked to the company', () => {
  it('counts exactly as if it were billed to the company’s own client', () => {
    const sent = dto({ id: 'tc', invoiceNumber: 'INV-0001', clientSlug: 'tidewater', dealId: 'rit', companyId: 'co1', milestoneId: 'a1', status: 'sent', overdue: true, subtotalCents: 7000000, issueDate: '2026-08-17', dueDate: '2026-08-31' })
    const own = run({ ...RITCHIES, invoices: [...RITCHIES.invoices, sent] })
    const other = run({ ...RITCHIES, invoices: [...RITCHIES.invoices, { ...sent, clientSlug: 'test-client', clientName: 'Test Client' }] })
    const strip = (x: unknown): string => JSON.stringify(x, (k, v) => (k === 'clientSlug' || k === 'clientName' ? undefined : v))
    expect(strip(other)).toBe(strip(own))
    expect(other.f.entries.some(e => e.dealId === 'rit' && e.label === 'INV-0001')).toBe(true)
  })
})
