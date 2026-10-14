import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingTerm, InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { click, settle } from '../../testing/dom'
import { ardDeal, CLIENT, dto, invoicingWorld, SETTINGS, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'
import { scheduleTotal, termSchedule } from '../../shared/termSchedule'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The fixture clock is 9 Oct 2026 (Melbourne).
const text = (): string => host.textContent ?? ''
const term = (over: Partial<BillingTerm>): BillingTerm => ({
  startDate: '2025-03-01', termMonths: 60, annualCents: 5000000, frequency: 'annual', timing: 'advance', escalation: 'none', escalationBp: 0,
  exit: 'committed', breakNoticeDays: 0, autoDraft: true, draftFrom: '2025-02-01', ...over,
})
const planOf = (dealId: string, t: BillingTerm, extra: Record<string, unknown> = {}) => {
  const milestones = termSchedule(t)
  return rec(`bp_${dealId}`, {
    dealId, businessId: 'ard', term: t, variations: [], milestones,
    contract: { baselineCents: scheduleTotal(milestones), engagementType: 'term-agreement', contractedOn: '2025-02-01', contractedBy: 'Me Myself', estimateAtWonCents: scheduleTotal(milestones) },
    ...extra,
  })
}
const termInv = (id: string, dealId: string, companyId: string, milestoneId: string, cents: number, status: InvoiceDto['status'], issueDate: string): InvoiceDto =>
  dto({ id, invoiceNumber: `INV-${id}`, dealId, companyId, milestoneId, status, subtotalCents: cents, issueDate, source: 'term' })

// brk (Tidewater): 5 years from 1 Mar 2025, $50,000 rising 3% a year, break at each anniversary with 90 days' notice.
// Years 1 and 2 are invoiced; years 3 to 5 ($53,045 + $54,636.35 + $56,275.44) are not yet committed until 1 Mar 2027.
const T_BRK = term({ escalation: 'fixed', escalationBp: 300, exit: 'break', breakNoticeDays: 90 })
// soon (Tidewater): 3 years from 1 Jan 2024, $20,000 a year; it ends on 1 Jan 2027 and year 3 is due and not invoiced.
const T_SOON = term({ startDate: '2024-01-01', termMonths: 36, annualCents: 2000000 })
// five (Banksia): 5 years from 1 Nov 2025, $60,000 a year, with a $40,000 build fee delivered and paid.
const T_FIVE = term({ startDate: '2025-11-01', annualCents: 6000000 })
const BUILD = { id: 'build', label: 'Build', amountCents: 4000000, plannedDate: '2025-10-15', deliveredOn: '2025-10-20', deliveredBy: 'Me Myself' }
const FIVE_MS = [BUILD, ...termSchedule(T_FIVE)]

const INVOICES = [
  termInv('b1', 'brk', 'co1', 'inst_1_1', 5000000, 'paid', '2025-03-01'),
  termInv('b2', 'brk', 'co1', 'inst_2_1', 5150000, 'paid', '2026-03-01'),
  termInv('s1', 'soon', 'co1', 'inst_1_1', 2000000, 'paid', '2024-01-01'),
  termInv('s2', 'soon', 'co1', 'inst_2_1', 2000000, 'paid', '2025-01-01'),
  dto({ id: 'f0', invoiceNumber: 'INV-f0', dealId: 'five', companyId: 'co2', milestoneId: 'build', status: 'paid', subtotalCents: 4000000, issueDate: '2025-10-21' }),
  termInv('f1', 'five', 'co2', 'inst_1_1', 6000000, 'sent', '2025-11-01'),
]

async function hydrate() {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    deals: [
      rec('brk', ardDeal('brk', { companyId: 'co1', title: 'Platform licence' }).data),
      rec('soon', ardDeal('soon', { companyId: 'co1', title: 'Support licence' }).data),
      rec('five', ardDeal('five', { companyId: 'co2', title: 'Custom platform' }).data),
    ],
    billingPlans: [
      planOf('brk', T_BRK), planOf('soon', T_SOON),
      planOf('five', T_FIVE, { milestones: FIVE_MS, contract: { baselineCents: scheduleTotal(FIVE_MS), engagementType: 'term-agreement', contractedOn: '2025-10-01', contractedBy: 'Me Myself', estimateAtWonCents: 0 } }),
    ],
  }))
  setArdRole(m, 'admin')
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  return nav
}

