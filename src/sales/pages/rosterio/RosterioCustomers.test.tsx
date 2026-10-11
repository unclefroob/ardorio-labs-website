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

async function show(routes: Parameters<typeof fakeApi>[0], role: Parameters<typeof setRole>[1] = 'sales', w: Parameters<typeof rosterioWorld>[0] = world) {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld(w))
  setRole(m, role)
  const api = fakeApi(routes)
  const { RosterioCustomers } = await import('./RosterioCustomers')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><RosterioCustomers /><Hosts /></>) })
  await settle(6)
  return api
}

describe('Rosterio customers page', () => {
  it('shows the summary, the filters and the three kinds of CRM cell', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    expect(text()).toContain('Rosterio customers')
    expect(text()).toContain('Live accounts')
    expect(text()).toContain('1 end within 7 days')
    expect(text()).toContain('3 not linked')
    expect(text()).toMatch(/Linked.*Kestrel Logistics/)
    expect(text()).toContain('Possible match: Harbour Retail Group')
    expect(text()).toContain('Same email domain as the company website')
    expect(text()).toContain('Personal email address, and no similar company name')
    expect(button(host, 'Create company')).toBeDefined()
    expect(text()).toContain('Lead pushes paused for this company')
    expect(text()).toContain('Trial · 4 days left')
    expect(text()).toContain('admins only')
  })

  it('hides the billing email column when the server did not send emails', async () => {
    await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'k1', name: 'Kestrel Logistics' })])) })
    expect(text()).not.toContain('Billing email')
  })

  it('filters by link state and status, and offers Clear filters when nothing is left', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await click(button(host, /^Not linked/))
    expect(text()).not.toContain('Possible match: Kestrel')
    expect(text()).toContain('Bayside Cafe')
    await click(button(host, /^Linked/))
    await click(button(host, /^Cancelled/))
    expect(text()).toContain('No accounts match these filters')
    await click(button(host, 'Clear filters'))
    expect(text()).toContain('Kestrel Logistics')
  })

  it('searches by account name', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await type(host.querySelector('input[aria-label="Search accounts"]'), 'bayside')
    expect(text()).toContain('Bayside Cafe')
    expect(text()).not.toContain('Closed Co')
  })

  it('Not it removes the suggestion and keeps the way to link by hand', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    await click(button(host, 'Not it'))
    expect(text()).not.toContain('Possible match: Harbour Retail Group')
    expect(text()).toContain('No match found')
    expect(button(host, 'Link to existing…')).toBeDefined()
  })

  it('Link opens the dialog with both sides and links only on the final click', async () => {
    const api = await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK), [LINK]: json(200, { link: link({ accountId: 'h1', accountName: 'Harbour Retail Group' }) }) })
    await click(button(host, 'Link'))
    await settle()
    expect(top().textContent).toContain('Link Harbour Retail Group to a CRM company')
    expect(top().textContent).toContain('Why this match')
    expect(top().textContent).toContain('What linking does')
    expect(api.count(LINK)).toBe(0)
    await click(button(top(), 'Link company'))
    await settle(6)
    expect(api.calls.find(c => c.path === '/sales/rosterio/link')?.body).toEqual({ companyId: 'harbour', accountId: 'h1' })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(text()).toMatch(/Linked.*Harbour Retail Group/)
  })

  it('shows "not synced yet" in the dialog and keeps it open when the company has not synced', async () => {
    flushAll.mockResolvedValue(false)
    const api = await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK), [LINK]: json(200, { link: link() }) })
    await click(button(host, 'Link'))
    await click(button(top(), 'Link company'))
    await settle(4)
    expect(top().textContent).toContain('Saved here, not synced yet. Retry')
    expect(api.count(LINK)).toBe(0)
  })

  it('Link to existing… needs a company chosen before the button works', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    const create = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Link to existing…')
    await click(create[0])
    await settle()
    expect(button(top(), 'Link company')?.disabled).toBe(true)
    await type(top().querySelector('input'), 'harb')
    await click(button(top(), 'Harbour Retail Group'))
    expect(button(top(), 'Link company')?.disabled).toBe(false)
  })

  it('Create company makes the company, then links it, and says what it did', async () => {
    const api = await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK), [LINK]: json(200, { link: link({ accountId: 'b1', accountName: 'Bayside Cafe' }) }) })
    const before = m.store.S.companies.length
    await click(button(host, 'Create company'))
    await settle(6)
    expect(m.store.S.companies.length).toBe(before + 1)
    expect(m.store.S.companies.find(c => c.name === 'Bayside Cafe')).toMatchObject({ source: 'Rosterio customer', website: '' })
    expect(api.calls.find(c => c.path === '/sales/rosterio/link')?.body).toMatchObject({ accountId: 'b1' })
  })

  it('a viewer sees the list but the actions are off', async () => {
    await show({ [ACCOUNTS]: json(200, ACCOUNTS_OK) }, 'viewer')
    expect(button(host, 'Create company')?.disabled).toBe(true)
    expect(button(host, 'Link')?.disabled).toBe(true)
  })

  it('says how many accounts were listed when Rosterio had more', async () => {
    await show({ [ACCOUNTS]: json(200, { ...ACCOUNTS_OK, truncated: true }) })
    expect(text()).toContain('Rosterio listed its newest 4 accounts')
  })
})

describe('Rosterio customers page: the other states', () => {
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

describe('the nav item and page gate', () => {
  async function sidebar(role: Parameters<typeof setRole>[1]): Promise<string> {
    m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld())
    setRole(m, role)
    fakeApi({})
    const { MemoryRouter } = await import('react-router-dom')
    const { Sidebar } = await import('../../shell/Sidebar')
    await act(async () => { root.render(<MemoryRouter><Sidebar /></MemoryRouter>) })
    await settle(3)
    return text()
  }
  it('shows in the menu to a Rosterio member and not to anyone else', async () => {
    expect(await sidebar('sales')).toContain('Rosterio customers')
    act(() => root.unmount())
    root = createRoot(host)
    expect(await sidebar(null)).not.toContain('Rosterio customers')
  })

  it('is in Revenue after Deals and only for members of Rosterio', async () => {
    m = await loadSales()
    const nav = await import('../../shell/nav')
    const rev = nav.NAV.find(g => g.group === 'Revenue')
    expect(rev?.items.map(i => i.page).slice(0, 2)).toEqual(['deals', 'rosterioCustomers'])
    expect(nav.BUSINESS_PAGES.rosterioCustomers).toBe('ros')
  })

  it('a non-member is told they do not have access instead of seeing the page', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld())
    setRole(m, null)
    fakeApi({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    const { MemoryRouter } = await import('react-router-dom')
    const { PageView } = await import('../../shell/PageView')
    await act(async () => { m.ui.UI.setRoute({ page: 'rosterioCustomers' }) })
    await act(async () => { root.render(<MemoryRouter initialEntries={['/sales/rosterio-customers']}><PageView /></MemoryRouter>) })
    await settle(5)
    expect(text()).toContain("You don't have access")
    expect(text()).toContain('members of Rosterio')
  })
})
