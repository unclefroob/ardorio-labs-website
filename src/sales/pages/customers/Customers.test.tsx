import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { account, accountsOf, fakeApi, json, link, rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const flushAll = vi.fn(async () => true)
vi.mock('../../data/sync', async orig => ({ ...(await orig<typeof import('../../data/sync')>()), flushAll: () => flushAll(), pollOnce: vi.fn() }))

const ACCOUNTS = 'GET /sales/rosterio/accounts'
const LINK = 'POST /sales/rosterio/link'

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  getChanges.mockResolvedValue(changes([]))
  flushAll.mockReset()
  flushAll.mockResolvedValue(true)
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
const top = (): HTMLElement => [...host.querySelectorAll<HTMLElement>('[role="dialog"]')].pop() as HTMLElement

const world = {
  extraCompanies: {
    harbour: { name: 'Harbour Retail Group', domain: 'harbour.example' },
    kestrel: { name: 'Kestrel Logistics', domain: 'kestrel.example', rosterio: link({ accountId: 'k1', accountName: 'Kestrel Logistics' }) },
  },
}
const ACCOUNTS_OK = accountsOf([
  account({ id: 'k1', name: 'Kestrel Logistics', plan: 'enterprise', memberCount: 340, billingEmail: 'finance@kestrel.example' }),
  account({ id: 'h1', name: 'Harbour Retail Group', plan: 'starter', isTrial: true, trialEndDate: new Date(Date.now() + 4 * 86_400_000).toISOString(), memberCount: 9, billingEmail: 'ap@harbour.example' }),
  account({ id: 'b1', name: 'Bayside Cafe', plan: 'starter', memberCount: 6, billingEmail: 'owner@gmail.com' }),
  account({ id: 'c1', name: 'Closed Co', plan: 'pro', isActive: false, status: 'cancelled', memberCount: 0, billingEmail: 'x@closed.example' }),
])

async function show(routes: Parameters<typeof fakeApi>[0], role: Parameters<typeof setRole>[1] = 'sales', w: Parameters<typeof rosterioWorld>[0] = world, route: Record<string, unknown> = { page: 'customers' }) {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld(w))
  setRole(m, role)
  const api = fakeApi(routes)
  const { Customers } = await import('./Customers')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><Customers route={route as never} /><Hosts /></>) })
  await settle(6)
  return api
}
const tab = (name: RegExp) => click(button(host, name))
const modals = (): string[] => m.ui.UI.get().modals.map(x => x.name)

describe('Customers page: Rosterio, Paid tab', () => {
  it('opens on Paid with the summary and a linked or not-linked cell per account', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    expect(text()).toContain('Customers')
    expect(text()).toContain('Paying customers')
    expect(text()).toMatch(/Linked.*Kestrel Logistics/)
    expect(text()).toContain('Bayside Cafe')
    expect(text()).toMatch(/Not linked/)
    expect(text()).toContain('admins only')
    expect(text()).toContain('finance@kestrel.example')
    expect(text()).toContain('of 2 paying')
    expect(text()).not.toContain('Harbour Retail Group')
    expect(text()).not.toContain('Closed Co')
  })

  it('hides the billing email column when the server did not send emails', async () => {
    await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'k1', name: 'Kestrel Logistics' })])) })
    expect(text()).not.toContain('Billing email')
  })

  it('counts the tabs: Paid, Trials, Ended and Needs linking', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    const tabs = [...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)
    expect(tabs).toEqual(['Paid2', 'Trials1', 'Ended1', 'Needs linking3'])
  })

  it('filters by plan and search, and offers Clear filters when nothing is left', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await click(button(host, 'Enterprise'))
    expect(text()).toContain('Kestrel Logistics')
    expect(text()).not.toContain('Bayside Cafe')
    await click(button(host, 'Starter'))
    await type(host.querySelector('input[aria-label="Search accounts"]'), 'zzz')
    expect(text()).toContain('No accounts match these filters')
    await click(button(host, 'Clear filters'))
    expect(text()).toContain('Kestrel Logistics')
    expect(text()).toContain('Bayside Cafe')
  })

  it('the small Link button on an unlinked paid account opens the dialog', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await click(button(host, 'Link'))
    await settle()
    expect(modals()).toEqual(['linkRosterio'])
    expect(top().textContent).toContain('Link Bayside Cafe to a CRM company')
  })

  it('says how many accounts were listed when Rosterio had more', async () => {
    await show({ [ACCOUNTS]: json(200, { ...ACCOUNTS_OK, truncated: true }) })
    expect(text()).toContain('Rosterio listed its newest 4 accounts')
  })

  it('a viewer sees the list but the Link button is off', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) }, 'viewer')
    expect(button(host, 'Link')?.disabled).toBe(true)
  })
})