describe('Customers by deal: term agreements', () => {
  async function show() {
    await hydrate()
    fakeApi({ 'GET /sales/invoices': () => json(200, { invoices: INVOICES }) })
    const { Customers } = await import('./Customers')
    await act(async () => { root.render(<Customers route={{ page: 'customers', q: { product: 'ard' } } as never} />) })
    await settle(10)
  }
  const company = (id: string): string => host.querySelector(`tr[data-company="${id}"]`)?.textContent ?? ''
  const dealRow = (id: string): string => host.querySelector(`tr[data-deal="${id}"]`)?.textContent ?? ''
  const expand = async (name: string): Promise<void> => { await click(host.querySelector(`button[aria-label="Expand ${name}"]`)) }

  it('the Contracted tile stays the contract, and names what break agreements do not yet commit', async () => {
    await show()
    const tile = [...host.querySelectorAll('.kpi')][0]?.textContent ?? ''
    // 265,456.79 (brk) + 60,000 (soon) + 340,000 (five).
    expect(tile).toContain('Contracted$665,456.79')
    expect(tile).toContain('of which $163,956.79 not yet committed (break agreements)')
    // Earned: brk 101,500 + soon 40,000 + five 40,000 build + 60,000 invoiced instalment.
    expect([...host.querySelectorAll('.kpi')][1]?.textContent).toBe('Earned$241,500')
  })

  it('a company row says it has term agreements and when the next one ends, and what is not yet committed', async () => {
    await show()
    const co1 = company('co1')
    expect(co1).toContain('2 term agreements, next ends in 84 days')
    expect(co1).toContain('of which $163,956.79 not yet committed')
    expect(company('co2')).toContain('Term agreement, ends in 1484 days')
    expect(text()).not.toMatch(/\bMRR\b|\bARR\b/)
  })

  it('a deal row shows the annual fee, the end and ends in N days, and the not yet committed part of a break agreement', async () => {
    await show()
    await expand('Tidewater Foods')
    const brk = dealRow('brk')
    expect(brk).toContain('Term agreement')
    expect(brk).toContain('Annual fee $51,500.00 (year 2 of 5) · to 28 Feb 2030 · ends in 1239 days')
    expect(brk).toContain('$265,456.79')
    expect(brk).toContain('Not yet committed (break at 1 Mar 2027): $163,956.79')
    const soon = dealRow('soon')
    expect(soon).toContain('Renewal: ends in 84 days')
    expect(soon).toContain('Instalment due, not invoiced $20,000.00')
    expect(soon).toContain('Annual fee $20,000.00 (year 3 of 3) · to 31 Dec 2026 · ends in 84 days')
  })

  it('earned on a term agreement is the build fee delivered plus the instalments invoiced', async () => {
    await show()
    await expand('Banksia Advisory')
    const five = dealRow('five')
    expect(five).toContain('Annual fee $60,000.00 · to 31 Oct 2030 · ends in 1484 days')
    expect(five).toContain('$340,000.00')
    expect(five).toContain('$100,000.00') // earned and invoiced
    expect(five).toContain('$60,000.00') // outstanding: the sent year 1 instalment
    expect(five).toContain('Year 2 of 5') // next due
  })
})

