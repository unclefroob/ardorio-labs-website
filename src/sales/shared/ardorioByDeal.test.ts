import { describe, expect, it } from 'vitest'
import type { BillingContract, BillingPlan, BillingVariation } from '../api/contract'
import type { Company, Deal } from '../data/types'
import { dto } from '../testing/invoicingWorld'
import { ardorioByDeal, moneyForDeal, nextMilestoneDue, retainerMoney, sortArdorio } from './billing'

const company = (id: string, name: string, over: Partial<Company> = {}) => ({ id, name, archived: false, ...over }) as Company
const deal = (id: string, companyId: string, over: Partial<Deal> = {}) =>
  ({ id, companyId, businessId: 'ard', status: 'won', value: 60000, title: id, name: id, closedAt: '2026-07-28T09:00', stageChangedAt: '2026-07-28T09:00', ...over }) as Deal
const CONTRACT: BillingContract = { baselineCents: 5000000, engagementType: 'fixed-price', contractedOn: '2026-07-28', contractedBy: 'u-me', estimateAtWonCents: 6000000 }
const vo = (id: string, amountCents: number, status: BillingVariation['status']): BillingVariation => ({ id, label: id, amountCents, reason: 'scope', status, createdAt: '2026-08-01T00:00:00Z', createdBy: 'u-me' })
const plan = (dealId: string, over: Partial<BillingPlan> = {}): BillingPlan => ({ id: `bp_${dealId}`, dealId, businessId: 'ard', milestones: [], ...over })

const COS = [company('co1', 'Harbour Group'), company('co2', 'Kestrel Logistics'), company('co3', 'Northgate'), company('co9', 'Gone', { archived: true })]

// Harbour: dl1 contracted 50,000 + 6,400 approved (a proposed one and a rejected one do not count), four milestones.
const P1 = plan('dl1', {
  contract: CONTRACT,
  variations: [vo('v1', 640000, 'approved'), vo('v2', 300000, 'proposed'), vo('v3', -100000, 'rejected')],
  retainer: { amountCents: 100000, interval: 'monthly' },
  milestones: [
    { id: 'm1', label: 'Discovery', amountCents: 1000000, plannedDate: '2026-08-01', deliveredOn: '2026-08-05' },
    { id: 'm2', label: 'Build', amountCents: 2000000, plannedDate: '2026-09-01', deliveredOn: '2026-09-20' },
    { id: 'm3', label: 'Launch', amountCents: 1500000, plannedDate: '2027-02-01' },
    { id: 'm4', label: 'Hypercare', amountCents: 500000, plannedDate: '2026-12-01' },
  ],
})
const INV = [
  dto({ id: 'a', dealId: 'dl1', companyId: 'co1', milestoneId: 'm1', status: 'paid', subtotalCents: 1000000 }),
  // An external record for part of m2, overdue: counts as project money.
  dto({ id: 'b', dealId: 'dl1', companyId: 'co1', milestoneId: null, status: 'sent', overdue: true, subtotalCents: 800000, source: 'external', external: { source: 'xero', reference: 'INV-0457', recordedBy: 'u-me', recordedAt: '2026-09-01T00:00:00Z' } as never }),
  // Retainer invoices: one paid by hand, one sent from the scheduler.
  dto({ id: 'r1', dealId: 'dl1', companyId: 'co1', milestoneId: null, status: 'paid', subtotalCents: 100000 }),
  dto({ id: 'r2', dealId: 'dl1', companyId: 'co1', milestoneId: null, status: 'sent', subtotalCents: 100000, source: 'retainer' }),
  // Never counted: cancelled, test, draft.
  dto({ id: 'v', dealId: 'dl1', companyId: 'co1', milestoneId: 'm2', status: 'void', subtotalCents: 2000000 }),
  dto({ id: 't', dealId: 'dl1', companyId: 'co1', milestoneId: 'm2', status: 'paid', subtotalCents: 2000000, test: { markedAt: '2026-09-01', markedBy: 'u', reason: 'demo' } }),
  dto({ id: 'd', dealId: 'dl1', companyId: 'co1', milestoneId: 'm4', status: 'draft', subtotalCents: 500000 }),
  // On the company, no deal: counted for the company, listed as unlinked.
  dto({ id: 'u1', dealId: null, companyId: 'co1', status: 'sent', subtotalCents: 30000, issueDate: '2026-10-01' }),
  // No company at all.
  dto({ id: 'u2', dealId: null, companyId: null, status: 'paid', subtotalCents: 20000, issueDate: '2026-10-02' }),
  // A cancelled and a test unlinked one stay out of the list.
  dto({ id: 'u3', dealId: null, companyId: 'co1', status: 'void', subtotalCents: 1 }),
  dto({ id: 'u4', dealId: null, companyId: 'co1', status: 'sent', subtotalCents: 1, test: { markedAt: '2026-09-01', markedBy: 'u', reason: 'demo' } }),
  // Kestrel, fully invoiced and collected.
  dto({ id: 'k', dealId: 'dl2', companyId: 'co2', milestoneId: 'k1', status: 'paid', subtotalCents: 1800000 }),
]
const P2 = plan('dl2', { contract: { ...CONTRACT, baselineCents: 1800000, engagementType: 'time-materials' }, milestones: [{ id: 'k1', label: 'All', amountCents: 1800000, deliveredOn: '2026-09-01' }] })
const DEALS = [
  deal('dl1', 'co1', { title: 'Client portal' }), deal('dl2', 'co2', { title: 'Routing' }),
  deal('dl3', 'co3', { title: 'Pilot', value: 36000 }), // won before the ledger: no contract
  deal('dl4', 'co1', { status: 'open' }), deal('dl5', 'co1', { businessId: 'ros' }), deal('dl6', 'co1', { archived: true }), deal('dl7', 'co9'),
]
const run = () => ardorioByDeal(DEALS, COS, [P1, P2], INV)