describe('Customers page: Rosterio, other tabs', () => {
  it('Trials sorts by days left, warns about trials ending this week and offers a follow-up task', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await tab(/^Trials/)
    expect(text()).toContain('1 trial ends within 7 days')
    expect(text()).toContain('Harbour Retail Group')
    expect(text()).toContain('4 days')
    expect(text()).not.toContain('Kestrel Logistics')
    await click(button(host, 'Create follow-up task'))
    const open = m.ui.UI.get().modals.at(-1)
    expect(open?.name).toBe('newTask')
    expect(open?.props).toMatchObject({ businessId: 'ros', title: 'Follow up the Rosterio trial for Harbour Retail Group' })
  })

  it('Ended lists cancelled accounts and ended trials with their status', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await tab(/^Ended/)
    expect(text()).toContain('Closed Co')
    expect(text()).toContain('Cancelled')
    expect(text()).not.toContain('Bayside Cafe')
  })

  it('Needs linking holds every unlinked account whatever its status, with the three kinds of CRM cell', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await tab(/^Needs linking/)
    expect(text()).toContain('3 accounts of any status have no CRM company')
    expect(text()).toContain('Possible match: Harbour Retail Group')
    expect(text()).toContain('Same email domain as the company website')
    expect(text()).toContain('Personal email address, and no similar company name')
    expect(text()).toContain('Closed Co')
    expect(text()).not.toContain('Kestrel Logistics')
    expect(button(host, 'Create company')).toBeDefined()
  })

  it('an empty tab says so', async () => {
    await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'k1', name: 'Kestrel Logistics' })])) }, 'sales', { extraCompanies: { kestrel: { name: 'Kestrel Logistics', rosterio: link({ accountId: 'k1' }) } } })
    await tab(/^Trials/)
    expect(text()).toContain('No accounts on trial')
    await tab(/^Needs linking/)
    expect(text()).toContain('Every account is linked')
  })

  it('Not it removes the suggestion and keeps the way to link by hand', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await tab(/^Needs linking/)
    await click(button(host, 'Not it'))
    expect(text()).not.toContain('Possible match: Harbour Retail Group')
    expect(button(host, 'Link to existing…')).toBeDefined()
  })

  it('Link opens the dialog with both sides and links only on the final click', async () => {
    const api = await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK), [LINK]: json(200, { link: link({ accountId: 'h1', accountName: 'Harbour Retail Group' }) }) })
    await tab(/^Needs linking/)
    await click(button(host, 'Link'))
    await settle()
    expect(top().textContent).toContain('Link Harbour Retail Group to a CRM company')
    expect(top().textContent).toContain('Why this match')
    expect(api.count(LINK)).toBe(0)
    await click(button(top(), 'Link company'))
    await settle(6)
    expect(api.calls.find(c => c.path === '/sales/rosterio/link')?.body).toEqual({ companyId: 'harbour', accountId: 'h1' })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows "not synced yet" in the dialog and keeps it open when the company has not synced', async () => {
    flushAll.mockResolvedValue(false)
    const api = await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK), [LINK]: json(200, { link: link() }) })
    await tab(/^Needs linking/)
    await click(button(host, 'Link'))
    await click(button(top(), 'Link company'))
    await settle(4)
    expect(top().textContent).toContain('Saved here, not synced yet. Retry')
    expect(api.count(LINK)).toBe(0)
  })

  it('Link to existing… needs a company chosen before the button works', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await tab(/^Needs linking/)
    await click([...host.querySelectorAll('button')].filter(b => b.textContent === 'Link to existing…')[0])
    await settle()
    expect(button(top(), 'Link company')?.disabled).toBe(true)
    await type(top().querySelector('input'), 'harb')
    await click(button(top(), 'Harbour Retail Group'))
    expect(button(top(), 'Link company')?.disabled).toBe(false)
  })

  it('Create company makes the company, then links it, and says what it did', async () => {
    const api = await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK), [LINK]: json(200, { link: link({ accountId: 'b1', accountName: 'Bayside Cafe' }) }) })
    await tab(/^Needs linking/)
    const before = m.store.S.companies.length
    await click([...host.querySelectorAll('button')].filter(b => b.textContent === 'Create company')[0])
    await settle(6)
    expect(m.store.S.companies.length).toBe(before + 1)
    expect(api.calls.find(c => c.path === '/sales/rosterio/link')?.body).toMatchObject({ accountId: 'b1' })
  })

  it('a viewer cannot create or link', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) }, 'viewer')
    await tab(/^Needs linking/)
    expect(button(host, 'Create company')?.disabled).toBe(true)
    expect(button(host, 'Link')?.disabled).toBe(true)
  })
})

