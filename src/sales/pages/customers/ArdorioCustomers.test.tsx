import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceCompanyTotals } from '../../api/contract'
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

const SUM = 'GET /sales/invoices/summary'
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

const T = (o: Partial<InvoiceCompanyTotals> & { companyId: string }): InvoiceCompanyTotals => ({
  clientSlug: o.companyId, clientName: o.companyId, invoicedCents: 0, paidCents: 0, outstandingCents: 0, overdueCents: 0, lastPaymentAt: null, lastPaymentMethod: null, ...o,
})
const SUMMARY = {
  tiles: { outstandingCents: 2250000, overdueCents: 450000, paidThisMonthCents: 0, draftCount: 0, draftCents: 0 },
  byCompany: [
    T({ companyId: 'co1', invoicedCents: 3600000, paidCents: 1800000, outstandingCents: 1800000, lastPaymentAt: '2026-08-20', lastPaymentMethod: 'bank-transfer' }),
    T({ companyId: 'co2', invoicedCents: 1350000, paidCents: 900000, outstandingCents: 450000, overdueCents: 450000, lastPaymentAt: '2026-08-29', lastPaymentMethod: 'card' }),
    T({ companyId: 'co4', invoicedCents: 180000, paidCents: 180000, lastPaymentAt: '2026-10-03', lastPaymentMethod: 'payid' }),
  ],
}
const INVOICES = [dto({ id: 'a', dealId: 'dl1', companyId: 'co1' }), dto({ id: 'b', dealId: 'dl2', companyId: 'co2', status: 'draft' })]
const ok = { [SUM]: () => json(200, SUMMARY), [LIST]: () => json(200, { invoices: INVOICES }) }

async function show(routes: Parameters<typeof fakeApi>[0] = ok, role: Parameters<typeof setArdRole>[1] = 'admin', route: Record<string, unknown> = { page: 'customers', q: { product: 'ard' } }) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    companies: [
      rec('co1', { name: 'Tidewater Foods', tags: [], tech: [], notes: [], archived: false }), rec('co2', { name: 'Banksia Advisory', tags: [], tech: [], notes: [], archived: false }),
      rec('co4', { name: 'Larch & Co', tags: [], tech: [], notes: [], archived: false }), rec('co5', { name: 'Newly Won Pty', tags: [], tech: [], notes: [], archived: false }),
    ],
    deals: [
      rec('dl1', ardDeal('dl1', { companyId: 'co1' }).data), rec('dl2', ardDeal('dl2', { companyId: 'co2', value: 54000 }).data),
      rec('dl3', ardDeal('dl3', { companyId: 'co5', title: 'Website rebuild', value: 9600, closedAt: '2026-10-05T09:00:00' }).data),
      rec('dl4', ardDeal('dl4', { companyId: 'co5', status: 'open' }).data),
    ],
    billingPlans: [rec('bp_dl2', { dealId: 'dl2', businessId: 'ard', milestones: [], retainer: { amountCents: 450000, interval: 'monthly' } })],
  }))
  setArdRole(m, role)
  const api = fakeApi(routes)
  const { Customers } = await import('./Customers')
  await act(async () => { root.render(<Customers route={route as never} />) })
  await settle(10)
  return api
}

