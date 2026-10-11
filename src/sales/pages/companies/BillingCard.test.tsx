import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingClient } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { CLIENT, dto, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const LIST = 'GET /sales/invoices?companyId=co1'
const CLIENTS = 'GET /sales/invoices/clients'
const CREATE_CLIENT = 'POST /sales/invoices/clients'

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
const CO = { name: 'Tidewater Foods', tradingName: '', tags: [], tech: [], notes: [], industry: '', subindustry: '', hq: '', state: '', domain: 'tidewaterfoods.example', website: 'https://tidewaterfoods.example', archived: false }
const cl = (slug: string, clientName: string, billing: BillingClient['billing'] = {}, linkedCompanyId: string | null = null): BillingClient => ({ slug, clientName, billing, linkedCompanyId })

const INVOICES = [
  dto({ id: 'i1', invoiceNumber: 'INV-0035', status: 'draft', createdAt: '2026-10-13T00:00:00Z', subtotalCents: 1800000, totalCents: 1980000 }),
  dto({ id: 'i2', invoiceNumber: 'INV-0034', status: 'sent', createdAt: '2026-10-01T00:00:00Z', subtotalCents: 1800000, totalCents: 1980000, dueDate: '2026-11-17' }),
  dto({ id: 'i3', invoiceNumber: 'INV-0033', status: 'sent', overdue: true, createdAt: '2026-09-20T00:00:00Z', subtotalCents: 450000, totalCents: 495000 }),
  dto({ id: 'i4', invoiceNumber: 'INV-0029', status: 'paid', createdAt: '2026-08-01T00:00:00Z', subtotalCents: 1800000, totalCents: 1980000, payment: { method: 'bank-transfer', paidAt: '2026-08-20', amountCents: 1980000, reference: '' } }),
  dto({ id: 'i5', invoiceNumber: 'INV-0028', status: 'paid', createdAt: '2026-07-01T00:00:00Z' }),
  dto({ id: 'i6', invoiceNumber: 'INV-0027', status: 'paid', createdAt: '2026-06-01T00:00:00Z' }),
  dto({ id: 'i7', invoiceNumber: 'INV-0026', status: 'paid', createdAt: '2026-05-01T00:00:00Z' }),
]

async function show(clients: BillingClient[], routes: Parameters<typeof fakeApi>[0] = {}, role: Parameters<typeof setArdRole>[1] = 'admin', companyId = 'co1') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    companies: [rec('co1', CO), rec('co3', { ...CO, name: 'Not In Ardorio' })],
  }))
  setArdRole(m, role)
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const api = fakeApi({ [LIST]: () => json(200, { invoices: INVOICES }), [CLIENTS]: () => json(200, { clients }), ...routes })
  const { CompanyBilling } = await import('./BillingCard')
  const { Q } = await import('../../data/Q')
  const { Hosts } = await import('../../shell/Hosts')
  const company = Q.company(companyId)!
  await act(async () => { root.render(<><CompanyBilling company={company} /><Hosts /></>) })
  await settle(8)
  return { api, nav }
}

describe('Company billing card', () => {
  it('shows invoiced, paid, outstanding and overdue ex GST, issued invoices only', async () => {
    await show([CLIENT])
    const tiles = [...host.querySelectorAll('.card')][0].textContent ?? ''
    // Issued: 18,000 sent + 4,500 overdue + four paid at 18,000 = 94,500. The draft is left out.
    expect(tiles).toContain('Invoiced$94,500')
    expect(tiles).toContain('Paid$72,000')
    expect(tiles).toContain('Outstanding$22,500')
    expect(tiles).toContain('Overdue$4,500')
    expect(tiles).toContain('Includes issued invoices only, not drafts')
  })

  it('lists the last five invoices with status chips and totals, newest first', async () => {
    await show([CLIENT])
    const rows = [...host.querySelectorAll('.rowx')].filter(r => r.textContent?.includes('INV-')).map(r => r.textContent ?? '')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toContain('INV-0035')
    expect(rows[0]).toContain('Draft')
    expect(rows[0]).toContain('$19,800.00')
    expect(rows[1]).toContain('Sent')
    expect(rows[1]).toContain('due 17 Nov 2026')
    expect(rows[2]).toContain('Overdue')
    expect(rows[3]).toContain('Paid')
    expect(rows[3]).toContain('paid 20 Aug 2026')
    expect(text()).not.toContain('INV-0026')
  })

  it('New invoice opens the editor for this company', async () => {
    const { nav } = await show([CLIENT])
    await click(button(host, 'New invoice'))
    const [p] = nav.mock.calls.at(-1) as [string]
    const u = new URL(p, 'https://x')
    expect(u.pathname).toBe('/sales/invoices/new')
    expect(JSON.parse(u.searchParams.get('q') ?? '{}')).toEqual({ companyId: 'co1' })
  })

  it('billing details come from the linked client, and Edit opens the dialog on it', async () => {
    await show([CLIENT])
    expect(text()).toContain('Priya Raman')
    expect(text()).toContain('accounts@tidewaterfoods.example')
    expect(text()).toContain('12 345 678 901')
    expect(text()).toContain('Complete')
    await click(button(host, 'Edit'))
    const modal = m.ui.UI.get().modals[0]
    expect(modal.name).toBe('billingDetails')
    expect(modal.props).toMatchObject({ companyId: 'co1', client: { slug: 'tidewater' } })
  })

  it('says what a linked client is missing', async () => {
    await show([cl('tidewater', 'Tidewater Foods', { email: 'a@b.co' }, 'co1')])
    expect(text()).toContain('Missing an ABN, an address')
  })
})

