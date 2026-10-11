import { describe, expect, it } from 'vitest'
import type { BillingClient, BillingPlan, InvoiceCompanyTotals } from '../api/contract'
import { dto } from '../testing/invoicingWorld'
import {
  ardorioCustomers, ardorioTiles, billingProgress, cleanMilestone, companyBilling, latestInvoices, linkSuggestions, planId, prefillForm, quotedCents, scheduleRows,
  unbilledRows, validateMilestones, validateRetainer, wonNotInvoiced,
} from './billing'
import { blankForm, buildInput, milestoneStatus, validateForm } from './invoices'
import type { Company, Deal } from '../data/types'

const PLAN: BillingPlan = {
  id: 'bp_dl1', dealId: 'dl1', businessId: 'ard',
  milestones: [
    { id: 'm1', label: 'Discovery and design', amountCents: 1800000, plannedDate: '2026-08-15' },
    { id: 'm2', label: 'Core platform', amountCents: 1800000 },
    { id: 'm3', label: 'Integration and handover', amountCents: 1800000 },
    { id: 'm4', label: 'Final acceptance', amountCents: 600000 },
  ],
}

describe('derived milestone status', () => {
  it('is Planned with no invoice, and follows the furthest invoice after that', () => {
    expect(milestoneStatus('m1', [])).toBe('Planned')
    expect(milestoneStatus('m1', [dto({ milestoneId: 'm1', status: 'draft' })])).toBe('Draft invoice')
    expect(milestoneStatus('m1', [dto({ milestoneId: 'm1', status: 'sent' })])).toBe('Invoiced')
    expect(milestoneStatus('m1', [dto({ milestoneId: 'm1', status: 'paid' })])).toBe('Paid')
  })
  it('ignores invoices for other milestones and takes the furthest of several', () => {
    const list = [dto({ id: 'a', milestoneId: 'm2', status: 'paid' }), dto({ id: 'b', milestoneId: 'm1', status: 'draft' }), dto({ id: 'c', milestoneId: 'm1', status: 'sent' })]
    expect(milestoneStatus('m1', list)).toBe('Invoiced')
    expect(milestoneStatus('m3', list)).toBe('Planned')
  })
  it('scheduleRows pairs each milestone with its furthest invoice, and unbilled keeps only Planned', () => {
    const list = [
      dto({ id: 'a', invoiceNumber: 'INV-1', milestoneId: 'm1', status: 'paid' }),
      dto({ id: 'b', invoiceNumber: 'INV-2', milestoneId: 'm2', status: 'sent' }),
      dto({ id: 'c', invoiceNumber: 'INV-3', milestoneId: 'm3', status: 'draft' }),
    ]
    const rows = scheduleRows(PLAN, list)
    expect(rows.map(r => [r.status, r.invoice?.invoiceNumber ?? null])).toEqual([['Paid', 'INV-1'], ['Invoiced', 'INV-2'], ['Draft invoice', 'INV-3'], ['Planned', null]])
    expect(unbilledRows(rows).map(r => r.milestone.id)).toEqual(['m4'])
    expect(scheduleRows(undefined, list)).toEqual([])
  })
})

describe('progress maths', () => {
  const list = [
    dto({ id: 'a', status: 'paid', subtotalCents: 1800000 }),
    dto({ id: 'b', status: 'sent', subtotalCents: 1800000 }),
    dto({ id: 'c', status: 'draft', subtotalCents: 1800000 }),
  ]
  it('quoted is the deal value in cents; billed is the non-draft invoices ex GST', () => {
    expect(quotedCents({ value: 60000 })).toBe(6000000)
    expect(quotedCents({ value: 59999.99 })).toBe(5999999)
    const p = billingProgress(6000000, list)
    expect(p).toMatchObject({ quoted: 6000000, billed: 3600000, paid: 1800000, invoiced: 1800000, unbilled: 2400000 })
    expect(p).toMatchObject({ billedPct: 60, paidPct: 30, invoicedPct: 30 })
  })
  it('a draft counts for nothing, and nothing quoted gives zero percent without dividing by zero', () => {
    expect(billingProgress(6000000, [list[2]])).toMatchObject({ billed: 0, billedPct: 0, unbilled: 6000000 })
    expect(billingProgress(0, list)).toMatchObject({ billed: 3600000, billedPct: 0, unbilled: 0 })
  })
  it('billing more than was quoted caps the bar at 100% and never shows a negative unbilled', () => {
    const p = billingProgress(1000000, list)
    expect(p.billedPct).toBe(100)
    expect(p.unbilled).toBe(0)
    expect(p.paidPct + p.invoicedPct).toBe(100)
  })
})

