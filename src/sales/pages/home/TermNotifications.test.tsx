import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, dto, invoicingWorld, setArdRole, SUMMARY } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

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

const text = (): string => host.textContent ?? ''
const path = (nav: ReturnType<typeof vi.fn>): { pathname: string; q: Record<string, unknown> } => {
  const [p] = nav.mock.calls.at(-1) as [string]
  const u = new URL(p, 'https://x')
  return { pathname: u.pathname, q: JSON.parse(u.searchParams.get('q') ?? '{}') as Record<string, unknown> }
}

// The five notifications the server writes for term agreements (contract block "Ardorio term agreements").
const note = (id: string, kind: string, title: string, data: Record<string, unknown>, ts: string) =>
  rec(id, { userId: 'u-me', ts, read: false, type: 'Term agreement', kind, title, body: '', link: { page: 'deal', id: 'dl1' }, data })
const NOTES = [
  note('n1', 'term-invoice-drafted', 'Draft invoice INV-0120 ready: Year 2 of 5', { invoiceId: 't1', invoiceNumber: 'INV-0120', dealId: 'dl1', milestoneId: 'inst_2_1' }, '2026-10-13T09:00:00'),
  note('n2', 'term-needs-billing-client', 'Instalment due: no billing client', { dealId: 'dl1', companyId: 'co1' }, '2026-10-13T08:00:00'),
  note('n3', 'term-cpi-to-confirm', 'Confirm CPI for year 3', { dealId: 'dl1', year: 3 }, '2026-10-13T07:00:00'),
  note('n4', 'term-break-window', 'Break window: notice by 1 Dec 2026', { dealId: 'dl1', anniversary: '2027-03-01', noticeBy: '2026-12-01' }, '2026-10-13T06:00:00'),
  note('n5', 'term-ending', 'Term ends in 90 days', { dealId: 'dl1', termEnd: '2027-01-11' }, '2026-10-13T05:00:00'),
]

async function showNotifs(role: Parameters<typeof setArdRole>[1]) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], notifications: NOTES }))
  setArdRole(m, role)
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  fakeApi({})
  const { Notifications } = await import('./Notifications')
  await act(async () => { root.render(<Notifications />) })
  await settle(4)
  return nav
}

describe('Notifications: term agreement kinds', () => {
  it('the drafted instalment opens its draft invoice and marks the notification read', async () => {
    const nav = await showNotifs('admin')
    expect(text()).toContain('Draft invoice INV-0120 ready: Year 2 of 5')
    await click(button(host, 'Open draft INV-0120'))
    expect(path(nav).pathname).toBe('/sales/invoices/t1')
    expect(m.store.S.notifications.find(n => n.id === 'n1')?.read).toBe(true)
  })

  it('no billing client goes to the company billing details', async () => {
    const nav = await showNotifs('admin')
    await click(button(host, 'Add billing details'))
    const p = path(nav)
    expect(p.pathname).toContain('co1')
    expect(p.q).toEqual({ tab: 'overview', focus: 'billing-details' })
  })

  it('CPI to confirm, the break window and the term ending open the deal on its Billing tab', async () => {
    const nav = await showNotifs('admin')
    for (const label of ['Confirm CPI for year 3', 'Review the break window', 'Plan the renewal']) {
      await click(button(host, label))
      expect(path(nav)).toEqual({ pathname: '/sales/deals/dl1', q: { tab: 'billing' } })
    }
    expect(m.store.S.notifications.filter(n => ['n3', 'n4', 'n5'].includes(n.id)).every(n => n.read)).toBe(true)
  })

  it('clicking a term row itself takes the same action', async () => {
    const nav = await showNotifs('admin')
    const row = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(r => r.textContent?.includes('Term ends in 90 days'))
    await click(row)
    expect(path(nav)).toEqual({ pathname: '/sales/deals/dl1', q: { tab: 'billing' } })
  })

  it('someone who cannot bill gets the deal or the company, never the invoice, billing details or Billing tab', async () => {
    const nav = await showNotifs('sales')
    expect(button(host, 'Open draft INV-0120')).toBeUndefined()
    expect(button(host, 'Add billing details')).toBeUndefined()
    expect(button(host, 'Confirm CPI for year 3')).toBeUndefined()
    // One Open deal per notification with a deal, never two on one: CPI, break window and ending, and beside Open company.
    expect(button(host, 'Open company')).toBeTruthy()
    const deals = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Open deal')
    expect(deals).toHaveLength(4)
    await click(deals[0])
    expect(path(nav)).toEqual({ pathname: '/sales/deals/dl1', q: {} })
    const row = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(r => r.textContent?.includes('INV-0120 ready'))
    await click(row)
    expect(path(nav).pathname).toBe('/sales/deals/dl1')
  })
})

describe('From term agreement chip', () => {
  const fromTerm = dto({ id: 't1', invoiceNumber: 'INV-0120', milestoneId: 'inst_2_1', status: 'draft', issuedCount: 0, sentAt: null, source: 'term' })
  const manual = dto({ id: 'm1', invoiceNumber: 'INV-0030', milestoneId: null, status: 'paid', source: 'manual' })
  const retainer = dto({ id: 'r1', invoiceNumber: 'INV-0041', milestoneId: null, status: 'paid', source: 'retainer' })

  it('shows in the invoice list on term invoices only, with an icon and words', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices': () => json(200, { invoices: [fromTerm, manual, retainer] }), 'GET /sales/invoices/summary': () => json(200, SUMMARY) })
    const { Invoices } = await import('../invoices/Invoices')
    await act(async () => { root.render(<Invoices />) })
    await settle(8)
    const rows = [...host.querySelectorAll('tbody tr')]
    const row = (n: string): Element | undefined => rows.find(r => r.textContent?.includes(n))
    const chip = [...(row('INV-0120')?.querySelectorAll('.chip') ?? [])].find(c => c.textContent === 'From term agreement')
    expect(chip).toBeTruthy()
    expect(chip?.querySelector('svg')).toBeTruthy()
    expect(row('INV-0030')?.textContent).not.toContain('From term agreement')
    expect(row('INV-0041')?.textContent).not.toContain('From term agreement')
    expect(row('INV-0041')?.textContent).toContain('From retainer')
  })

  it('shows on the invoice view once issued', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    const sent = { ...fromTerm, status: 'sent' as const, issuedCount: 1, sentAt: '2026-10-13T01:00:00.000Z' }
    fakeApi({ 'GET /sales/invoices/t1': () => json(200, sent), 'GET /sales/invoices?dealId=dl1': () => json(200, { invoices: [sent] }), 'GET /sales/invoices/clients': () => json(200, { clients: [] }) })
    const { Invoice } = await import('../invoices/Invoice')
    await act(async () => { root.render(<Invoice route={{ page: 'invoice', id: 't1' }} />) })
    await settle(10)
    expect(text()).toContain('INV-0120')
    expect([...host.querySelectorAll('.chip')].some(c => c.textContent === 'From term agreement')).toBe(true)
  })
})
