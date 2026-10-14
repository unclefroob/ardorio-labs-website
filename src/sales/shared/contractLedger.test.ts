import { describe, expect, it } from 'vitest'
import type { BillingContract, BillingPlan, BillingVariation } from '../api/contract'
import { dto } from '../testing/invoicingWorld'
import {
  approvalProblem, approvedVariations, cleanMilestone, contractCapOf, contractedCents, MAX_CENTS, MAX_TERM_CONTRACT_CENTS, moneyForDeal, nextVariationLabel, proposedVariations, reconciliationLine, signedCents, validateContract,
  validateContractAmount, validateVariation, variationEffect, wonDay,
} from './billing'
import { formatCents } from './money'

const TODAY = '2026-10-14'
const CONTRACT: BillingContract = { baselineCents: 4800000, engagementType: 'fixed-price', contractedOn: '2026-09-03', contractedBy: 'u-me', estimateAtWonCents: 4800000 }
const V = (id: string, amountCents: number, status: BillingVariation['status']): BillingVariation => ({
  id, label: id, amountCents, reason: 'Client asked', status, createdAt: '2026-09-20T01:00:00.000Z', createdBy: 'u-me',
  ...(status === 'proposed' ? {} : { decidedAt: '2026-09-24T01:00:00.000Z', decidedBy: 'u-me' }),
})

/** The Deal board: A$48,000 baseline, VO-1 +6,000 approved, VO-2 +2,400 proposed, a rejected one and an approved reduction. */
const PLAN: BillingPlan = {
  id: 'bp_dl1', dealId: 'dl1', businessId: 'ard',
  contract: CONTRACT,
  variations: [V('VO-1', 600000, 'approved'), V('VO-2', 240000, 'proposed'), V('VO-3', 900000, 'rejected'), V('VO-4', -100000, 'approved')],
  milestones: [
    { id: 'm1', label: 'Discovery and design', amountCents: 800000, deliveredOn: '2026-09-10', deliveredBy: 'u-me' },
    { id: 'm2', label: 'Build', amountCents: 2400000, deliveredOn: '2026-10-01' },
    { id: 'm3', label: 'Reporting module (VO-1)', amountCents: 600000, deliveredOn: '2026-10-05' },
    { id: 'm4', label: 'Launch and handover', amountCents: 1200000 },
  ],
}
const DEAL = { id: 'dl1', value: 50000 }

describe('contracted total', () => {
  it('is the baseline plus approved variations, a negative one included; proposed and rejected are not counted', () => {
    expect(contractedCents(PLAN)).toBe(4800000 + 600000 - 100000)
    expect(approvedVariations(PLAN).map(v => v.id)).toEqual(['VO-1', 'VO-4'])
    expect(proposedVariations(PLAN).map(v => v.id)).toEqual(['VO-2'])
  })
  it('is the baseline alone with no variations, and null with no contract', () => {
    expect(contractedCents({ contract: CONTRACT })).toBe(4800000)
    expect(contractedCents({ variations: [V('x', 100, 'approved')] })).toBeNull()
    expect(contractedCents(undefined)).toBeNull()
    expect(approvedVariations(undefined)).toEqual([])
    expect(proposedVariations({})).toEqual([])
  })
})