describe('ardorioByDeal: the deal figures', () => {
  it('contracted is baseline plus approved variations only', () => {
    const r = run().companies.find(c => c.companyId === 'co1')!.deals[0]
    expect(r.money.contracted).toBe(5640000)
  })
  it('match the deal page exactly: the same moneyForDeal over the same invoices', () => {
    const r = run().companies.find(c => c.companyId === 'co1')!.deals[0]
    expect(r.money).toEqual(moneyForDeal(DEALS[0], P1, INV))
  })
  it('earned is delivered milestones; invoiced counts external, never void, test, draft or retainer', () => {
    const r = run().companies.find(c => c.companyId === 'co1')!.deals[0]
    expect(r.money).toMatchObject({ earned: 3000000, invoiced: 1800000, collected: 1000000, outstanding: 800000, retainerInvoiced: 200000 })
    expect(r.overdueCents).toBe(800000)
    expect(r.engagement).toBe('fixed-price')
  })
  it('retainer invoices sit on their own line', () => {
    const r = run().companies.find(c => c.companyId === 'co1')!.deals[0]
    expect(r.retainer).toEqual({ invoiced: 200000, collected: 100000, outstanding: 100000 })
    expect(retainerMoney('dl2', P2, INV)).toBeNull()
  })
  it('a won deal with no contract shows its estimate, contracted null', () => {
    const r = run().companies.find(c => c.companyId === 'co3')!
    expect(r.deals[0].money).toMatchObject({ contracted: null, estimate: 3600000 })
    expect(r.contractedCents).toBe(0)
    expect(r.estimateOnlyCents).toBe(3600000)
    expect(r.deals[0].engagement).toBeNull()
  })
  it('next milestone due is the earliest dated Planned one: not delivered, no live invoice (a draft counts)', () => {
    const r = run().companies.find(c => c.companyId === 'co1')!.deals[0]
    // m4 (Dec) has a draft, so m3 (Feb) is next.
    expect(r.next?.id).toBe('m3')
    // With no invoices, m4 (Dec) is before m3 (Feb); m1 and m2 are delivered.
    expect(nextMilestoneDue(P1, [])?.id).toBe('m4')
    // Undated milestones come after dated ones, in schedule order; nothing Planned is null.
    expect(nextMilestoneDue(plan('x', { milestones: [{ id: 'a', label: 'A', amountCents: 1 }, { id: 'b', label: 'B', amountCents: 1, plannedDate: '2027-01-01' }] }), [])?.id).toBe('b')
    expect(nextMilestoneDue(plan('x', { milestones: [{ id: 'a', label: 'A', amountCents: 1 }] }), [])?.id).toBe('a')
    expect(nextMilestoneDue(plan('x', { milestones: [{ id: 'a', label: 'A', amountCents: 1, deliveredOn: '2026-01-01' }] }), [])).toBeNull()
  })
})

