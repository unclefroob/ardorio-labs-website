import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { ardDeal, CLIENT, dto, invoicingWorld, setArdRole, SETTINGS, SUMMARY } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const DEAL_LIST = 'GET /sales/invoices?dealId=dl1'
const CLIENTS = 'GET /sales/invoices/clients'
const SET = 'GET /sales/invoices/settings'

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  sessionStorage.clear()
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
const note = (): string => host.querySelector('[role="note"][aria-label="Retainer automation"]')?.textContent ?? ''
const path = (nav: ReturnType<typeof vi.fn>): { pathname: string; q: Record<string, unknown> } => {
  const [p] = nav.mock.calls.at(-1) as [string]
  const u = new URL(p, 'https://x')
  return { pathname: u.pathname, q: JSON.parse(u.searchParams.get('q') ?? '{}') as Record<string, unknown> }
}

const plan = (retainer: Record<string, unknown>) => rec('bp_dl1', { dealId: 'dl1', businessId: 'ard', milestones: [], retainer: { amountCents: 450000, interval: 'monthly', ...retainer } })
const fromRetainer = dto({ id: 'r1', invoiceNumber: 'INV-0041', milestoneId: null, status: 'draft', issuedCount: 0, sentAt: null, source: 'retainer' })
const manual = dto({ id: 'r2', invoiceNumber: 'INV-0030', milestoneId: null, status: 'paid', source: 'manual' })
const base = { [DEAL_LIST]: () => json(200, { invoices: [fromRetainer, manual] }), [CLIENTS]: () => json(200, { clients: [CLIENT] }), [SET]: () => json(200, SETTINGS) }

async function showCard(retainer: Record<string, unknown>) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [plan(retainer)] }))
  setArdRole(m, 'admin')
  m.ui.bindNavigate(vi.fn())
  const api = fakeApi(base)
  const { BillingCard } = await import('./BillingCard')
  const { Q } = await import('../../data/Q')
  const deal = Q.deal('dl1')!
  await act(async () => { root.render(<BillingCard deal={deal} />) })
  await settle(8)
  return api
}

describe('Deal billing card: retainer automation', () => {
  it('shows the next invoice date, the last drafted period and that the draft is made automatically, never sent', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01', lastDraftedFor: '2099-10-01' })
    expect(text()).toContain('Next invoice date1 Nov 2099')
    expect(text()).toContain('Last drafted periodOctober 2099')
    expect(text()).toContain('Drafted for 1 Oct 2099')
    expect(note()).toContain('A draft invoice for $4,500.00 is created automatically on 1 Nov 2099')
    expect(note()).toContain('never sent automatically')
  })

  it('says None yet before the first automatic draft', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01' })
    expect(text()).toContain('Last drafted periodNone yet')
  })

  it('a due date that has not been drafted says it is due and drafted on the next run', async () => {
    await showCard({ nextInvoiceDate: '2020-01-01', lastDraftedFor: '2019-12-01' })
    expect(note()).toContain('Due 1 Jan 2020')
    expect(note()).toContain('on the next run, as long as the company has a billing client')
    expect(note()).toContain('never sent automatically')
  })

  it('without a next invoice date nothing is drafted, and it says so', async () => {
    await showCard({})
    expect(note()).toContain('No next invoice date, so no draft is created automatically')
  })

  it('marks retainer-drafted invoices with a From retainer chip, and only those', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01' })
    const rows = [...host.querySelectorAll('.rowx')].map(r => r.textContent ?? '')
    expect(rows.find(r => r.includes('INV-0041'))).toContain('From retainer')
    expect(rows.find(r => r.includes('INV-0030'))).not.toContain('From retainer')
  })

  it('editing the retainer keeps the server-owned last drafted period', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01', lastDraftedFor: '2099-10-01' })
    await click(button(host, 'Edit retainer'))
    await type(host.querySelector('[aria-label="Retainer amount"]'), '5000')
    await click(button(host, 'Save retainer'))
    expect(m.store.S.billingPlans[0].retainer).toEqual({ amountCents: 500000, interval: 'monthly', nextInvoiceDate: '2099-11-01', lastDraftedFor: '2099-10-01' })
  })
})

describe('From retainer chip', () => {
  it('shows in the invoice list on retainer invoices only', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices': () => json(200, { invoices: [fromRetainer, manual] }), 'GET /sales/invoices/summary': () => json(200, SUMMARY) })
    const { Invoices } = await import('../invoices/Invoices')
    await act(async () => { root.render(<Invoices />) })
    await settle(8)
    const rows = [...host.querySelectorAll('tbody tr')].map(r => r.textContent ?? '')
    expect(rows.find(r => r.includes('INV-0041'))).toContain('From retainer')
    expect(rows.find(r => r.includes('INV-0030'))).not.toContain('From retainer')
  })

  async function openInvoice(inv: ReturnType<typeof dto>) {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ ...base, 'GET /sales/invoices/r1': () => json(200, inv) })
    const { Invoice } = await import('../invoices/Invoice')
    await act(async () => { root.render(<Invoice route={{ page: 'invoice', id: 'r1' }} />) })
    await settle(10)
    return [...host.querySelectorAll('.chip')].find(c => c.textContent === 'From retainer')
  }

  it('shows in the header of a retainer draft, which opens in the editor', async () => {
    const chip = await openInvoice({ ...fromRetainer, dealId: 'dl1', companyId: 'co1' })
    expect(text()).toContain('INV-0041')
    expect(chip).toBeTruthy()
    expect(chip?.querySelector('svg')).toBeTruthy()
  })

  it('stays on the invoice view once issued, and is absent on a manual invoice', async () => {
    expect(await openInvoice({ ...fromRetainer, status: 'sent', issuedCount: 1, sentAt: '2026-10-13T01:00:00.000Z', dealId: 'dl1', companyId: 'co1' })).toBeTruthy()
    act(() => root.unmount())
    root = createRoot(host)
    expect(await openInvoice({ ...fromRetainer, id: 'r1', source: 'manual', status: 'sent', issuedCount: 1 })).toBeUndefined()
  })
})