describe('moneyForDeal', () => {
  const invoices = [
    dto({ id: 'paid', status: 'paid', subtotalCents: 800000 }),
    dto({ id: 'sent', status: 'sent', subtotalCents: 2400000 }),
    dto({ id: 'draft', status: 'draft', subtotalCents: 600000 }),
    dto({ id: 'void', status: 'void', subtotalCents: 999900 }),
    dto({ id: 'test', status: 'paid', subtotalCents: 777700, test: { markedAt: '2026-10-01T00:00:00Z', markedBy: 'u-me', reason: 'trying it' } }),
    dto({ id: 'ret-paid', status: 'paid', subtotalCents: 120000, source: 'retainer' }),
    dto({ id: 'ret-sent', status: 'sent', subtotalCents: 120000, source: 'retainer' }),
    dto({ id: 'ret-draft', status: 'draft', subtotalCents: 120000, source: 'retainer' }),
    dto({ id: 'other-deal', status: 'paid', subtotalCents: 500000, dealId: 'dl2' }),
    dto({ id: 'no-deal', status: 'paid', subtotalCents: 500000, dealId: null }),
  ]
  const m = moneyForDeal(DEAL, PLAN, invoices)

  it('estimate is the deal value in cents, contracted the ledger total', () => {
    expect(m.estimate).toBe(5000000)
    expect(m.contracted).toBe(5300000)
  })
  it('earned counts delivered milestones only', () => {
    expect(m.earned).toBe(800000 + 2400000 + 600000)
  })
  it('invoiced and collected count issued project invoices of this deal: never draft, cancelled, test, retainer or another deal', () => {
    expect(m.invoiced).toBe(800000 + 2400000)
    expect(m.collected).toBe(800000)
    expect(m.outstanding).toBe(2400000)
  })
  it('retainer invoices are counted on their own, issued only', () => {
    expect(m.retainerInvoiced).toBe(240000)
  })
  it('scheduled is every milestone, unscheduled the contract less that', () => {
    expect(m.scheduled).toBe(5000000)
    expect(m.unscheduled).toBe(300000)
    expect(m.overBilled).toBe(0)
  })
  it('unscheduled goes negative when the milestones add up to more than the contract', () => {
    const over = moneyForDeal(DEAL, { ...PLAN, variations: [] }, [])
    expect(over.contracted).toBe(4800000)
    expect(over.unscheduled).toBe(-200000)
  })
  it('over-billed is what was invoiced past the contract, not capped', () => {
    const big = moneyForDeal(DEAL, PLAN, [dto({ status: 'sent', subtotalCents: 5800000 })])
    expect(big.overBilled).toBe(500000)
    expect(big.invoiced).toBe(5800000)
  })
  it('a negative variation lowers the contract and can turn invoiced into over-billed', () => {
    const cut = moneyForDeal(DEAL, { ...PLAN, variations: [V('cut', -1000000, 'approved')] }, [dto({ status: 'paid', subtotalCents: 4000000 })])
    expect(cut.contracted).toBe(3800000)
    expect(cut.overBilled).toBe(200000)
    expect(cut.collected).toBe(4000000)
    expect(cut.outstanding).toBe(0)
  })
  it('with no contract the reconciliation figures are null and the cash figures still count', () => {
    const none = moneyForDeal(DEAL, { milestones: PLAN.milestones }, invoices)
    expect(none.contracted).toBeNull()
    expect(none.unscheduled).toBeNull()
    expect(none.overBilled).toBeNull()
    expect(none.invoiced).toBe(3200000)
  })
  it('with no plan at all everything is zero but the estimate', () => {
    expect(moneyForDeal({ id: 'dl1', value: 0 }, undefined, [])).toEqual({
      estimate: 0, contracted: null, earned: 0, invoiced: 0, collected: 0, outstanding: 0, retainerInvoiced: 0, scheduled: 0, unscheduled: null, overBilled: null,
    })
  })
  it('a list of invoices without dealId (the deal list from the server) is counted as this deal', () => {
    expect(moneyForDeal(DEAL, PLAN, [{ status: 'paid', subtotalCents: 100 }]).collected).toBe(100)
  })
})

describe('contract and variation validation', () => {
  it('contract amount is whole cents from 1 to the milestone maximum', () => {
    expect(validateContractAmount(null)).toMatch(/Enter the contracted amount/)
    expect(validateContractAmount(0)).toMatch(/from \$0.01/)
    expect(validateContractAmount(100_000_001)).toMatch(/from \$0.01/)
    expect(validateContractAmount(4800000)).toBeNull()
  })
  it('a term agreement contract has the larger cap the API gives it (MAX_TERM_CONTRACT_CENTS), every other type keeps MAX_CENTS', () => {
    expect(MAX_TERM_CONTRACT_CENTS).toBe(10_000_000_000)
    expect(contractCapOf('term-agreement')).toBe(MAX_TERM_CONTRACT_CENTS)
    for (const t of ['fixed-price', 'time-materials', 'support-retainer', undefined] as const) expect(contractCapOf(t)).toBe(MAX_CENTS)
    // 5 years at $250,000 a year is $1,250,000.
    const term = { ...CONTRACT, engagementType: 'term-agreement' as const, baselineCents: 125_000_000 }
    expect(validateContract(term, TODAY)).toBeNull()
    expect(validateContract({ ...term, baselineCents: MAX_TERM_CONTRACT_CENTS }, TODAY)).toBeNull()
    expect(validateContract({ ...term, baselineCents: MAX_TERM_CONTRACT_CENTS + 1 }, TODAY)).toMatch(/from \$0.01 to 100000000\.00/)
    expect(validateContract({ ...CONTRACT, baselineCents: 125_000_000 }, TODAY)).toMatch(/from \$0.01 to 1000000\.00/)
    expect(validateContractAmount(125_000_000, 'term-agreement')).toBeNull()
    expect(validateContractAmount(125_000_000)).toMatch(/from \$0.01/)
  })
  it('a whole contract needs an engagement type and a contract day', () => {
    expect(validateContract(CONTRACT, TODAY)).toBeNull()
    expect(validateContract({ ...CONTRACT, engagementType: 'monthly' as never }, TODAY)).toBe('Choose an engagement type')
    expect(validateContract({ ...CONTRACT, contractedOn: '2026-02-30' }, TODAY)).toMatch(/not a valid date/)
    expect(validateContract({ ...CONTRACT, estimateAtWonCents: -1 }, TODAY)).toMatch(/estimate/)
  })
  it('a contract date is today or earlier, as the API requires', () => {
    expect(validateContract({ ...CONTRACT, contractedOn: TODAY }, TODAY)).toBeNull()
    expect(validateContract({ ...CONTRACT, contractedOn: '2026-10-15' }, TODAY)).toMatch(/cannot be in the future/)
  })
  it('an approval cannot take the contracted total below 0, as the API requires', () => {
    // PLAN contracts 4,800,000 + 600,000 - 100,000 = 5,300,000.
    expect(approvalProblem(PLAN, -5_300_000)).toBeNull()
    expect(approvalProblem(PLAN, -5_300_001)).toMatch(/below \$0\.00\. Contracted is \$53,000\.00/)
    expect(approvalProblem(PLAN, 100)).toBeNull()
    expect(approvalProblem({ variations: [] }, 100)).toMatch(/Set the contract/)
  })
  it('a variation is labelled, signed, non-zero, within the limit either way, and has a reason', () => {
    const ok = { label: 'VO-2 SSO', amountCents: -240000, reason: 'Descoped' }
    expect(validateVariation(ok)).toBeNull()
    expect(validateVariation({ ...ok, amountCents: 100_000_000 })).toBeNull()
    expect(validateVariation({ ...ok, amountCents: -100_000_000 })).toBeNull()
    expect(validateVariation({ ...ok, label: '  ' })).toMatch(/label/)
    expect(validateVariation({ ...ok, amountCents: 0 })).toMatch(/not zero/)
    expect(validateVariation({ ...ok, amountCents: 1.5 })).toMatch(/whole cents/)
    expect(validateVariation({ ...ok, amountCents: -100_000_001 })).toMatch(/either way/)
    expect(validateVariation({ ...ok, reason: ' ' })).toMatch(/why/)
    // The API allows a reason of at most 500 characters.
    expect(validateVariation({ ...ok, reason: 'x'.repeat(500) })).toBeNull()
    expect(validateVariation({ ...ok, reason: 'x'.repeat(501) })).toMatch(/at most 500/)
  })
  it('a variation on a term agreement may be up to MAX_TERM_CONTRACT_CENTS either way, as the API allows', () => {
    const ok = { label: 'VO-1 Year 2 CPI', amountCents: 150_000_000, reason: 'CPI' }
    expect(validateVariation(ok)).toMatch(/either way/)
    expect(validateVariation(ok, 'fixed-price')).toMatch(/either way/)
    expect(validateVariation(ok, 'term-agreement')).toBeNull()
    expect(validateVariation({ ...ok, amountCents: -MAX_TERM_CONTRACT_CENTS }, 'term-agreement')).toBeNull()
    expect(validateVariation({ ...ok, amountCents: MAX_TERM_CONTRACT_CENTS + 1 }, 'term-agreement')).toMatch(/either way/)
  })
})