describe('Customers page: the other states', () => {
  it('not set up points at Integrations and has no refresh', async () => {
    await show({ [ACCOUNTS]: json(503, { error: 'x', code: 'NOT_CONFIGURED' }) })
    expect(text()).toContain("Rosterio isn't connected yet")
    expect(button(host, 'Open Integrations')).toBeDefined()
    expect(button(host, 'Refresh')).toBeUndefined()
  })

  it('unreachable shows the banner and Try again reads again', async () => {
    let calls = 0
    await show({ [ACCOUNTS]: () => (++calls > 1 ? json(200, ACCOUNTS_OK) : json(502, { error: 'Rosterio is down', code: 'UPSTREAM_ERROR' })) })
    expect(text()).toContain("Couldn't load accounts from Rosterio")
    await click(button(host, 'Try again'))
    await settle(6)
    expect(text()).not.toContain("Couldn't load accounts")
    expect(text()).toContain('Kestrel Logistics')
  })

  it('connected with no accounts says so', async () => {
    await show({ [ACCOUNTS]: json(200, accountsOf([])) })
    expect(text()).toContain('No Rosterio accounts yet')
  })

  it('shows a loading state before the answer arrives', async () => {
    let release: (r: Response) => void = () => undefined
    const pending = new Promise<Response>(r => { release = r })
    await show({ [ACCOUNTS]: () => pending })
    expect(text()).toContain('Reading accounts from Rosterio')
    await act(async () => { release(json(200, accountsOf([account()]))) })
    await settle(4)
    expect(text()).not.toContain('Reading accounts from Rosterio')
  })
})