describe('the prefilled editor payload', () => {
  it('a milestone gives company, deal, milestone and exactly one line for the milestone amount', () => {
    const f = prefillForm(blankForm('2026-10-09'), { companyId: 'co1', dealId: 'dl1', milestoneId: 'm2' }, PLAN)
    expect(f).toMatchObject({ companyId: 'co1', dealId: 'dl1', milestoneId: 'm2' })
    expect(f.lines).toEqual([{ description: 'Core platform', detail: '', qty: '1', unitPrice: '18000.00' }])
    const input = buildInput({ ...f, clientSlug: 'tidewater' })
    expect(input).toMatchObject({ clientSlug: 'tidewater', companyId: 'co1', dealId: 'dl1', milestoneId: 'm2' })
    expect(input.lineItems).toEqual([{ description: 'Core platform', qty: 1, unitPriceCents: 1800000 }])
    expect(validateForm({ ...f, clientSlug: 'tidewater' }).ok).toBe(true)
  })
  it('an unknown milestone leaves the line blank rather than guessing', () => {
    const f = prefillForm(blankForm('2026-10-09'), { companyId: 'co1', dealId: 'dl1', milestoneId: 'gone' }, PLAN)
    expect(f.milestoneId).toBe('')
    expect(f.lines[0].description).toBe('')
  })
  it('a retainer invoice has one monthly line and no milestone', () => {
    const plan: BillingPlan = { ...PLAN, milestones: [], retainer: { amountCents: 450000, interval: 'monthly' } }
    const f = prefillForm(blankForm('2026-10-09'), { companyId: 'co1', dealId: 'dl1', retainer: true }, plan)
    expect(f.milestoneId).toBe('')
    expect(f.lines).toEqual([{ description: 'Monthly retainer', detail: '', qty: '1', unitPrice: '4500.00' }])
  })
})