describe('ledger wording and effects', () => {
  it('suggests the next VO number', () => {
    expect(nextVariationLabel(undefined)).toBe('VO-1 ')
    expect(nextVariationLabel(PLAN)).toBe('VO-5 ')
  })
  it('always writes the sign', () => {
    expect(signedCents(240000, formatCents)).toBe(`+${formatCents(240000)}`)
    expect(signedCents(-240000, formatCents)).toBe(`−${formatCents(240000)}`)
  })
  it('reconciliation line says unscheduled, over-scheduled or all scheduled', () => {
    expect(reconciliationLine(4000000, 4800000, formatCents)).toEqual({ text: `Scheduled ${formatCents(4000000)} of ${formatCents(4800000)}, ${formatCents(800000)} unscheduled`, tone: 'warn' })
    expect(reconciliationLine(5000000, 4800000, formatCents).text).toBe(`Scheduled ${formatCents(5000000)} of ${formatCents(4800000)}, ${formatCents(200000)} over-scheduled`)
    expect(reconciliationLine(4800000, 4800000, formatCents)).toEqual({ text: `Scheduled ${formatCents(4800000)} of ${formatCents(4800000)}, all scheduled`, tone: 'ok' })
  })
  it('variation effect: contract and unscheduled before and after, for an increase and a decrease', () => {
    expect(variationEffect(PLAN, 240000)).toEqual({ from: 5300000, to: 5540000, unscheduledFrom: 300000, unscheduledTo: 540000 })
    expect(variationEffect(PLAN, -500000)).toEqual({ from: 5300000, to: 4800000, unscheduledFrom: 300000, unscheduledTo: -200000 })
    expect(variationEffect({ milestones: [] }, 100)).toBeNull()
  })
  it('won day is the close date, else the day it closed', () => {
    expect(wonDay({ close: '2026-09-03', closedAt: '2026-09-04T01:00:00' })).toBe('2026-09-03')
    expect(wonDay({ close: '', closedAt: '2026-09-04T01:00:00' })).toBe('2026-09-04')
    expect(wonDay({ close: '', closedAt: null })).toBe('')
  })
  it('cleanMilestone keeps the delivered state', () => {
    expect(cleanMilestone({ id: 'a', label: ' A ', amountCents: 1, deliveredOn: '2026-10-01', deliveredBy: 'u-me' })).toEqual({ id: 'a', label: 'A', amountCents: 1, deliveredOn: '2026-10-01', deliveredBy: 'u-me' })
    expect(cleanMilestone({ id: 'a', label: 'A', amountCents: 1, deliveredOn: '' })).toEqual({ id: 'a', label: 'A', amountCents: 1 })
  })
})
