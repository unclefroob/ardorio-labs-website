import { describe, expect, it } from 'vitest'
import type { BillingTerm, InvoiceDto } from '../api/contract'
import { moneyForDeal, validateMilestones, cleanMilestone, isRetainerInvoice } from './billing'
import {
  bpText, cpiEffect, cpiProblem, endEffect, endProblem, instalmentState, nextAnniversary, nextBreakAnniversary, noticeBy, pctToBp, scheduleOutOfDate, termLastDay, unconfirmedCpiYears, validateTerm, type TermInput,
} from './term'
import { termSchedule } from './termSchedule'

const BASE: TermInput = {
  startDate: '2026-07-01', termMonths: 60, annualCents: 1200000, frequency: 'annual', timing: 'advance',
  escalation: 'none', escalationBp: 0, exit: 'committed', breakNoticeDays: 0, autoDraft: true,
}
const term = (over: Partial<BillingTerm> = {}): BillingTerm => ({ ...BASE, draftFrom: '2026-07-01', ...over })
const inv = (milestoneId: string, status: InvoiceDto['status'], over: Partial<InvoiceDto> = {}) => ({ milestoneId, status, test: null, subtotalCents: 0, dealId: 'dl1', overdue: false, ...over })

describe('validateTerm', () => {
  it('accepts every variant the contract allows', () => {
    expect(validateTerm(BASE)).toBeNull()
    expect(validateTerm({ ...BASE, frequency: 'monthly', timing: 'arrears', escalation: 'cpi', escalationBp: 250, exit: 'break', breakNoticeDays: 90, termMonths: 120 })).toBeNull()
    expect(validateTerm({ ...BASE, escalation: 'fixed', escalationBp: 2000, termMonths: 1 })).toBeNull()
  })
  it('refuses what the API refuses', () => {
    expect(validateTerm({ ...BASE, termMonths: 121 })).toMatch(/1 month to 10 years/)
    expect(validateTerm({ ...BASE, termMonths: 0 })).toMatch(/1 month/)
    expect(validateTerm({ ...BASE, annualCents: 0 })).toMatch(/annual fee/)
    expect(validateTerm({ ...BASE, escalation: 'none', escalationBp: 100 })).toMatch(/yearly rise/)
    expect(validateTerm({ ...BASE, escalation: 'fixed', escalationBp: 2001 })).toMatch(/yearly rise/)
    expect(validateTerm({ ...BASE, exit: 'committed', breakNoticeDays: 30 })).toMatch(/notice/)
    expect(validateTerm({ ...BASE, exit: 'break', breakNoticeDays: 366 })).toMatch(/notice/)
    expect(validateTerm({ ...BASE, startDate: '2026-02-30' })).toMatch(/starts/)
  })
})

describe('pctToBp and bpText', () => {
  it('reads a percentage with up to two decimals', () => {
    expect(pctToBp('3')).toBe(300)
    expect(pctToBp('2.75')).toBe(275)
    expect(pctToBp('3.5%')).toBe(350)
    expect(pctToBp('-1')).toBe(-100)
    expect(pctToBp('0.05')).toBe(5)
    expect(pctToBp('1.234')).toBeNull()
    expect(pctToBp('abc')).toBeNull()
    expect(pctToBp('')).toBeNull()
  })
  it('writes bp/100 as the server labels it', () => {
    expect(bpText(350)).toBe('3.5')
    expect(bpText(-100)).toBe('-1')
    expect(bpText(250)).toBe('2.5')
    expect(bpText(300)).toBe('3')
  })
})

describe('anniversaries and the end', () => {
  it('the next anniversary after today, none after the term ends', () => {
    expect(nextAnniversary(BASE, '2026-10-14')).toBe('2027-07-01')
    expect(nextAnniversary(BASE, '2027-07-01')).toBe('2028-07-01')
    expect(nextAnniversary(BASE, '2030-07-01')).toBeNull()
    expect(nextAnniversary({ startDate: '2026-07-01', termMonths: 18 }, '2026-10-14')).toBe('2027-07-01')
    expect(nextAnniversary({ startDate: '2026-07-01', termMonths: 12 }, '2026-10-14')).toBeNull()
  })
  it('the break point is the first anniversary whose notice day has not passed', () => {
    const brk = { ...BASE, exit: 'break' as const, breakNoticeDays: 90 }
    // Notice for 1 Jul 2027 is due by 2 Apr 2027, inclusive.
    expect(nextBreakAnniversary(brk, '2026-10-14')).toBe('2027-07-01')
    expect(nextBreakAnniversary(brk, '2027-04-02')).toBe('2027-07-01')
    // The day after, the client can no longer break at 1 Jul 2027: the next break is a year later.
    expect(nextBreakAnniversary(brk, '2027-04-03')).toBe('2028-07-01')
    // In the last notice window and after it, no break is left (1 Jul 2031 is the term end).
    expect(nextBreakAnniversary(brk, '2030-04-02')).toBe('2030-07-01')
    expect(nextBreakAnniversary(brk, '2030-04-03')).toBeNull()
    // Without notice it is the next anniversary.
    expect(nextBreakAnniversary({ ...brk, breakNoticeDays: 0 }, '2027-06-30')).toBe('2027-07-01')
    expect(nextBreakAnniversary({ ...brk, breakNoticeDays: 0 }, '2027-07-01')).toBe('2028-07-01')
    // A year's notice: the window for the first anniversary has already closed on the start day.
    expect(nextBreakAnniversary({ ...brk, breakNoticeDays: 365 }, '2026-07-02')).toBe('2028-07-01')
  })
  it('notice-by and the last day', () => {
    expect(noticeBy('2027-07-01', 90)).toBe('2027-04-02')
    expect(noticeBy('2027-07-01', 0)).toBe('2027-07-01')
    expect(termLastDay(BASE)).toBe('2031-06-30')
  })
})

