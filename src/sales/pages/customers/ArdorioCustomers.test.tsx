import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, dto, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const LIST = 'GET /sales/invoices'

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

const text = (): string => host.textContent ?? ''
const rowsText = (): string[] => [...host.querySelectorAll('tbody tr')].map(r => r.textContent ?? '')

const tiles = (): string[] => [...host.querySelectorAll('.kpi')].map(k => k.textContent ?? '')
const company = (id: string): HTMLTableRowElement | null => host.querySelector(`tr[data-company="${id}"]`)
const expander = (name: string): HTMLButtonElement | null => host.querySelector(`button[aria-label$="${name}"]`)
const companyOrder = (): string[] => [...host.querySelectorAll('tr[data-company]')].map(r => r.getAttribute('data-company') ?? '')

const TEST = { markedAt: '2026-09-01', markedBy: 'u', reason: 'demo' }
const INVOICES = [
  // Tidewater, Platform build (dl1): contracted 50,000 + 6,400 approved variation.
  dto({ id: 'a', dealId: 'dl1', companyId: 'co1', milestoneId: 'm1', status: 'paid', subtotalCents: 1800000 }),
  dto({ id: 'x', dealId: 'dl1', companyId: 'co1', milestoneId: null, status: 'sent', subtotalCents: 600000, source: 'external', external: { source: 'xero', reference: 'INV-0457', recordedBy: 'u-me', recordedAt: '2026-09-01T00:00:00Z' } as never }),
  dto({ id: 'v', dealId: 'dl1', companyId: 'co1', milestoneId: 'm2', status: 'void', subtotalCents: 1800000 }),
  dto({ id: 't', dealId: 'dl1', companyId: 'co1', milestoneId: 'm2', status: 'paid', subtotalCents: 1800000, test: TEST }),
  // Banksia, retainer deal (dl2): one project invoice overdue, two retainer invoices.
  dto({ id: 'b', dealId: 'dl2', companyId: 'co2', milestoneId: 'b1', status: 'sent', overdue: true, subtotalCents: 450000 }),
  dto({ id: 'r1', dealId: 'dl2', companyId: 'co2', milestoneId: null, status: 'paid', subtotalCents: 120000, source: 'retainer' }),
  dto({ id: 'r2', dealId: 'dl2', companyId: 'co2', milestoneId: null, status: 'draft', subtotalCents: 120000, source: 'retainer' }),
  // Larch: an invoice on the company with no deal.
  dto({ id: 'l', invoiceNumber: 'INV-0099', dealId: null, companyId: 'co4', status: 'paid', subtotalCents: 180000, issueDate: '2026-10-03' }),
]
const ok = { [LIST]: () => json(200, { invoices: INVOICES }) }

const PLAN1 = {
  dealId: 'dl1', businessId: 'ard',
  contract: { baselineCents: 5000000, engagementType: 'fixed-price', contractedOn: '2026-07-28', contractedBy: 'u-me', estimateAtWonCents: 6000000 },
  variations: [
    { id: 'vo1', label: 'VO-1', amountCents: 640000, reason: 'More screens', status: 'approved', createdAt: '2026-08-01T00:00:00Z', createdBy: 'u-me' },
    { id: 'vo2', label: 'VO-2', amountCents: 900000, reason: 'Maybe', status: 'proposed', createdAt: '2026-08-02T00:00:00Z', createdBy: 'u-me' },
  ],
  milestones: [
    { id: 'm1', label: 'Discovery', amountCents: 1800000, plannedDate: '2026-08-15', deliveredOn: '2026-08-14' },
    { id: 'm2', label: 'Core platform', amountCents: 1800000, plannedDate: '2026-10-03', deliveredOn: '2026-10-02' },
    { id: 'm3', label: 'Launch and handover', amountCents: 1000000, plannedDate: '2027-02-01' },
  ],
}
const PLAN2 = {
  dealId: 'dl2', businessId: 'ard',
  contract: { baselineCents: 900000, engagementType: 'support-retainer', contractedOn: '2026-07-28', contractedBy: 'u-me', estimateAtWonCents: 900000 },
  milestones: [{ id: 'b1', label: 'Setup', amountCents: 900000, deliveredOn: '2026-08-01' }],
  retainer: { amountCents: 120000, interval: 'monthly' },
}