describe('Notifications: retainer kinds', () => {
  const drafted = rec('nt1', {
    userId: 'u-me', ts: '2026-10-13T09:00:00', read: false, type: 'Retainer invoice drafted', kind: 'retainer-invoice-drafted',
    title: 'Draft invoice INV-0041 ready', body: 'The October 2026 retainer invoice is drafted.', link: { page: 'deal', id: 'dl1' },
    data: { invoiceId: 'r1', invoiceNumber: 'INV-0041', dealId: 'dl1' },
  })
  const needs = rec('nt2', {
    userId: 'u-me', ts: '2026-10-13T08:00:00', read: false, type: 'Retainer needs a billing client', kind: 'retainer-needs-billing-client',
    title: 'Retainer due: Platform build has no billing client', body: 'Link one to draft the invoice.', link: { page: 'deal', id: 'dl1' },
    data: { dealId: 'dl1', companyId: 'co1' },
  })

  async function showNotifs(role: Parameters<typeof setArdRole>[1]) {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], notifications: [drafted, needs] }))
    setArdRole(m, role)
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    fakeApi({})
    const { Notifications } = await import('../home/Notifications')
    await act(async () => { root.render(<Notifications />) })
    await settle(4)
    return nav
  }

  it('the drafted notification opens the invoice, and marks it read', async () => {
    const nav = await showNotifs('admin')
    expect(text()).toContain('Draft invoice INV-0041 ready')
    await click(button(host, 'Open draft INV-0041'))
    expect(path(nav).pathname).toBe('/sales/invoices/r1')
    expect(m.store.S.notifications.find(n => n.id === 'nt1')?.read).toBe(true)
  })

  it('clicking the drafted row itself also opens the invoice', async () => {
    const nav = await showNotifs('admin')
    const row = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(r => r.textContent?.includes('INV-0041 ready'))
    await click(row)
    expect(path(nav).pathname).toBe('/sales/invoices/r1')
  })

  it('the needs-billing-client notification goes to the company billing details', async () => {
    const nav = await showNotifs('admin')
    await click(button(host, 'Add billing details'))
    const p = path(nav)
    expect(p.pathname).toContain('co1')
    expect(p.q).toEqual({ tab: 'overview', focus: 'billing-details' })
  })

  it('both offer Open deal', async () => {
    const nav = await showNotifs('admin')
    const deals = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Open deal')
    expect(deals).toHaveLength(2)
    await click(deals[0])
    expect(path(nav).pathname).toContain('dl1')
  })

  it('someone who cannot bill gets the deal and company, never the invoice or billing details', async () => {
    const nav = await showNotifs('sales')
    expect(button(host, 'Open draft INV-0041')).toBeUndefined()
    expect(button(host, 'Add billing details')).toBeUndefined()
    await click(button(host, 'Open company'))
    expect(path(nav).q).toEqual({ tab: 'overview' })
    const row = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(r => r.textContent?.includes('INV-0041 ready'))
    await click(row)
    expect(path(nav).pathname).toContain('dl1')
  })
})

describe('Company billing details focus', () => {
  it('scrolls to and focuses Billing details when routed with focus billing-details', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices?companyId=co1': () => json(200, { invoices: [] }), [CLIENTS]: () => json(200, { clients: [] }) })
    const { CompanyBilling } = await import('../companies/BillingCard')
    const { Q } = await import('../../data/Q')
    const company = Q.company('co1')!
    await act(async () => { root.render(<CompanyBilling company={company} focusDetails />) })
    await settle(8)
    const region = host.querySelector('[role="region"][aria-label="Billing details"]')
    expect(region).toBeTruthy()
    expect(document.activeElement).toBe(region)
  })

  it('does not move focus without the route asking', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices?companyId=co1': () => json(200, { invoices: [] }), [CLIENTS]: () => json(200, { clients: [] }) })
    const { CompanyBilling } = await import('../companies/BillingCard')
    const { Q } = await import('../../data/Q')
    const company = Q.company('co1')!
    await act(async () => { root.render(<CompanyBilling company={company} />) })
    await settle(8)
    expect(document.activeElement).not.toBe(host.querySelector('[role="region"][aria-label="Billing details"]'))
  })
})