describe('billingPlans validation (as the API)', () => {
  const ms = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, label: `M${i}`, amountCents: 100 }))
  it('accepts up to 40 milestones and refuses 41', () => {
    expect(validateMilestones(ms(40))).toBeNull()
    expect(validateMilestones(ms(41))).toMatch(/at most 40/)
  })
  it('labels are 1 to 120 characters after trimming', () => {
    expect(validateMilestones([{ id: 'a', label: 'x'.repeat(120), amountCents: 1 }])).toBeNull()
    expect(validateMilestones([{ id: 'a', label: 'x'.repeat(121), amountCents: 1 }])).toMatch(/label/)
    expect(validateMilestones([{ id: 'a', label: '   ', amountCents: 1 }])).toMatch(/label/)
  })
  it('amounts are integer cents from 1 to 100000000', () => {
    const one = (amountCents: number) => validateMilestones([{ id: 'a', label: 'L', amountCents }])
    expect(one(1)).toBeNull()
    expect(one(100_000_000)).toBeNull()
    for (const bad of [0, -5, 100_000_001, 10.5, Number.NaN]) expect(one(bad)).toMatch(/amount/)
  })
  it('ids must be unique and a planned date must be a real day', () => {
    expect(validateMilestones([{ id: 'a', label: 'L', amountCents: 1 }, { id: 'a', label: 'M', amountCents: 1 }])).toMatch(/id/)
    expect(validateMilestones([{ id: 'a', label: 'L', amountCents: 1, plannedDate: '2026-02-30' }])).toMatch(/date/)
    expect(validateMilestones([{ id: 'a', label: 'L', amountCents: 1, plannedDate: '2026-02-28' }])).toBeNull()
  })
  it('the retainer has the same amount limits, a monthly interval and a valid next date', () => {
    expect(validateRetainer({ amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-11-01' })).toBeNull()
    expect(validateRetainer({ amountCents: 0, interval: 'monthly' })).toMatch(/amount/)
    expect(validateRetainer({ amountCents: 450000, interval: 'monthly', nextInvoiceDate: 'soon' })).toMatch(/date/)
  })
  it('cleaning trims the label and drops an empty date; the plan id is bp_<dealId>', () => {
    expect(cleanMilestone({ id: 'a', label: '  Kickoff ', amountCents: 5, plannedDate: '' })).toEqual({ id: 'a', label: 'Kickoff', amountCents: 5 })
    expect(planId('dl9')).toBe('bp_dl9')
  })
})

describe('company billing and link suggestions', () => {
  it('totals count issued invoices only, ex GST, and overdue is part of outstanding', () => {
    const t = companyBilling([
      dto({ status: 'paid', subtotalCents: 1800000 }), dto({ status: 'sent', subtotalCents: 1800000 }),
      dto({ status: 'sent', overdue: true, subtotalCents: 450000 }), dto({ status: 'draft', subtotalCents: 999999 }),
    ])
    expect(t).toEqual({ invoicedCents: 4050000, paidCents: 1800000, outstandingCents: 2250000, overdueCents: 450000 })
  })
  it('the last five are newest first', () => {
    const list = Array.from({ length: 7 }, (_, i) => dto({ id: `i${i}`, invoiceNumber: `INV-${i}`, createdAt: `2026-09-0${i + 1}T00:00:00Z` }))
    expect(latestInvoices(list).map(i => i.invoiceNumber)).toEqual(['INV-6', 'INV-5', 'INV-4', 'INV-3', 'INV-2'])
  })

  const client = (slug: string, over: Partial<BillingClient> = {}): BillingClient => ({ slug, clientName: slug, billing: {}, linkedCompanyId: null, ...over })
  const co = { name: 'Tidewater Foods Pty Ltd', tradingName: '', website: 'https://www.tidewaterfoods.example/about', domain: 'tidewaterfoods.example' }
  it('suggests by name, by billing email domain and by ABN, with the reason (equal matches in name order)', () => {
    const s = linkSuggestions({ ...co, abn: '12 345 678 901' }, [
      client('a', { clientName: 'Tidewater Foods' }),
      client('b', { clientName: 'T Foods', billing: { email: 'ap@tidewaterfoods.example' } }),
      client('c', { clientName: 'Different', billing: { abn: '12345678901' } }),
      client('d', { clientName: 'Nothing alike', billing: { email: 'x@gmail.com', abn: '99999999999' } }),
    ])
    expect(s.map(x => [x.client.slug, x.reasons])).toEqual([
      ['c', ['Same ABN']], ['b', ['Billing email is on the company website']], ['a', ['Same name']],
    ])
  })
  it('a client that matches on several grounds ranks first, linked and dismissed clients are not offered', () => {
    const s = linkSuggestions(co, [
      client('weak', { clientName: 'Tidewater Foods' }),
      client('strong', { clientName: 'Tidewater Foods', billing: { email: 'a@tidewaterfoods.example' } }),
      client('taken', { clientName: 'Tidewater Foods', linkedCompanyId: 'co9' }),
      client('nope', { clientName: 'Tidewater Foods' }),
    ], new Set(['nope']))
    expect(s.map(x => x.client.slug)).toEqual(['strong', 'weak'])
  })
  it('an email on a similar-looking domain is not a match, and no ABN on the company means no ABN match', () => {
    expect(linkSuggestions(co, [client('x', { clientName: 'Other', billing: { email: 'a@tidewaterfoods.example.evil.com', abn: '12345678901' } })])).toEqual([])
  })
})

describe('Customers, Ardorio', () => {
  const T = (o: Partial<InvoiceCompanyTotals> & { companyId: string }): InvoiceCompanyTotals => ({
    clientSlug: o.companyId, clientName: o.companyId, invoicedCents: 0, paidCents: 0, outstandingCents: 0, overdueCents: 0, lastPaymentAt: null, lastPaymentMethod: null, ...o,
  })
  const company = (id: string, name: string, over: Partial<Company> = {}) => ({ id, name, ...over }) as Company
  const deal = (id: string, companyId: string, over: Partial<Deal> = {}) => ({ id, companyId, businessId: 'ard', status: 'won', value: 60000, title: id, name: id, closedAt: '2026-07-28T09:00', stageChangedAt: '2026-07-28T09:00', ...over }) as Deal
  const totals = [
    T({ companyId: 'co1', invoicedCents: 3600000, paidCents: 1800000, outstandingCents: 1800000, lastPaymentAt: '2026-08-20', lastPaymentMethod: 'bank-transfer' }),
    T({ companyId: 'co2', invoicedCents: 1350000, paidCents: 900000, outstandingCents: 450000, overdueCents: 450000 }),
    T({ companyId: 'co3', invoicedCents: 180000, paidCents: 180000 }),
  ]
  it('tiles sum the summary, and count the customers that are overdue', () => {
    expect(ardorioTiles(totals)).toEqual({ invoicedCents: 5130000, paidCents: 2880000, outstandingCents: 2250000, overdueCents: 450000, overdueCustomers: 1 })
  })
  it('rows are companies with an issued invoice or a won deal, biggest balance first, archived left out', () => {
    const rows = ardorioCustomers(
      [...totals, T({ companyId: 'co5', invoicedCents: 100 }), T({ companyId: 'co6', invoicedCents: 0 })],
      [deal('dl1', 'co1'), deal('dl2', 'co4'), deal('dl3', 'co1', { status: 'open' }), deal('dl4', 'co1', { businessId: 'ros' })],
      [company('co1', 'Tidewater'), company('co2', 'Banksia'), company('co3', 'Larch'), company('co4', 'Won only'), company('co5', 'Archived', { archived: true }), company('co6', 'Zero')],
      [{ id: 'bp_dl2', dealId: 'dl2', businessId: 'ard', milestones: [], retainer: { amountCents: 1, interval: 'monthly' } }],
    )
    expect(rows.map(r => [r.name, r.wonDeals, r.outstandingCents])).toEqual([['Tidewater', 1, 1800000], ['Banksia', 0, 450000], ['Larch', 0, 0], ['Won only', 1, 0]])
    expect(rows.find(r => r.name === 'Won only')?.retainer).toBe(true)
    expect(rows[0]).toMatchObject({ lastPaymentAt: '2026-08-20', lastPaymentMethod: 'bank-transfer', wonValue: 60000 })
  })
  it('won, not yet invoiced: won Ardorio deals with no invoice at all, a draft counts as an invoice', () => {
    const deals = [deal('dl1', 'co1'), deal('dl2', 'co2'), deal('dl3', 'co2', { status: 'open' }), deal('dl4', 'co2', { businessId: 'ros' }), deal('dl5', 'co9')]
    const out = wonNotInvoiced(deals, [company('co1', 'A'), company('co2', 'B'), company('co9', 'Gone', { archived: true })], [dto({ dealId: 'dl1', status: 'draft' })])
    expect(out.map(d => d.id)).toEqual(['dl2'])
  })
})

describe('cancelled invoices in billing', () => {
  const live = dto({ id: 'v', milestoneId: 'm2', status: 'void', subtotalCents: 1800000, voided: { voidedAt: '2026-10-12T00:00:00Z', voidedBy: 'u', reason: 'mistake', note: '', linkDeactivated: true } })
  it('the milestone returns to Planned, and the cancelled invoice shows only as a note', () => {
    const rows = scheduleRows(PLAN, [live])
    expect(rows[1].status).toBe('Planned')
    expect(rows[1].invoice).toBeNull()
    expect(rows[1].cancelled?.id).toBe('v')
    expect(unbilledRows(rows).map(r => r.milestone.id)).toContain('m2')
  })
  it('a replacement draft takes over from the cancelled invoice', () => {
    const rows = scheduleRows(PLAN, [live, dto({ id: 'n', milestoneId: 'm2', status: 'draft' })])
    expect(rows[1].status).toBe('Draft invoice')
    expect(rows[1].invoice?.id).toBe('n')
  })
  it('billed progress excludes cancelled invoices', () => {
    const p = billingProgress(6000000, [dto({ status: 'paid', subtotalCents: 1800000 }), dto({ status: 'sent', subtotalCents: 1800000 }), live])
    expect(p.billed).toBe(3600000)
    expect(p.invoiced).toBe(1800000)
  })
  it('company totals exclude cancelled invoices', () => {
    expect(companyBilling([dto({ status: 'sent', subtotalCents: 100 }), live])).toEqual({ invoicedCents: 100, paidCents: 0, outstandingCents: 100, overdueCents: 0 })
  })
  it('a won deal whose only invoice was cancelled is not invoiced', () => {
    const deals = [{ id: 'dl1', businessId: 'ard', status: 'won', companyId: 'co1', closedAt: '2026-07-28', stageChangedAt: '2026-07-28' }] as unknown as Deal[]
    const cos = [{ id: 'co1', archived: false }] as unknown as Company[]
    expect(wonNotInvoiced(deals, cos, [dto({ dealId: 'dl1', status: 'void' })]).map(d => d.id)).toEqual(['dl1'])
    expect(wonNotInvoiced(deals, cos, [dto({ dealId: 'dl1', status: 'draft' })])).toEqual([])
  })
})