async function show(routes: Parameters<typeof fakeApi>[0] = ok, role: Parameters<typeof setArdRole>[1] = 'admin', route: Record<string, unknown> = { page: 'customers', q: { product: 'ard' } }) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    companies: [
      rec('co1', { name: 'Tidewater Foods', tags: [], tech: [], notes: [], archived: false }), rec('co2', { name: 'Banksia Advisory', tags: [], tech: [], notes: [], archived: false }),
      rec('co4', { name: 'Larch & Co', tags: [], tech: [], notes: [], archived: false }), rec('co5', { name: 'Newly Won Pty', tags: [], tech: [], notes: [], archived: false }),
    ],
    deals: [
      rec('dl1', ardDeal('dl1', { companyId: 'co1', title: 'Platform build' }).data), rec('dl2', ardDeal('dl2', { companyId: 'co2', title: 'Advisory portal', value: 9000 }).data),
      rec('dl3', ardDeal('dl3', { companyId: 'co5', title: 'Website rebuild', value: 9600, closedAt: '2026-10-05T09:00:00' }).data),
      rec('dl4', ardDeal('dl4', { companyId: 'co5', status: 'open' }).data),
    ],
    billingPlans: [rec('bp_dl1', PLAN1), rec('bp_dl2', PLAN2)],
  }))
  setArdRole(m, role)
  const api = fakeApi(routes)
  const { Customers } = await import('./Customers')
  await act(async () => { root.render(<Customers route={route as never} />) })
  await settle(10)
  return api
}