describe('Customers page: the product toggle and products with no feed', () => {
  async function twoProducts(role: Parameters<typeof setRole>[1], others: Parameters<typeof setRole>[2], ws: string, route: Record<string, unknown> = { page: 'customers' }) {
    m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld())
    setRole(m, role, others)
    const S = m.store.S as unknown as { businesses: unknown[]; deals: unknown[]; companies: unknown[]; session: { ws: string } }
    S.businesses.push({ id: 'pth', name: 'PathIQ', short: 'PTH', accent: '#654321', currency: 'AUD' })
    S.companies.push({ id: 'sch1', name: 'Westfield Grammar', archived: false }, { id: 'sch2', name: 'Gone School', archived: true })
    const won = (id: string, companyId: string, value: number, closedAt: string, businessId = 'pth', status = 'won') => ({ id, name: id, title: id, businessId, companyId, status, value, closedAt, stageChangedAt: closedAt, ownerId: 'u-me' })
    S.deals.push(won('w1', 'sch1', 24000, '2026-09-03T00:00:00Z'), won('w2', 'sch1', 1000, '2026-06-01T00:00:00Z'), won('w3', 'sch2', 5000, '2026-09-04T00:00:00Z'), won('w4', 'sch1', 7000, '2026-09-05T00:00:00Z', 'ros'), won('w5', 'sch1', 9000, '2026-09-06T00:00:00Z', 'pth', 'open'))
    S.session.ws = ws
    m.store.reindex()
    const api = fakeApi({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    const { Customers } = await import('./Customers')
    await act(async () => { root.render(<Customers route={route as never} />) })
    await settle(6)
    return api
  }

  it('lists only the products the viewer belongs to', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    const seg = [...host.querySelectorAll('.seg button')].map(b => b.textContent)
    expect(seg.some(x => x?.startsWith('Rosterio'))).toBe(true)
    expect(seg.some(x => x?.startsWith('PathIQ'))).toBe(false)
  })

  it('opens on the workspace the viewer is in, and lists companies with a won deal', async () => {
    const api = await twoProducts('sales', { pth: 'sales' }, 'pth')
    expect(text()).toContain('Westfield Grammar')
    expect(text()).not.toContain('Gone School')
    expect(text()).toContain('+1 more')
    expect(text()).toContain('There is no PathIQ account feed yet')
    expect(text()).toContain('Total won value')
    expect(api.count(ACCOUNTS)).toBe(0)
  })

  it('switching to Rosterio reads the live list and puts the paying count on the toggle', async () => {
    const api = await twoProducts('sales', { pth: 'sales' }, 'pth')
    await click(button(host, /^Rosterio/))
    await settle(6)
    expect(api.count(ACCOUNTS)).toBe(1)
    expect(text()).toContain('Paying customers')
    expect(button(host, /^Rosterio 2/)).toBeDefined()
    expect(button(host, /^PathIQ 1/)).toBeDefined()
  })

  it('an explicit product in the route wins over the workspace', async () => {
    await twoProducts('sales', { pth: 'sales' }, 'pth', { page: 'customers', q: { product: 'ros', tab: 'trials' } })
    expect(text()).toContain('Paying customers')
    expect(text()).toContain('Harbour Retail Group')
  })

  it('a product with no won deals shows an empty state with a way to Deals', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld())
    setRole(m, null, { pth: 'sales' })
    ;(m.store.S as unknown as { businesses: unknown[] }).businesses.push({ id: 'pth', name: 'PathIQ', short: 'PTH', accent: '#654321', currency: 'AUD' })
    m.store.reindex()
    fakeApi({})
    const { Customers } = await import('./Customers')
    await act(async () => { root.render(<Customers route={{ page: 'customers' }} />) })
    await settle(4)
    expect(text()).toContain('No won deals yet')
    expect(button(host, 'Go to Deals')).toBeDefined()
  })

  it('a viewer who is not in Rosterio never triggers the Rosterio read', async () => {
    const api = await twoProducts(null, { pth: 'sales' }, 'all')
    expect(api.count(ACCOUNTS)).toBe(0)
    expect(text()).toContain('Westfield Grammar')
    expect([...host.querySelectorAll('.seg button')].some(b => b.textContent?.startsWith('Rosterio'))).toBe(false)
  })
})

describe('the nav item and the old address', () => {
  async function sidebar(role: Parameters<typeof setRole>[1], others: Parameters<typeof setRole>[2] = {}): Promise<string> {
    m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld())
    setRole(m, role, others)
    fakeApi({})
    const { MemoryRouter } = await import('react-router-dom')
    const { Sidebar } = await import('../../shell/Sidebar')
    await act(async () => { root.render(<MemoryRouter><Sidebar /></MemoryRouter>) })
    await settle(3)
    return text()
  }
  it('shows Customers to a member of any business, not only Rosterio, with no count', async () => {
    expect(await sidebar('sales')).toContain('Customers')
    act(() => root.unmount())
    root = createRoot(host)
    const t = await sidebar(null, { pth: 'sales' })
    expect(t).toContain('Customers')
    expect(t).not.toMatch(/Customers\d/)
  })

  it('is in Revenue after Deals and is not tied to one business', async () => {
    m = await loadSales()
    const nav = await import('../../shell/nav')
    const rev = nav.NAV.find(g => g.group === 'Revenue')
    expect(rev?.items.map(i => i.page).slice(0, 2)).toEqual(['deals', 'customers'])
    expect(nav.BUSINESS_PAGES.customers).toBeUndefined()
  })

  it('the old Rosterio customers address and page key still open the page', async () => {
    m = await loadSales()
    const routes = await import('../../routes')
    expect(routes.pathToRoute('/sales/rosterio-customers', '')).toMatchObject({ page: 'customers', q: { product: 'ros' }, known: true })
    expect(routes.pathToRoute('/sales/customers', '')).toMatchObject({ page: 'customers', known: true })
    expect(routes.routeToPath('rosterioCustomers')).toBe('/sales/customers')
    const { u2 } = await import('../../units/u2')
    expect(u2.pages.rosterioCustomers).toBe(u2.pages.customers)
  })
})
