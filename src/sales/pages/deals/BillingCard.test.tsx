import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { ardDeal, CLIENT, dto, invoicingWorld, PLAN_DATA, setArdRole, SETTINGS } from '../../testing/invoicingWorld'
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
const CREATE = 'POST /sales/invoices'

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
const rowBtn = (i: number, label: string): HTMLButtonElement | undefined => button(host.querySelectorAll('tbody tr')[i], label)

/** The Deal board: m1 paid, m2 invoiced, m3 a draft, m4 not yet billed. */
const BOARD = [
  dto({ id: 'p1', invoiceNumber: 'INV-0029', milestoneId: 'm1', status: 'paid', subtotalCents: 1800000, payment: { method: 'bank-transfer', paidAt: '2026-08-20', amountCents: 1980000, reference: '' } }),
  dto({ id: 'p2', invoiceNumber: 'INV-0034', milestoneId: 'm2', status: 'sent', subtotalCents: 1800000, dueDate: '2026-11-17' }),
  dto({ id: 'p3', invoiceNumber: 'INV-0035', milestoneId: 'm3', status: 'draft', subtotalCents: 1800000, issuedCount: 0, sentAt: null }),
]
const base = { [DEAL_LIST]: () => json(200, { invoices: BOARD }), [CLIENTS]: () => json(200, { clients: [CLIENT] }), [SET]: () => json(200, SETTINGS) }

type Over = Parameters<typeof invoicingWorld>[0]
async function show(routes: Parameters<typeof fakeApi>[0] = base, role: Parameters<typeof setArdRole>[1] = 'admin', over: Over = {}, dealId = 'dl1') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data), rec('dl2', ardDeal('dl2', { businessId: 'ros' }).data)], billingPlans: [rec('bp_dl1', PLAN_DATA)], ...over }))
  setArdRole(m, role)
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const api = fakeApi(routes)
  const { BillingCard } = await import('./BillingCard')
  const { Q } = await import('../../data/Q')
  const { Hosts } = await import('../../shell/Hosts')
  const deal = Q.deal(dealId)!
  await act(async () => { root.render(<><BillingCard deal={deal} /><Hosts /></>) })
  await settle(8)
  return { api, nav }
}
const path = (nav: ReturnType<typeof vi.fn>): { pathname: string; q: Record<string, unknown> } => {
  const [p] = nav.mock.calls.at(-1) as [string]
  const u = new URL(p, 'https://x')
  return { pathname: u.pathname, q: JSON.parse(u.searchParams.get('q') ?? '{}') as Record<string, unknown> }
}

describe('Billing card: the schedule', () => {
  it('lists each milestone with amount, planned date, derived status and linked invoice', async () => {
    await show()
    const r = rowsText()
    expect(r).toHaveLength(4)
    expect(r[0]).toContain('1 · Discovery and design')
    expect(r[0]).toContain('$18,000.00')
    expect(r[0]).toContain('15 Aug 2026')
    expect(r[0]).toContain('Paid')
    expect(r[0]).toContain('INV-0029')
    expect(r[1]).toContain('Invoiced')
    expect(r[1]).toContain('INV-0034')
    expect(r[1]).toContain('Due 17 Nov 2026')
    expect(r[2]).toContain('Draft invoice')
    expect(r[2]).toContain('Not issued')
    expect(r[3]).toContain('Planned')
    expect(r[3]).toContain('Not invoiced')
    expect(r[3]).toContain('$6,000.00')
  })

  it('shows Billed X of Y quoted, with the deal value as the quote and drafts left out', async () => {
    await show()
    expect(text()).toContain('Billed $36,000.00 of $60,000.00 quoted')
    expect(text()).toContain('60%')
    const bar = host.querySelector('.prog')
    expect(bar?.getAttribute('aria-label')).toBe('Paid $18,000.00, invoiced $18,000.00, not yet billed $24,000.00 of $60,000.00')
  })

  it('offers the right button for each state', async () => {
    await show()
    expect(rowBtn(0, 'Create invoice')).toBeUndefined()
    expect(rowBtn(1, 'Mark paid')).toBeTruthy()
    expect(rowBtn(2, 'Open draft')).toBeTruthy()
    expect(rowBtn(3, 'Create invoice')).toBeTruthy()
  })

  it('Create invoice opens the editor for that company, deal and milestone', async () => {
    const { nav } = await show()
    await click(rowBtn(3, 'Create invoice'))
    expect(path(nav)).toEqual({ pathname: '/sales/invoices/new', q: { companyId: 'co1', dealId: 'dl1', milestoneId: 'm4' } })
  })

  it('Mark paid opens the mark-paid dialog and Open draft opens the draft', async () => {
    const { nav } = await show()
    await click(rowBtn(1, 'Mark paid'))
    expect(m.ui.UI.get().modals.map(x => x.name)).toEqual(['markPaid'])
    await click(rowBtn(2, 'Open draft'))
    expect(path(nav).pathname).toBe('/sales/invoices/p3')
  })

  it('the editor that opens is prefilled: company, deal, milestone and one line for the milestone amount', async () => {
    await show()
    const { Invoice } = await import('../invoices/Invoice')
    await act(async () => { root.unmount(); root = createRoot(host); root.render(<Invoice route={{ page: 'invoice', id: 'new', q: { companyId: 'co1', dealId: 'dl1', milestoneId: 'm4' } } as never} />) })
    await settle(10)
    expect((host.querySelector('[aria-label="Description line 1"]') as HTMLInputElement).value).toBe('Final acceptance')
    expect((host.querySelector('[aria-label="Unit price line 1"]') as HTMLInputElement).value).toBe('6000.00')
    expect(host.querySelectorAll('[aria-label^="Description line"]')).toHaveLength(1)
    const sel = [...host.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'm4')) as HTMLSelectElement
    expect(sel.value).toBe('m4')
  })
})