describe('instalmentState', () => {
  const m = { plannedDate: '2026-10-01' }
  it('from the invoice when there is a live one', () => {
    expect(instalmentState(m, { status: 'draft', overdue: false }, '2026-10-14')).toBe('Drafted')
    expect(instalmentState(m, { status: 'sent', overdue: false }, '2026-10-14')).toBe('Sent')
    expect(instalmentState(m, { status: 'sent', overdue: true }, '2026-10-14')).toBe('Overdue')
    expect(instalmentState(m, { status: 'paid', overdue: false }, '2026-10-14')).toBe('Paid')
  })
  it('else by its invoice date', () => {
    expect(instalmentState(m, null, '2026-10-14')).toBe('Due')
    expect(instalmentState(m, null, '2026-10-01')).toBe('Due')
    expect(instalmentState(m, null, '2026-09-30')).toBe('Not yet due')
    expect(instalmentState(m, { status: 'void', overdue: false }, '2026-09-30')).toBe('Not yet due')
  })
})

describe('confirm CPI', () => {
  const t = term({ termMonths: 36, escalation: 'cpi', escalationBp: 250, startDate: '2026-10-01', annualCents: 1000000 })
  const plan = { term: t, milestones: termSchedule(t) }
  it('lists the years still to confirm', () => {
    expect(unconfirmedCpiYears(t)).toEqual([2, 3])
    expect(unconfirmedCpiYears({ ...t, cpiConfirmed: [{ year: 2, bp: 300, confirmedOn: '', confirmedBy: '' }] })).toEqual([3])
    expect(unconfirmedCpiYears(term())).toEqual([])
  })
  it('re-prices that year and later, keeps what is invoiced, and states the variation', () => {
    const e = cpiEffect(plan, 2, 350, [inv('inst_3_1', 'sent')])
    expect(e.feeFrom).toBe(1025000)
    expect(e.feeTo).toBe(1035000)
    expect(e.changes).toEqual([{ id: 'inst_2_1', label: 'Year 2 of 3', from: 1025000, to: 1035000 }])
    expect(e.kept.map(m => m.id)).toEqual(['inst_3_1'])
    expect(e.differenceCents).toBe(10000)
    expect(e.label).toBe('CPI year 2: 3.5% (assumed 2.5%)')
  })
  it('without invoices the difference is the whole schedule change', () => {
    const e = cpiEffect(plan, 2, 350, [])
    // Year 3 moves too: 1,035,000 x 1.025 = 1,060,875 against 1,050,625.
    expect(e.changes.map(c => [c.id, c.to - c.from])).toEqual([['inst_2_1', 10000], ['inst_3_1', 10250]])
    expect(e.differenceCents).toBe(20250)
  })
  it('refuses a year out of range, one already confirmed, and a rate out of range', () => {
    expect(cpiProblem(t, 1, 300)).toMatch(/from 2 to 3/)
    expect(cpiProblem(t, 4, 300)).toMatch(/from 2 to 3/)
    expect(cpiProblem({ ...t, cpiConfirmed: [{ year: 2, bp: 300, confirmedOn: '', confirmedBy: '' }] }, 2, 300)).toMatch(/already confirmed/)
    expect(cpiProblem(t, 2, 2001)).toMatch(/-10% to 20%/)
    expect(cpiProblem(t, 2, -1001)).toMatch(/-10% to 20%/)
    expect(cpiProblem(t, 2, null)).toMatch(/-10% to 20%/)
    expect(cpiProblem(term(), 2, 300)).toMatch(/no CPI/)
    expect(cpiProblem(t, 2, -1000)).toBeNull()
  })
})