describe('Ardorio forecast: term agreements', () => {
  async function show() {
    await hydrate()
    fakeApi({ 'GET /sales/invoices': () => json(200, { invoices: INVOICES }) })
    const { Reports } = await import('../reports/Reports')
    await act(async () => { root.render(<Reports route={{ page: 'reports', q: { tab: 'ardorio', view: 'forecast' } } as never} />) })
    await settle(6)
  }
  const section = (): Element | null => host.querySelector('section[data-ard-forecast]')
  const table = (name: string): HTMLTableElement | null => host.querySelector(`table[aria-label="${name}"]`)
  const rowOf = (t: HTMLTableElement | null, start: string): string[] => {
    const tr = [...(t?.querySelectorAll('tbody tr') ?? [])].find(r => r.querySelector('th')?.textContent?.startsWith(start))
    return tr ? [...tr.querySelectorAll('th,td')].map(c => c.textContent ?? '') : []
  }

  it('places instalments on their invoice dates and keeps the not yet committed part apart from the backlog', async () => {
    await show()
    expect(section()).not.toBeNull()
    const backlog = [...(section()?.querySelectorAll('.kpi') ?? [])].find(x => x.querySelector('.l')?.textContent === 'Contracted backlog')
    // Committed: five 240,000 + soon 20,000 (overdue to invoice) + brk 0; the sent year 1 instalment of five is invoiced.
    expect(backlog?.querySelector('.v')?.textContent).toBe('$260,000')
    expect(backlog?.querySelector('.s')?.textContent).toContain('$163,956.79 not yet committed apart')
    const t = table('Ardorio forecast by month')
    // Five's year 2 instalment is invoiced on 1 Nov 2026; soon's due one this month.
    expect(rowOf(t, 'Nov 2026')[1]).toBe('$60,000')
    expect(rowOf(t, 'Oct 2026')[1]).toBe('$20,000')
    expect(rowOf(t, 'Not yet committed')).toEqual(expect.arrayContaining(['$163,956.79']))
    expect(section()?.textContent).toContain('$163,956.79 of term agreement instalments is not yet committed')
    expect(section()?.textContent).toContain('Platform licence $163,956.79 (break at 1 Mar 2027)')
  })

  it('the not yet committed row expands to each instalment on its date', async () => {
    await show()
    const t = table('Ardorio forecast by month')
    await click(t?.querySelector('button[aria-label="Expand Not yet committed"]') ?? null)
    const drill = t?.textContent ?? ''
    expect(drill).toContain('Year 3 of 5 · not yet committed · invoiced 1 Mar 2027 · $53,045')
    expect(drill).toContain('Year 5 of 5 · not yet committed · invoiced 1 Mar 2029 · $56,275.44')
  })

  it('by financial year, each instalment is in the year of its invoice date', async () => {
    await show()
    await click([...host.querySelectorAll('button')].find(b => b.textContent === 'By financial year') ?? null)
    await settle(2)
    const t = table('Ardorio forecast by financial year')
    // FY27: five year 2 (60,000) + soon year 3 (20,000); FY28 to FY30: five years 3 to 5.
    expect(rowOf(t, 'FY27')[1]).toBe('$80,000')
    expect(rowOf(t, 'FY28')[1]).toBe('$60,000')
    expect(rowOf(t, 'FY30')[1]).toBe('$60,000')
  })
})

describe('Deal Billing tab: project money of a break agreement', () => {
  it('Contracted stays the figure, with the committed and not yet committed parts beside it', async () => {
    await hydrate()
    fakeApi({
      'GET /sales/invoices?dealId=brk': () => json(200, { invoices: INVOICES.filter(i => i.dealId === 'brk') }),
      'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }),
      'GET /sales/invoices/settings': () => json(200, SETTINGS),
    })
    const { BillingCard } = await import('../deals/BillingCard')
    const { Q } = await import('../../data/Q')
    await act(async () => { root.render(<BillingCard deal={Q.deal('brk')!} />) })
    await settle(8)
    const fig = host.querySelector('[data-fig^="Contracted"]')?.textContent ?? ''
    expect(fig).toContain('$265,456.79')
    expect(fig).toContain('$101,500.00 committed; $163,956.79 not yet committed, break at 1 Mar 2027')
    expect(host.querySelector('[data-fig="Earned"]')?.textContent).toContain('$101,500.00')
  })
})