describe('Billing card: changing the schedule', () => {
  it('Add milestone saves a new one into the plan', async () => {
    await show()
    await click(button(host, '+ Add milestone'))
    await type(host.querySelector('[aria-label="Milestone label"]'), 'Training')
    await type(host.querySelector('[aria-label="Milestone amount"]'), '2500.50')
    await type(host.querySelector('[aria-label="Milestone planned date"]'), '2027-01-20')
    await click(button(host, 'Add milestone'))
    const ms = m.store.S.billingPlans[0].milestones
    expect(ms).toHaveLength(5)
    expect(ms[4]).toMatchObject({ label: 'Training', amountCents: 250050, plannedDate: '2027-01-20' })
    expect(rowsText()[4]).toContain('Training')
    expect(rowsText()[4]).toContain('Planned')
  })

  it('refuses an amount that is not dollars and cents, and a blank label, saving nothing', async () => {
    await show()
    await click(button(host, '+ Add milestone'))
    await type(host.querySelector('[aria-label="Milestone label"]'), 'Training')
    await type(host.querySelector('[aria-label="Milestone amount"]'), 'lots')
    await click(button(host, 'Add milestone'))
    expect(text()).toContain('Amount is dollars and cents')
    await type(host.querySelector('[aria-label="Milestone amount"]'), '100')
    await type(host.querySelector('[aria-label="Milestone label"]'), '')
    await click(button(host, 'Add milestone'))
    expect(text()).toContain('1 to 120 characters')
    expect(m.store.S.billingPlans[0].milestones).toHaveLength(4)
  })

  it('creates the plan on the first milestone of a deal that has none', async () => {
    await show(base, 'admin', { billingPlans: [] })
    expect(text()).toContain('No milestones yet')
    await click(button(host, '+ Add milestone'))
    await type(host.querySelector('[aria-label="Milestone label"]'), 'Everything')
    await type(host.querySelector('[aria-label="Milestone amount"]'), '60000')
    await click(button(host, 'Add milestone'))
    expect(m.store.S.billingPlans.map(p => p.id)).toEqual(['bp_dl1'])
  })

  it('only a planned milestone can be removed or edited', async () => {
    await show()
    expect(rowBtn(0, 'Remove')).toBeUndefined()
    expect(rowBtn(1, 'Edit')).toBeUndefined()
    await click(rowBtn(3, 'Remove'))
    expect(m.store.S.billingPlans[0].milestones.map(x => x.id)).toEqual(['m1', 'm2', 'm3'])
  })
})

describe('Billing card: Create invoice for all unbilled', () => {
  it('makes one draft per unbilled milestone with one line each, and issues nothing', async () => {
    const { api } = await show({
      ...base,
      [CREATE]: () => json(201, dto({ id: 'new1', milestoneId: 'm4', status: 'draft' })),
    })
    await click(button(host, 'Create invoice for all unbilled'))
    await settle(10)
    const posts = api.calls.filter(c => `${c.method} ${c.path}` === CREATE)
    expect(posts).toHaveLength(1)
    expect(posts[0].body).toMatchObject({ clientSlug: 'tidewater', companyId: 'co1', dealId: 'dl1', milestoneId: 'm4', lineItems: [{ description: 'Final acceptance', qty: 1, unitPriceCents: 600000 }] })
    expect(api.calls.some(c => c.path.endsWith('/issue'))).toBe(false)
    expect(m.ui.UI.get().toasts.map(t => t.msg).join()).toContain('1 draft invoice created')
  })

  it('is off when every milestone already has an invoice', async () => {
    await show({ ...base, [DEAL_LIST]: () => json(200, { invoices: [...BOARD, dto({ id: 'p4', milestoneId: 'm4', status: 'draft' })] }) })
    expect(button(host, 'Create invoice for all unbilled')?.disabled).toBe(true)
  })

  it('says so, and creates nothing, when the company has no billing details yet', async () => {
    const { api } = await show({ ...base, [CLIENTS]: () => json(200, { clients: [] }) })
    await click(button(host, 'Create invoice for all unbilled'))
    await settle(8)
    expect(text()).toContain('no billing details yet')
    expect(api.count(CREATE)).toBe(0)
  })

  it('stops at a failure and says how many were already made', async () => {
    let n = 0
    await show({
      ...base,
      [DEAL_LIST]: () => json(200, { invoices: [BOARD[0]] }),
      [CREATE]: () => (++n === 1 ? json(201, dto({ id: 'n1', milestoneId: 'm2', status: 'draft' })) : json(500, { error: 'Server error', code: 'INTERNAL' })),
    })
    await click(button(host, 'Create invoice for all unbilled'))
    await settle(12)
    expect(n).toBe(2)
    expect(text()).toContain('1 draft was created first')
  })
})