describe('end early', () => {
  const t = term({ frequency: 'quarterly', termMonths: 24, startDate: '2026-01-01', annualCents: 1200000 })
  const plan = { term: t, milestones: termSchedule(t) }
  it('removes later instalments, cuts the one spanning the end by days, keeps invoiced ones', () => {
    // Quarter 2026-04-01..2026-06-30 is 91 days; ending on 2026-05-01 keeps 30 of them: round(300000 * 30 / 91) = 98901.
    const e = endEffect(plan, '2026-05-01', [inv('inst_1_1', 'paid'), inv('inst_2_1', 'draft')])
    expect(e.cut).toEqual([{ id: 'inst_1_2', label: 'Year 1 of 2, quarter 2', from: 300000, to: 98901, periodStart: '2026-04-01', periodEnd: '2026-06-30' }])
    expect(e.removed.map(m => m.id)).toEqual(['inst_1_3', 'inst_1_4', 'inst_2_2', 'inst_2_3', 'inst_2_4'])
    expect(e.keptInvoiced.map(m => m.id)).toEqual(['inst_2_1'])
    expect(e.removedCents).toBe(5 * 300000 + (300000 - 98901))
    expect(e.label).toBe('Ended early on 2026-05-01')
  })
  it('an end on a period start removes that period whole', () => {
    const e = endEffect(plan, '2026-04-01', [])
    expect(e.cut).toEqual([])
    expect(e.removed).toHaveLength(7)
    expect(e.removedCents).toBe(7 * 300000)
  })
  it('a void or test invoice does not keep an instalment', () => {
    const e = endEffect(plan, '2027-10-01', [inv('inst_2_4', 'void'), { ...inv('inst_2_4', 'sent'), test: { markedAt: '', markedBy: '', reason: 'x' } }])
    expect(e.removed.map(m => m.id)).toEqual(['inst_2_4'])
  })
  it('checks the date and reason', () => {
    expect(endProblem(t, '2025-12-31', 'x')).toMatch(/before the term starts/)
    expect(endProblem(t, '2028-01-01', 'x')).toMatch(/before the term ends/)
    expect(endProblem(t, '2026-05-01', '  ')).toMatch(/Say why/)
    expect(endProblem(t, '2026-05-01', 'x'.repeat(301))).toMatch(/Say why/)
    expect(endProblem({ ...t, ended: { endedOn: '2026-05-01', reason: 'x', endedBy: 'a', recordedAt: '' } }, '2026-06-01', 'x')).toMatch(/already ended/)
    expect(endProblem(t, '2026-01-01', 'Client closed')).toBeNull()
  })
  it('the schedule is out of date until the server answers', () => {
    expect(scheduleOutOfDate(plan, [])).toBe(false)
    expect(scheduleOutOfDate({ ...plan, term: { ...t, ended: { endedOn: '2026-05-01', reason: 'x', endedBy: '', recordedAt: '' } } }, [])).toBe(true)
  })
})

describe('instalments in the existing billing helpers', () => {
  const t = term({ termMonths: 24 })
  const schedule = termSchedule(t)
  it('validateMilestones skips instalments and does not count them to the 40 limit', () => {
    const monthly = termSchedule(term({ frequency: 'monthly', termMonths: 120 }))
    expect(monthly).toHaveLength(120)
    expect(validateMilestones(monthly)).toBeNull()
    expect(validateMilestones([...monthly, { id: 'm1', label: '', amountCents: 1 }])).toMatch(/label/)
  })
  it('cleanMilestone keeps an instalment as stored', () => {
    expect(cleanMilestone(schedule[0])).toEqual(schedule[0])
    expect(cleanMilestone({ id: 'm1', label: ' Build ', amountCents: 5 })).toEqual({ id: 'm1', label: 'Build', amountCents: 5 })
  })
  it('an instalment is earned when it has a live invoice; term invoices are project money', () => {
    const plan = { contract: { baselineCents: 2400000 + 500000, engagementType: 'term-agreement' as const, contractedOn: '2026-07-01', contractedBy: 'x', estimateAtWonCents: 0 }, milestones: [{ id: 'b1', label: 'Build', amountCents: 500000, deliveredOn: '2026-07-10' }, ...schedule] }
    const money = moneyForDeal({ id: 'dl1', value: 0 }, plan, [
      { ...inv('inst_1_1', 'sent'), subtotalCents: 1200000, source: 'term' },
      { ...inv('inst_2_1', 'void'), subtotalCents: 1200000, source: 'term' },
    ])
    expect(money.earned).toBe(500000 + 1200000)
    expect(money.invoiced).toBe(1200000)
    expect(money.contracted).toBe(2900000)
    expect(money.scheduled).toBe(2900000)
    expect(isRetainerInvoice({ source: 'term', milestoneId: null }, { retainer: { amountCents: 1, interval: 'monthly' } })).toBe(false)
  })
})