describe('Company billing card: linking', () => {
  const suggestions = [
    cl('tw', 'Tidewater Foods', { email: 'ap@tidewaterfoods.example' }),
    cl('abn', 'TWF Holdings', { abn: '12 345 678 901' }),
    cl('other', 'Unrelated Ltd', { email: 'x@elsewhere.example' }),
  ]

  it('offers matching billing clients with the reason, and links nothing by itself', async () => {
    const { api } = await show(suggestions)
    expect(text()).toContain('No billing client is linked to Tidewater Foods')
    expect(text()).toContain('Tidewater Foods')
    expect(text()).toContain('Same name · Billing email is on the company website')
    expect(text()).not.toContain('Unrelated Ltd')
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([])
    expect(m.ui.UI.get().modals).toEqual([])
  })

  it('an ABN match is offered when the company has an ABN', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ companies: [rec('co1', { ...CO, name: 'Totally Different', abn: '12345678901' })] }))
    setArdRole(m, 'admin')
    fakeApi({ [LIST]: () => json(200, { invoices: [] }), [CLIENTS]: () => json(200, { clients: [cl('abn', 'TWF Holdings', { abn: '12 345 678 901' })] }) })
    const { CompanyBilling } = await import('./BillingCard')
    const { Q } = await import('../../data/Q')
    await act(async () => { root.render(<CompanyBilling company={Q.company('co1')!} />) })
    await settle(8)
    expect(text()).toContain('TWF Holdings')
    expect(text()).toContain('Same ABN')
  })

  it('Link posts the link for that one client, only after the click', async () => {
    const linked = [cl('tw', 'Tidewater Foods', { email: 'ap@tidewaterfoods.example' }, 'co1')]
    let after = false
    const { api } = await show(suggestions, {
      [CLIENTS]: () => json(200, { clients: after ? linked : suggestions }),
      'POST /sales/invoices/clients/tw/link': () => { after = true; return json(200, {}) },
    })
    const row = [...host.querySelectorAll('.rowx')].find(r => r.textContent?.includes('Same name'))!
    expect(api.calls.filter(c => c.method === 'POST')).toEqual([])
    await click(button(row, 'Link'))
    await settle(8)
    const posts = api.calls.filter(c => c.method === 'POST')
    expect(posts).toEqual([{ method: 'POST', path: '/sales/invoices/clients/tw/link', body: { companyId: 'co1' } }])
    expect(text()).not.toContain('No billing client is linked')
  })

  it('Not it hides that suggestion and sends nothing', async () => {
    const { api } = await show(suggestions)
    const row = [...host.querySelectorAll('.rowx')].find(r => r.textContent?.includes('Same name'))!
    await click(button(row, 'Not it'))
    expect(text()).not.toContain('Same name')
    expect(text()).toContain('Create billing client from')
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([])
  })

  it('Create billing client from the company name creates, then links, on one click', async () => {
    const { api } = await show([], {
      [CREATE_CLIENT]: () => json(201, cl('tidewater-foods', 'Tidewater Foods')),
      'POST /sales/invoices/clients/tidewater-foods/link': () => json(200, {}),
    })
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([])
    await click(button(host, /Create billing client from/))
    await settle(8)
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([
      { method: 'POST', path: '/sales/invoices/clients', body: { clientName: 'Tidewater Foods', billing: {} } },
      { method: 'POST', path: '/sales/invoices/clients/tidewater-foods/link', body: { companyId: 'co1' } },
    ])
  })

  it('a failed link says why and leaves the suggestion in place', async () => {
    await show(suggestions, { 'POST /sales/invoices/clients/tw/link': () => json(409, { error: 'That billing client is already linked to another company', code: 'CONFLICT' }) })
    await click(button(host, 'Link'))
    await settle(8)
    expect(text()).toContain('already linked to another company')
    expect(button(host, 'Link')).toBeTruthy()
  })

  it('a client already linked elsewhere is never suggested', async () => {
    await show([cl('tw', 'Tidewater Foods', {}, 'co9')])
    expect(text()).not.toContain('Same name')
  })
})

describe('Company billing card: who sees it', () => {
  it('nothing, and no request, for a manager, a rep or a viewer', async () => {
    for (const role of ['manager', 'sales', 'viewer'] as const) {
      const { api } = await show([CLIENT], {}, role)
      expect(host.textContent).toBe('')
      expect(api.calls).toEqual([])
      act(() => root.unmount())
      root = createRoot(host)
    }
  })
  it('nothing for a company that is not in Ardorio', async () => {
    const { api } = await show([CLIENT], {}, 'admin', 'co3')
    expect(host.textContent).toBe('')
    expect(api.calls).toEqual([])
  })
  it('the company page shows it on Overview for admins and not for a manager', async () => {
    for (const [role, expected] of [['admin', true], ['manager', false]] as const) {
      m = await loadSales()
      m.bootstrap.hydrate(invoicingWorld({ companies: [rec('co1', CO)] }))
      setArdRole(m, role, { ros: 'manager' })
      fakeApi({ [LIST]: () => json(200, { invoices: INVOICES }), [CLIENTS]: () => json(200, { clients: [CLIENT] }) })
      const { Company } = await import('./Company')
      await act(async () => { root.render(<Company route={{ page: 'company', id: 'co1' } as never} />) })
      await settle(8)
      expect(text().includes('Billing details')).toBe(expected)
      act(() => root.unmount())
      root = createRoot(host)
    }
  })
})