describe('Billing card: retainer', () => {
  const RET = { dealId: 'dl1', businessId: 'ard', milestones: [], retainer: { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-11-01' } }
  const retainerInvoices = [dto({ id: 'r1', invoiceNumber: 'INV-0033', milestoneId: null, status: 'sent', overdue: true }), dto({ id: 'r2', invoiceNumber: 'INV-0030', milestoneId: null, status: 'paid' })]

  it('shows the monthly amount and next invoice date, and its invoices', async () => {
    await show({ ...base, [DEAL_LIST]: () => json(200, { invoices: retainerInvoices }) }, 'admin', { billingPlans: [rec('bp_dl1', RET)] })
    expect(text()).toContain('$4,500.00')
    expect(text()).toContain('1 Nov 2026')
    expect(text()).toContain('INV-0033')
    expect(text()).toContain('Overdue')
  })

  it('Create invoice opens the editor for the retainer', async () => {
    const { nav } = await show(base, 'admin', { billingPlans: [rec('bp_dl1', RET)] })
    await click(button(host, 'Create invoice'))
    expect(path(nav).q).toEqual({ companyId: 'co1', dealId: 'dl1', retainer: true })
  })

  it('a retainer can be added, then removed', async () => {
    await show(base, 'admin', { billingPlans: [rec('bp_dl1', PLAN_DATA)] })
    await click(button(host, 'Add retainer'))
    await type(host.querySelector('[aria-label="Retainer amount"]'), '4500')
    await type(host.querySelector('[aria-label="Retainer next invoice date"]'), '2026-11-01')
    await click(button(host, 'Save retainer'))
    expect(m.store.S.billingPlans[0].retainer).toEqual({ amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-11-01' })
    await click(button(host, 'Remove retainer'))
    expect(m.store.S.billingPlans[0].retainer).toBeUndefined()
  })

  it('the editor opens with one monthly line', async () => {
    await show(base, 'admin', { billingPlans: [rec('bp_dl1', RET)] })
    const { Invoice } = await import('../invoices/Invoice')
    await act(async () => { root.unmount(); root = createRoot(host); root.render(<Invoice route={{ page: 'invoice', id: 'new', q: { companyId: 'co1', dealId: 'dl1', retainer: true } } as never} />) })
    await settle(10)
    expect((host.querySelector('[aria-label="Description line 1"]') as HTMLInputElement).value).toBe('Monthly retainer')
    expect((host.querySelector('[aria-label="Unit price line 1"]') as HTMLInputElement).value).toBe('4500.00')
  })
})

describe('Billing card: who sees it', () => {
  it('renders nothing for a manager, a sales rep or a viewer, and makes no request', async () => {
    for (const role of ['manager', 'sales', 'viewer'] as const) {
      const { api } = await show(base, role)
      expect(host.textContent).toBe('')
      expect(api.calls).toEqual([])
      act(() => root.unmount())
      root = createRoot(host)
    }
  })
  it('renders nothing for a deal outside Ardorio', async () => {
    const { api } = await show(base, 'admin', {}, 'dl2')
    expect(host.textContent).toBe('')
    expect(api.calls).toEqual([])
  })
  it('a super admin sees it', async () => {
    await show(base, 'super')
    expect(text()).toContain('Billing schedule')
  })
  it('the Deal page has a Billing tab for admins and none for anyone else', async () => {
    for (const [role, expected] of [['admin', true], ['manager', false]] as const) {
      m = await loadSales()
      m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', PLAN_DATA)] }))
      setArdRole(m, role)
      fakeApi(base)
      const { Deal } = await import('./Deal')
      await act(async () => { root.render(<Deal route={{ page: 'deal', id: 'dl1' } as never} />) })
      await settle(6)
      const tabs = [...host.querySelectorAll('[role="tab"]')].map(t => t.textContent ?? '')
      expect(tabs.some(t => t.startsWith('Billing'))).toBe(expected)
      act(() => root.unmount())
      root = createRoot(host)
    }
  })
  it('the Billing tab opens on the card when the route asks for it', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', PLAN_DATA)] }))
    setArdRole(m, 'admin')
    fakeApi(base)
    const { Deal } = await import('./Deal')
    await act(async () => { root.render(<Deal route={{ page: 'deal', id: 'dl1', q: { tab: 'billing' } } as never} />) })
    await settle(8)
    expect(text()).toContain('Billing schedule')
    expect(text()).toContain('Billed $36,000.00 of $60,000.00 quoted')
  })
})