describe('Customers page: Ardorio by deal, for admins', () => {
  it('tiles show Contracted, Earned, Invoiced, Collected and Outstanding with what is overdue', async () => {
    await show()
    const t = tiles()
    // 56,400 + 9,000; the proposed variation and the estimate-only deal are not contracted.
    expect(t[0]).toBe('Contracted$65,400')
    // Delivered: 18,000 + 18,000 + 9,000.
    expect(t[1]).toBe('Earned$45,000')
    // Project money only, the sum of the deal rows (board 7): 18,000 + 6,000 external + 4,500; void, test and draft left out.
    expect(t[2]).toBe('Invoiced$28,500')
    expect(t[3]).toBe('Collected$18,000')
    expect(t[4]).toContain('Outstanding$10,500')
    expect(t[4]).toContain('$4,500 overdue · 1 customer')
    expect(text()).toContain('Money is counted per deal, ex GST')
    // The 1,200 retainer and the 1,800 not on a deal are named apart, and every issued invoice adds up as in the report.
    const apart = host.querySelector('[data-apart]')?.textContent ?? ''
    expect(apart).toContain('Retainer $1,200 invoiced, $1,200 collected, $0 outstanding')
    expect(apart).toContain('Not on a won deal $1,800 invoiced, $1,800 collected')
    expect(apart).toContain('Every issued invoice: $31,500 invoiced, $21,000 collected, $10,500 outstanding')
  })

  it('company rows are sorted by Outstanding, biggest first, with proper headers', async () => {
    await show()
    const heads = [...host.querySelectorAll('thead th')].map(h => h.textContent?.trim())
    expect(heads).toEqual(['Company / deal', 'Contracted', 'Earned', 'Invoiced', 'Collected', 'Outstanding', 'Next milestone due'])
    expect([...host.querySelectorAll('thead th')].every(h => h.getAttribute('scope') === 'col')).toBe(true)
    expect(host.querySelector('thead th[aria-sort]')?.textContent).toBe('Outstanding')
    expect(host.querySelector('thead th[aria-sort]')?.getAttribute('aria-sort')).toBe('descending')
    expect(companyOrder()).toEqual(['co1', 'co2', 'co4', 'co5'])
    const t = company('co1')?.textContent ?? ''
    expect(t).toContain('Tidewater Foods')
    expect(t).toContain('1 deal')
    expect(t).toContain('$56,400.00')
    expect(t).toContain('$24,000.00')
    expect(t).toContain('$6,000.00')
    // Overdue is said in words, not only in colour.
    expect(company('co2')?.textContent).toContain('Overdue $4,500.00')
    // Retainer and not-on-a-deal money is labelled apart, never in the company's project figure.
    expect(company('co2')?.textContent).toContain('$4,500.00+ retainer $1,200.00')
    expect(company('co4')?.textContent).toContain('No won deal')
    expect(company('co4')?.textContent).toContain('$0.00+ not on a deal $1,800.00')
    expect(company('co5')?.textContent).toContain('+ $9,600.00 estimate')
  })

  it('a company row expands and collapses its deals with a button that says so', async () => {
    await show()
    expect(host.querySelector('tr[data-deal]')).toBeNull()
    const b = expander('Tidewater Foods')
    expect(b?.getAttribute('aria-expanded')).toBe('false')
    expect(b?.getAttribute('aria-label')).toBe('Expand Tidewater Foods')
    expect(b?.tagName).toBe('BUTTON')
    await click(b)
    expect(expander('Tidewater Foods')?.getAttribute('aria-expanded')).toBe('true')
    expect(expander('Tidewater Foods')?.getAttribute('aria-label')).toBe('Collapse Tidewater Foods')
    const d = host.querySelector('tr[data-deal="dl1"]')?.textContent ?? ''
    expect(d).toContain('Platform build')
    expect(d).toContain('Fixed-price project')
    expect(d).toContain('$56,400.00') // contracted
    expect(d).toContain('$36,000.00') // earned
    expect(d).toContain('$24,000.00') // invoiced, external included
    expect(d).toContain('$18,000.00') // collected
    expect(d).toContain('Delivered, not invoiced $18,000.00')
    expect(d).toContain('Launch and handover')
    expect(d).toContain('1 Feb 2027')
    expect(d).toContain('$10,000.00')
    await click(expander('Tidewater Foods'))
    expect(host.querySelector('tr[data-deal]')).toBeNull()
  })

  it('the deal title opens the deal on its Billing tab', async () => {
    await show()
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(expander('Tidewater Foods'))
    await click(host.querySelector('tr[data-deal="dl1"] a'))
    const [p] = nav.mock.calls.at(-1) as [string]
    const u = new URL(p, 'https://x')
    expect(u.pathname).toBe('/sales/deals/dl1')
    expect(JSON.parse(u.searchParams.get('q') ?? '{}')).toEqual({ tab: 'billing' })
  })

  it('retainer invoices sit on their own line under the deal, apart from project progress', async () => {
    await show()
    await click(expander('Banksia Advisory'))
    const d = host.querySelector('tr[data-deal="dl2"]')?.textContent ?? ''
    expect(d).toContain('Support retainer')
    expect(d).toContain('$4,500.00') // project invoiced, not the retainer
    expect(d).toContain('Overdue')
    const r = host.querySelector('tr[data-retainer="dl2"]')?.textContent ?? ''
    expect(r).toContain('Retainer')
    expect(r).toContain('$1,200.00')
    expect(r).toContain('$0.00')
  })

  it('a won deal without a contract shows its estimate, labelled, with an Add contract hint', async () => {
    await show()
    await click(expander('Newly Won Pty'))
    const d = host.querySelector('tr[data-deal="dl3"]')?.textContent ?? ''
    expect(d).toContain('Estimate')
    expect(d).toContain('$9,600.00')
    expect(d).toContain('Add contract')
    expect(d).toContain('No contract yet')
    expect(d).toContain('—')
  })

  it('a column header sorts the companies, and again reverses them', async () => {
    await show()
    await click(button(host, 'Company / deal'))
    expect(companyOrder()).toEqual(['co2', 'co4', 'co5', 'co1'])
    expect(host.querySelector('thead th[aria-sort]')?.getAttribute('aria-sort')).toBe('ascending')
    await click(button(host, /^Company \/ deal/))
    expect(companyOrder()).toEqual(['co1', 'co5', 'co4', 'co2'])
    await click(button(host, 'Contracted'))
    expect(companyOrder()).toEqual(['co1', 'co2', 'co4', 'co5'])
  })

  it('Delivered, not invoiced lists delivered milestones with no live invoice, and Draft invoice opens the milestone draft', async () => {
    await show()
    const tab = button(host, /^Delivered, not invoiced/)
    expect(tab?.querySelector('.cnt')?.textContent).toBe('1')
    expect(button(host, /^Won, not yet invoiced/)).toBeUndefined()
    await click(tab)
    const r = rowsText()
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('Tidewater Foods')
    expect(r[0]).toContain('Core platform')
    expect(r[0]).toContain('$18,000.00')
    expect(r[0]).toContain('2 Oct 2026')
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(button(host, 'Draft invoice'))
    const [p] = nav.mock.calls.at(-1) as [string]
    const u = new URL(p, 'https://x')
    expect(u.pathname).toBe('/sales/invoices/new')
    expect(JSON.parse(u.searchParams.get('q') ?? '{}')).toEqual({ companyId: 'co1', dealId: 'dl1', milestoneId: 'm2' })
  })

  it('Unscheduled contract value lists won deals whose milestones fall short of the contract, with the gap', async () => {
    await show()
    const tab = button(host, /^Unscheduled contract value/)
    expect(tab?.querySelector('.cnt')?.textContent).toBe('1')
    await click(tab)
    const r = rowsText()
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('Platform build')
    expect(r[0]).toContain('$56,400.00')
    expect(r[0]).toContain('$46,000.00')
    expect(r[0]).toContain('$10,400.00')
  })

  it('Unlinked invoices lists live invoices with no deal, and Open goes to the invoice', async () => {
    await show()
    const tab = button(host, /^Unlinked invoices/)
    expect(tab?.querySelector('.cnt')?.textContent).toBe('1')
    await click(tab)
    const r = rowsText()
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('INV-0099')
    expect(r[0]).toContain('Larch & Co')
    expect(r[0]).toContain('No deal')
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(button(host, 'Open'))
    const [p] = nav.mock.calls.at(-1) as [string]
    expect(new URL(p, 'https://x').pathname).toBe('/sales/invoices/l')
  })

  it('No contract yet lists won deals with no contract, says which were never invoiced, and Add contract opens billing', async () => {
    await show()
    const tab = button(host, /^No contract yet/)
    expect(tab?.textContent).toContain('1 not invoiced')
    expect(tab?.querySelector('.cnt')?.textContent).toBe('1')
    await click(tab)
    const r = rowsText()
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('Newly Won Pty')
    expect(r[0]).toContain('Website rebuild')
    expect(r[0]).toContain('$9,600.00')
    expect(r[0]).toContain('Not invoiced')
    expect(r[0]).toContain('1 Dec 2026') // the close date, as wonDay reads it
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(button(host, 'Add contract'))
    const [p] = nav.mock.calls.at(-1) as [string]
    const u = new URL(p, 'https://x')
    expect(u.pathname).toBe('/sales/deals/dl3')
    expect(JSON.parse(u.searchParams.get('q') ?? '{}')).toEqual({ tab: 'billing' })
  })

  it('an invoice on an archived or unknown company is named in Unlinked and in a banner, not silently dropped', async () => {
    const extra = [
      dto({ id: 'g1', invoiceNumber: 'INV-0200', clientName: 'Gone Ltd', dealId: 'dlz', companyId: 'co-missing', status: 'sent', subtotalCents: 250000, issueDate: '2026-10-07' }),
    ]
    await show({ [LIST]: () => json(200, { invoices: [...INVOICES, ...extra] }) })
    // The project tiles are unchanged; the line under them names the money on no customer and the full total.
    expect(tiles()[2]).toBe('Invoiced$28,500')
    const apart = host.querySelector('[data-apart]')?.textContent ?? ''
    expect(apart).toContain('On no customer (no company, or archived or not found) $2,500 invoiced')
    expect(apart).toContain('Every issued invoice: $34,000 invoiced')
    expect(text()).toContain('$2,500 of issued invoices is on no customer')
    await click(button(host, /^Unlinked invoices/))
    const r = rowsText()
    expect(r).toHaveLength(2)
    expect(r[0]).toContain('INV-0200')
    expect(r[0]).toContain('Gone Ltd')
    expect(r[0]).toContain('Company not found')
  })

  it('empty worklists say so', async () => {
    await show({ [LIST]: () => json(200, { invoices: [] }) })
    await click(button(host, /^Unlinked invoices/))
    expect(text()).toContain('Every invoice is linked to a deal')
    expect(host.querySelector('[data-apart]')).toBeNull()
  })

  it('a server error offers Try again, and a 403 shows the admins-only state', async () => {
    await show({ [LIST]: () => json(500, { error: 'boom', code: 'INTERNAL' }) })
    expect(text()).toContain("Couldn't load Ardorio revenue")
    expect(button(host, 'Try again')).toBeTruthy()
    act(() => root.unmount())
    root = createRoot(host)
    await show({ [LIST]: () => json(403, { error: 'no', code: 'ROLE_REQUIRED' }) })
    expect(text()).toContain('Invoices are for Ardorio admins')
  })
})

describe('Customers page: Ardorio, permissions', () => {
  it.each(['manager', 'sales', 'viewer'] as const)('a %s sees the won-deal view and never asks for invoices', async role => {
    const api = await show(ok, role)
    expect(api.calls).toEqual([])
    expect(text()).toContain('Won value')
    expect(text()).toContain('There is no Ardorio account feed yet')
    expect(text()).not.toContain('Outstanding')
    expect(text()).not.toContain('Contracted')
    expect(button(host, /^Delivered, not invoiced/)).toBeUndefined()
    expect(button(host, 'Ardorio revenue report')).toBeUndefined()
  })
  it('a super admin gets the Ardorio view', async () => {
    await show(ok, 'super')
    expect(text()).toContain('Outstanding')
    expect(button(host, 'Ardorio revenue report')).toBeTruthy()
  })
})
