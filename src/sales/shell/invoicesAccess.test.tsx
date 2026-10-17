import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../testing/fixtures'
import { settle } from '../testing/dom'
import { invoicingWorld, setArdRole, SUMMARY } from '../testing/invoicingWorld'
import { loadSales, type Sales } from '../testing/load'
import { fakeApi, json } from '../testing/rosterioWorld'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

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
})

const text = (): string => host.textContent ?? ''
type Role = Parameters<typeof setArdRole>[1]

async function setup(role: Role, others: Parameters<typeof setArdRole>[2] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, role, others)
}

async function sidebar(): Promise<string> {
  const { Sidebar } = await import('./Sidebar')
  await act(async () => { root.render(<Sidebar />) })
  await settle(3)
  return text()
}

describe('nav entry', () => {
  it('sits in Revenue between Customers and Reports', async () => {
    m = await loadSales()
    const nav = await import('./nav')
    const rev = nav.NAV.find(g => g.group === 'Revenue')
    expect(rev?.items.map(i => i.page)).toEqual(['deals', 'customers', 'invoices', 'reports', 'goals'])
    expect(rev?.items.find(i => i.page === 'invoices')).toMatchObject({ label: 'Invoices', adminOf: 'ard' })
  })

  it('both invoice pages are limited to admins of Ardorio', async () => {
    m = await loadSales()
    const nav = await import('./nav')
    expect(nav.ADMIN_OF_PAGES).toMatchObject({ invoices: 'ard', invoice: 'ard' })
  })

  it('navItemVisible: admin and super yes; manager, sales, viewer and admins of other businesses no', async () => {
    m = await loadSales()
    const nav = await import('./nav')
    const item = nav.NAV.flatMap(g => g.items).find(i => i.page === 'invoices')!
    const viewer = (canAdmin: boolean) => ({ anyAdmin: canAdmin, member: () => true, canAdmin: (b: string) => canAdmin && b === 'ard' })
    expect(nav.navItemVisible(item, viewer(true))).toBe(true)
    expect(nav.navItemVisible(item, viewer(false))).toBe(false)
    expect(nav.navItemVisible(item, { anyAdmin: true, member: () => true, canAdmin: b => b === 'ros' })).toBe(false)
    // Ardorio's own workspace or All businesses: shown; Rosterio's workspace: not.
    expect(nav.navItemVisible(item, { ...viewer(true), inScope: b => b === 'ard' })).toBe(true)
    expect(nav.navItemVisible(item, { ...viewer(true), inScope: b => b === 'ros' })).toBe(false)
    const customers = nav.NAV.flatMap(g => g.items).find(i => i.page === 'customers')!
    expect(nav.navItemVisible(customers, viewer(false))).toBe(true)
  })
})

describe('sidebar', () => {
  it.each<[string, Role, Parameters<typeof setArdRole>[2], boolean]>([
    ['admin of Ardorio', 'admin', {}, true],
    ['super admin', 'super', {}, true],
    ['manager of Ardorio', 'manager', {}, false],
    ['sales in Ardorio', 'sales', {}, false],
    ['viewer in Ardorio', 'viewer', {}, false],
    ['admin of Rosterio only', null, { ros: 'admin' }, false],
  ])('%s: Invoices link visible = %s', async (_name, role, others, shown) => {
    await setup(role, others)
    const t = await sidebar()
    expect(t.includes('Invoices')).toBe(shown)
    expect(t).toContain('Customers')
  })
})

describe('page gate', () => {
  async function visit(path: string, page: string, id?: string) {
    const { PageView } = await import('./PageView')
    m.ui.syncRoute({ page, id })
    await act(async () => { root.render(<MemoryRouter initialEntries={[path]}><PageView /></MemoryRouter>) })
    await settle(8)
  }

  it.each<[string, Role]>([['manager', 'manager'], ['sales', 'sales'], ['viewer', 'viewer']])('the list shows the admins-only state to a %s', async (_n, role) => {
    await setup(role)
    const api = fakeApi({})
    await visit('/sales/invoices', 'invoices')
    expect(text()).toContain('Invoices are for Ardorio admins')
    expect(text()).toContain('limited to admins')
    expect(api.calls).toEqual([]) // nothing was requested
  })

  it.each<[string, string, string]>([['the editor for a new invoice', '/sales/invoices/new', 'new'], ['an existing invoice', '/sales/invoices/i1', 'i1']])('%s is gated the same way', async (_n, path, id) => {
    await setup('manager')
    const api = fakeApi({})
    await visit(path, 'invoice', id)
    expect(text()).toContain('Invoices are for Ardorio admins')
    expect(api.calls).toEqual([])
  })

  it('in the Rosterio workspace, an Ardorio admin is offered the switch instead of Ardorio\'s invoices, and nothing is requested', async () => {
    await setup('admin', { ros: 'admin' })
    const { Act } = await import('../data/Act')
    Act.setSession({ ws: 'ros' })
    const api = fakeApi({})
    await visit('/sales/invoices', 'invoices')
    expect(text()).toContain("Invoices are Ardorio's")
    expect(api.calls).toEqual([])
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Switch to Ardorio')!.click() })
    expect(m.store.S.session.ws).toBe('ard')
  })

  it('an admin of Ardorio gets the page', async () => {
    await setup('admin')
    const api = fakeApi({ 'GET /sales/invoices': () => json(200, { invoices: [] }), 'GET /sales/invoices/summary': () => json(200, SUMMARY) })
    await visit('/sales/invoices', 'invoices')
    expect(text()).not.toContain('Invoices are for Ardorio admins')
    expect(text()).toContain('No invoices yet')
    expect(api.count('GET /sales/invoices')).toBe(1)
  })

  it('a super admin gets the page too', async () => {
    await setup('super')
    fakeApi({ 'GET /sales/invoices': () => json(200, { invoices: [] }), 'GET /sales/invoices/summary': () => json(200, SUMMARY) })
    await visit('/sales/invoices', 'invoices')
    expect(text()).toContain('No invoices yet')
  })
})

describe('routes', () => {
  it('maps the list, new and by-id addresses to the invoice pages', async () => {
    m = await loadSales()
    const r = await import('../routes')
    expect(r.pathToRoute('/sales/invoices', '')).toMatchObject({ page: 'invoices', known: true })
    expect(r.pathToRoute('/sales/invoices/new', '')).toMatchObject({ page: 'invoice', id: 'new', known: true })
    expect(r.pathToRoute('/sales/invoices/65f0a', '')).toMatchObject({ page: 'invoice', id: '65f0a', known: true })
    expect(r.routeToPath('invoices')).toBe('/sales/invoices')
    expect(r.routeToPath('invoice', { id: 'new' })).toBe('/sales/invoices/new')
    expect(r.routeToPath('invoice', { id: 'a b' })).toBe('/sales/invoices/a%20b')
    expect(r.navParent('invoice')).toBe('invoices')
  })

  it('both pages are registered and the two dialogs exist', async () => {
    m = await loadSales()
    const reg = await import('../registry')
    expect(reg.PAGES.invoices).toBeDefined()
    expect(reg.PAGES.invoice).toBeDefined()
    expect(reg.MODALS.markPaid).toBeDefined()
    expect(reg.MODALS.billingDetails).toBeDefined()
  })
})
