import { describe, expect, it } from 'vitest'
import type { BillingContract, BillingPlan } from '../api/contract'
import { dto } from '../testing/invoicingWorld'
import {
  bulletPct, bulletScale, estimateChanged, isRetainerInvoice, milestoneState, moneyForDeal, overdueProjectCents, STATE_TONE, validateDelivered,
} from './billing'

const CONTRACT: BillingContract = { baselineCents: 4800000, engagementType: 'fixed-price', contractedOn: '2026-09-03', contractedBy: 'u-me', estimateAtWonCents: 4800000 }
const RETAINER = { amountCents: 120000, interval: 'monthly' as const, nextInvoiceDate: '2027-03-01' }
const DEAL = { id: 'dl1', value: 48000 }

describe('isRetainerInvoice', () => {
  it('a scheduler draft is always retainer', () => {
    expect(isRetainerInvoice({ source: 'retainer', milestoneId: null }, undefined)).toBe(true)
    expect(isRetainerInvoice({ source: 'retainer', milestoneId: null }, { contract: { ...CONTRACT, engagementType: 'time-materials' } })).toBe(true)
  })
  it('one made by hand with no milestone is retainer only when the deal has a retainer', () => {
    expect(isRetainerInvoice({ source: 'manual', milestoneId: null }, { retainer: RETAINER })).toBe(true)
    expect(isRetainerInvoice({ source: 'manual', milestoneId: null }, {})).toBe(false)
    expect(isRetainerInvoice({ source: 'manual', milestoneId: null }, undefined)).toBe(false)
  })
  it('one with a milestone is project, and so is one without on a time and materials contract', () => {
    expect(isRetainerInvoice({ source: 'manual', milestoneId: 'm1' }, { retainer: RETAINER })).toBe(false)
    expect(isRetainerInvoice({ source: 'manual', milestoneId: null }, { retainer: RETAINER, contract: { ...CONTRACT, engagementType: 'time-materials' } })).toBe(false)
  })
})

describe('moneyForDeal with a support retainer', () => {
  const plan: Pick<BillingPlan, 'contract' | 'milestones' | 'retainer'> = { contract: CONTRACT, retainer: RETAINER, milestones: [{ id: 'm1', label: 'Build', amountCents: 4800000 }] }
  const invoices = [
    dto({ id: 'p', milestoneId: 'm1', status: 'paid', subtotalCents: 4800000 }),
    dto({ id: 'r-auto', milestoneId: null, status: 'sent', subtotalCents: 120000, source: 'retainer' }),
    dto({ id: 'r-hand', milestoneId: null, status: 'paid', subtotalCents: 120000 }),
  ]
  it('keeps retainer invoices made by hand out of project progress, as well as the scheduler drafts', () => {
    const m = moneyForDeal(DEAL, plan, invoices)
    expect(m).toMatchObject({ contracted: 4800000, invoiced: 4800000, collected: 4800000, outstanding: 0, retainerInvoiced: 240000, overBilled: 0 })
  })
  it('counts milestone-less invoices as project on a time and materials contract', () => {
    const tm = { ...plan, contract: { ...CONTRACT, engagementType: 'time-materials' as const } }
    const m = moneyForDeal(DEAL, tm, invoices)
    expect(m.invoiced).toBe(4920000)
    expect(m.retainerInvoiced).toBe(120000)
    expect(m.overBilled).toBe(120000)
  })
})

describe('overdueProjectCents', () => {
  it('sums sent, overdue project invoices of this deal only, never void, test, draft, retainer or another deal', () => {
    const list = [
      dto({ id: 'a', status: 'sent', overdue: true, subtotalCents: 100 }),
      dto({ id: 'b', status: 'sent', overdue: false, subtotalCents: 200 }),
      dto({ id: 'c', status: 'void', overdue: true, subtotalCents: 400 }),
      dto({ id: 'd', status: 'sent', overdue: true, subtotalCents: 800, test: { markedAt: '2026-10-01T00:00:00Z', markedBy: 'u-me', reason: 'try' } }),
      dto({ id: 'e', status: 'sent', overdue: true, subtotalCents: 1600, source: 'retainer' }),
      dto({ id: 'f', status: 'sent', overdue: true, subtotalCents: 3200, dealId: 'dl2' }),
    ]
    expect(overdueProjectCents('dl1', { contract: CONTRACT }, list)).toBe(100)
  })
})

describe('milestoneState', () => {
  const m = { id: 'm1', label: 'Build', amountCents: 100 }
  it('is Planned, then Delivered once a delivered date is stored', () => {
    expect(milestoneState({ status: 'Planned', milestone: m })).toBe('Planned')
    expect(milestoneState({ status: 'Planned', milestone: { ...m, deliveredOn: '2026-10-01' } })).toBe('Delivered')
  })
  it('an invoice state wins over Delivered once there is a live invoice', () => {
    for (const s of ['Draft invoice', 'Invoiced', 'Paid'] as const) {
      expect(milestoneState({ status: s, milestone: { ...m, deliveredOn: '2026-10-01' } })).toBe(s)
      expect(milestoneState({ status: s, milestone: m })).toBe(s)
    }
  })
  it('every state has a tone and Delivered is told apart from Planned', () => {
    expect(STATE_TONE).toEqual({ Planned: '', 'Draft invoice': 'warn', Invoiced: 'info', Paid: 'ok', Delivered: 'acc' })
  })
})

describe('validateDelivered', () => {
  it('takes today or a past day, and refuses the future or a non-date', () => {
    expect(validateDelivered('2026-10-14', '2026-10-14')).toBeNull()
    expect(validateDelivered('2026-01-02', '2026-10-14')).toBeNull()
    expect(validateDelivered('2026-10-15', '2026-10-14')).toBe('The delivered date cannot be in the future')
    expect(validateDelivered('', '2026-10-14')).toBe('Pick the day it was delivered')
    expect(validateDelivered('2026-02-30', '2026-10-14')).toBe('Pick the day it was delivered')
  })
})

describe('estimateChanged', () => {
  it('is true only when there is a contract and the deal value no longer matches the estimate at Won', () => {
    expect(estimateChanged({ value: 48000 }, { contract: CONTRACT })).toBe(false)
    expect(estimateChanged({ value: 50000 }, { contract: CONTRACT })).toBe(true)
    expect(estimateChanged({ value: 50000 }, {})).toBe(false)
    expect(estimateChanged({ value: 50000 }, undefined)).toBe(false)
  })
})

describe('bullet chart scale', () => {
  it('leaves a tenth of room past the largest figure, so the marker and an overrun both fit', () => {
    expect(bulletScale([5400000, 3800000, 3200000, 800000])).toBe(5940000)
    expect(bulletPct(5400000, 6000000)).toBe('90%')
    expect(bulletPct(3200000, 6000000)).toBe('53.3%')
  })
  it('never caps an overrun at the contract: more invoiced than contracted sits past the marker', () => {
    const scale = bulletScale([5640000, 5800000])
    expect(parseFloat(bulletPct(5800000, scale))).toBeGreaterThan(parseFloat(bulletPct(5640000, scale)))
    expect(parseFloat(bulletPct(5800000, scale))).toBeLessThanOrEqual(100)
  })
  it('all zero does not divide by zero, and a negative figure draws nothing', () => {
    expect(bulletScale([0, 0])).toBe(1)
    expect(bulletPct(0, 1)).toBe('0%')
    expect(bulletPct(-5, 100)).toBe('0%')
  })
})