describe('ardorioByDeal: the company figures', () => {
  it('only won, unarchived Ardorio deals of live companies; a company with only an unlinked invoice still shows', () => {
    const out = run()
    expect(out.companies.map(c => [c.name, c.deals.map(d => d.deal.id)])).toEqual([
      ['Harbour Group', ['dl1']], ['Kestrel Logistics', ['dl2']], ['Northgate', ['dl3']],
    ])
  })
  it('the company counts every issued invoice: project, retainer and not linked to a deal', () => {
    const c = run().companies.find(x => x.companyId === 'co1')!
    // 10,000 paid + 8,000 external + 1,000 + 1,000 retainer + 300 unlinked
    expect(c).toMatchObject({ invoicedCents: 2030000, collectedCents: 1100000, outstandingCents: 930000, overdueCents: 800000, retainerInvoicedCents: 200000, earnedCents: 3000000, contractedCents: 5640000 })
  })
  it('tiles add up the rows and count overdue customers', () => {
    expect(run().tiles).toEqual({ contractedCents: 5640000 + 1800000, earnedCents: 4800000, invoicedCents: 2030000 + 1800000, collectedCents: 2900000, outstandingCents: 930000, overdueCents: 800000, overdueCustomers: 1 })
  })
})

describe('ardorioByDeal: worklists', () => {
  it('delivered, not invoiced: delivered milestones with no live invoice; a cancelled or test one does not count', () => {
    const out = run()
    expect(out.deliveredNotInvoiced.map(x => [x.deal.id, x.milestone.id])).toEqual([['dl1', 'm2']])
  })
  it('a delivered milestone with a draft is not in the list', () => {
    const p = plan('dl1', { contract: CONTRACT, milestones: [{ id: 'm1', label: 'A', amountCents: 100, deliveredOn: '2026-08-01' }] })
    expect(ardorioByDeal([DEALS[0]], COS, [p], [dto({ dealId: 'dl1', milestoneId: 'm1', status: 'draft' })]).deliveredNotInvoiced).toEqual([])
  })
  it('a partially billed deal surfaces: delivered m2 has no invoice although the deal has others', () => {
    expect(run().deliveredNotInvoiced[0].milestone.amountCents).toBe(2000000)
  })
  it('unscheduled contract value: contracted minus milestones, when positive', () => {
    const out = run()
    // 56,400 contracted, 50,000 in milestones.
    expect(out.unscheduled.map(x => [x.deal.id, x.gapCents])).toEqual([['dl1', 640000]])
  })
  it('unlinked invoices: live, not test, no deal or no company, newest first', () => {
    expect(run().unlinked.map(i => i.id)).toEqual(['u2', 'u1'])
  })
})

describe('sortArdorio', () => {
  it('Outstanding biggest first by default, deals inside sorted too', () => {
    const out = run()
    expect(sortArdorio(out.companies).map(c => c.name)).toEqual(['Harbour Group', 'Kestrel Logistics', 'Northgate'])
  })
  it('by name ascending, or by contracted', () => {
    const out = run()
    expect(sortArdorio(out.companies, 'name', 1).map(c => c.name)).toEqual(['Harbour Group', 'Kestrel Logistics', 'Northgate'])
    expect(sortArdorio(out.companies, 'name', -1).map(c => c.name)).toEqual(['Northgate', 'Kestrel Logistics', 'Harbour Group'])
    expect(sortArdorio(out.companies, 'contracted', -1).map(c => c.name)).toEqual(['Harbour Group', 'Kestrel Logistics', 'Northgate'])
    expect(sortArdorio(out.companies, 'collected', -1).map(c => c.name)).toEqual(['Kestrel Logistics', 'Harbour Group', 'Northgate'])
  })
})