describe('Customers page: Ardorio, for admins', () => {
  it('shows the Invoiced, Paid, Outstanding and Overdue tiles from the summary', async () => {
    await show()
    const tiles = [...host.querySelectorAll('.kpi')].map(k => k.textContent ?? '')
    expect(tiles[0]).toBe('Invoiced$51,300')
    expect(tiles[1]).toBe('Paid$28,800')
    expect(tiles[2]).toBe('Outstanding$22,500')
    expect(tiles[3]).toContain('Overdue$4,500')
    expect(tiles[3]).toContain('1 customer')
    expect(text()).toContain('Ardorio revenue comes from your invoices, ex GST')
  })

  it('lists customers with won deals, invoiced, paid, outstanding, last payment and method', async () => {
    await show()
    const heads = [...host.querySelectorAll('thead th')].map(h => h.textContent?.trim())
    expect(heads).toEqual(['Customer', 'Won deals', 'Invoiced', 'Paid', 'Outstanding', 'Last payment', 'Method'])
    const r = rowsText()
    expect(r).toHaveLength(4)
    expect(r[0]).toContain('Tidewater Foods')
    expect(r[0]).toMatch(/1\s*·\s*\$60,000/)
    expect(r[0]).toContain('$36,000.00')
    expect(r[0]).toContain('$18,000.00')
    expect(r[0]).toContain('20 Aug 2026')
    expect(r[0]).toContain('Bank transfer')
    expect(r[1]).toContain('Banksia Advisory')
    expect(r[1]).toContain('Overdue')
    expect(r[1]).toContain('retainer')
    expect(r[1]).toContain('Card')
    expect(r[2]).toContain('Larch & Co')
    expect(r[2]).toContain('No deal')
    expect(r[2]).toContain('PayID')
    // A won deal with nothing invoiced yet still makes a customer.
    expect(r[3]).toContain('Newly Won Pty')
    expect(r[3]).toMatch(/1\s*·\s*\$9,600/)
    expect(r[3]).toContain('$0.00')
  })

  it('the Won, not yet invoiced tab lists won Ardorio deals with no invoice, with a count', async () => {
    await show()
    const tab = button(host, /^Won, not yet invoiced/)
    expect(tab?.textContent).toContain('1')
    await click(tab)
    const r = rowsText()
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('Newly Won Pty')
    expect(r[0]).toContain('Website rebuild')
    expect(r[0]).toContain('$9,600')
    expect(text()).not.toContain('Tidewater Foods')
  })

  it('a deal whose only invoice is a draft counts as invoiced', async () => {
    await show()
    await click(button(host, /^Won, not yet invoiced/))
    expect(rowsText().join()).not.toContain('dl2')
    expect(rowsText()).toHaveLength(1)
  })

  it('Open billing goes to the deal billing tab', async () => {
    await show()
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(button(host, /^Won, not yet invoiced/))
    await click(button(host, 'Open billing'))
    const [p] = nav.mock.calls.at(-1) as [string]
    const u = new URL(p, 'https://x')
    expect(u.pathname).toBe('/sales/deals/dl3')
    expect(JSON.parse(u.searchParams.get('q') ?? '{}')).toEqual({ tab: 'billing' })
  })

  it('an empty won tab says every deal has an invoice', async () => {
    await show({ ...ok, [LIST]: () => json(200, { invoices: [...INVOICES, dto({ id: 'c', dealId: 'dl3' })] }) })
    await click(button(host, /^Won, not yet invoiced/))
    expect(text()).toContain('Every won deal has an invoice')
  })

  it('a server error offers Try again, and a 403 shows the admins-only state', async () => {
    await show({ ...ok, [SUM]: () => json(500, { error: 'boom', code: 'INTERNAL' }) })
    expect(text()).toContain("Couldn't load Ardorio revenue")
    expect(button(host, 'Try again')).toBeTruthy()
    act(() => root.unmount())
    root = createRoot(host)
    await show({ ...ok, [SUM]: () => json(403, { error: 'no', code: 'ROLE_REQUIRED' }) })
    expect(text()).toContain('Invoices are for Ardorio admins')
  })
})

describe('Customers page: Ardorio, permissions', () => {
  it.each(['manager', 'sales', 'viewer'] as const)('a %s sees the won-deal view and never asks for invoices', async role => {
    const api = await show(ok, role)
    expect(api.calls).toEqual([])
    expect(text()).toContain('Total won value')
    expect(text()).toContain('There is no Ardorio account feed yet')
    expect(text()).not.toContain('Outstanding')
    expect(button(host, /^Won, not yet invoiced/)).toBeUndefined()
  })
  it('a super admin gets the Ardorio view', async () => {
    await show(ok, 'super')
    expect(text()).toContain('Outstanding')
  })
})
