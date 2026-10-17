import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { account, accountsOf, fakeApi, invoice, json, rosterioWorld, setRole } from '../../testing/rosterioWorld'

// Customers › Rosterio for a Rosterio admin: a way into each account, and where its Stripe billing stands.

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../data/sync', async orig => ({ ...(await orig<typeof import('../../data/sync')>()), flushAll: async () => true, pollOnce: vi.fn() }))

const ACCOUNTS = 'GET /sales/rosterio/accounts'
const INVOICES = 'GET /sales/rosterio/invoices'

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  getChanges.mockResolvedValue(changes([]))
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
const row = (name: string): Element | undefined => [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes(name))

const managed = { pricingSource: 'custom' as const, monthlyCost: 400 }
// Built per test: a reply is read once.
const list = () => accountsOf([
  account({ id: 'a1', name: 'Kestrel Logistics', ...managed, billingState: null }),
  account({ id: 'a2', name: 'Spuntino Group', ...managed, billingState: 'stopped' }),
  account({ id: 'a3', name: 'Harbour Retail', ...managed, billingState: 'scheduled' }),
  account({ id: 'a4', name: 'Bayside Cafe', ...managed, billingState: 'awaiting_card' }),
  account({ id: 'a5', name: 'Northern Freight', ...managed, billingState: 'active' }),
  account({ id: 'a6', name: 'Westside Bakery', ...managed, billingState: 'stopping' }),
  account({ id: 'a7', name: 'Corner Store', pricingSource: 'plan', monthlyCost: 99, billingState: null }),
  account({ id: 'a8', name: 'Failing Pty Ltd', ...managed, billingState: 'active' }),
  account({ id: 'a9', name: 'Trial Co', isTrial: true, trialEndDate: new Date(Date.now() + 5 * 86_400_000).toISOString(), pricingSource: null, billingState: null }),
])
const invoices = () => ({ configured: true, syncedAt: null, syncError: null, invoices: [invoice({ id: 'in_f', accountId: 'a8', status: 'open', failed: true, amountRemainingCents: 44000 }), invoice({ id: 'in_ok', accountId: 'a5' })] })

async function show(routes: Parameters<typeof fakeApi>[0], role: Parameters<typeof setRole>[1] = 'admin') {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, role)
  const nav: string[] = []
  m.ui.bindNavigate(to => { if (typeof to === 'string') nav.push(to) })
  const api = fakeApi(routes)
  const { Customers } = await import('../customers/Customers')
  await act(async () => { root.render(<Customers route={{ page: 'customers', q: { product: 'ros' } } as never} />) })
  await settle(8)
  return { api, nav }
}

describe('Customers › Rosterio: Billing column (Rosterio admins)', () => {
  it('says where each paying account\'s billing stands', async () => {
    await show({ [ACCOUNTS]: json(200, list()), [INVOICES]: json(200, invoices()) })
    expect([...host.querySelectorAll('thead th')].map(h => h.textContent)).toContain('Billing')
    const cell = (name: string): string => row(name)?.textContent ?? ''
    expect(cell('Kestrel Logistics')).toContain('Not billed yet')
    expect(cell('Spuntino Group')).toContain('Not billed yet')
    expect(cell('Harbour Retail')).toContain('Scheduled')
    expect(cell('Bayside Cafe')).toContain('Waiting for a card')
    expect(cell('Northern Freight')).toContain('Billing')
    expect(cell('Westside Bakery')).toContain('Ending')
    expect(cell('Corner Store')).toContain('Paid · checkout')
    // A failed invoice outranks a running subscription.
    expect(cell('Failing Pty Ltd')).toContain('Payment failed')
    expect(cell('Failing Pty Ltd')).not.toContain('Billing')
  })

  it('the filter chips count the accounts and narrow the list', async () => {
    await show({ [ACCOUNTS]: json(200, list()), [INVOICES]: json(200, invoices()) })
    const chips = (): string[] => [...host.querySelectorAll('.seg[aria-label="Billing"] button')].map(b => b.textContent ?? '')
    expect(chips()).toEqual(['All', 'Not billed in Stripe (2)', 'Payment failed (1)', 'Self-serve (1)'])

    await click(button(host, /^Not billed in Stripe/))
    expect(row('Kestrel Logistics')).toBeDefined()
    expect(row('Spuntino Group')).toBeDefined()
    expect(row('Harbour Retail')).toBeUndefined()

    await click(button(host, /^Payment failed/))
    expect(row('Failing Pty Ltd')).toBeDefined()
    expect(row('Kestrel Logistics')).toBeUndefined()

    await click(button(host, /^Self-serve/))
    expect(row('Corner Store')).toBeDefined()
    expect(row('Failing Pty Ltd')).toBeUndefined()

    await click(button(host, /^All$/))
    expect(row('Failing Pty Ltd')).toBeDefined()
  })

  it('still lists accounts when Stripe invoices cannot be read: a banner, and no made-up count', async () => {
    const { api } = await show({ [ACCOUNTS]: json(200, list()), [INVOICES]: () => json(502, { error: 'Stripe is down', code: 'UPSTREAM_ERROR' }) })
    expect(row('Failing Pty Ltd')?.textContent).toContain('Billing')
    expect(text()).toContain('Could not read Stripe invoices; payment failures are not shown')
    expect(text()).not.toContain('Payment failed (')
    expect(button(host, /^Payment failed$/)).toBeDefined()
    expect(api.count(INVOICES)).toBe(1)
  })

  it('while the invoices are loading the Payment failed count is a placeholder, not 0', async () => {
    let release: (r: Response) => void = () => undefined
    const pending = new Promise<Response>(r => { release = r })
    await show({ [ACCOUNTS]: json(200, list()), [INVOICES]: () => pending })
    expect(text()).toContain('Payment failed (…)')
    expect(text()).not.toContain('Payment failed (0)')
    await act(async () => { release(json(200, invoices())) })
    await settle(4)
    expect(text()).toContain('Payment failed (1)')
  })

  it('asks for the invoices once, and an account the list gave no billing state for still shows', async () => {
    const accounts = accountsOf([account({ id: 'a1', name: 'No State Co', pricingSource: 'custom' })])
    const { api } = await show({ [ACCOUNTS]: json(200, accounts), [INVOICES]: () => json(200, invoices()) })
    expect(api.count(INVOICES)).toBe(1)
    expect(row('No State Co')?.textContent).toContain('Not billed yet')
  })

  it('a salesperson sees no Billing column or filter, and invoices are not asked for', async () => {
    const { api } = await show({ [ACCOUNTS]: json(200, accountsOf(list().accounts.map(({ pricingSource, monthlyCost, billingState, ...a }) => { void pricingSource; void monthlyCost; void billingState; return a }))) }, 'sales')
    expect([...host.querySelectorAll('thead th')].map(h => h.textContent)).not.toContain('Billing')
    expect(text()).not.toContain('Not billed in Stripe')
    expect(api.calls.some(c => c.path.startsWith('/sales/rosterio/invoices'))).toBe(false)
    expect(host.querySelector('a[href^="/sales/rosterio-accounts/"]')).toBeNull()
    expect(button(host, /^Open/)).toBeUndefined()
  })
})

describe('Customers › Rosterio: into the account page', () => {
  it('the account name is a link to its page, remembering that you came from Customers', async () => {
    await show({ [ACCOUNTS]: json(200, list()), [INVOICES]: json(200, invoices()) })
    const a = [...row('Kestrel Logistics')!.querySelectorAll('a')].find(x => x.textContent === 'Kestrel Logistics')!
    const url = new URL(a.getAttribute('href')!, 'https://app.test')
    expect(url.pathname).toBe('/sales/rosterio-accounts/a1')
    expect(JSON.parse(url.searchParams.get('q')!)).toEqual({ from: 'customers' })
  })

  it('each row has an Open action that goes to the page', async () => {
    const { nav } = await show({ [ACCOUNTS]: json(200, list()), [INVOICES]: json(200, invoices()) })
    await click(button(row('Spuntino Group')!, /Open/))
    expect(nav).toHaveLength(1)
    expect(nav[0].startsWith('/sales/rosterio-accounts/a2?q=')).toBe(true)
  })

  it('Trials and Ended rows can be opened too', async () => {
    const { nav } = await show({ [ACCOUNTS]: json(200, list()), [INVOICES]: json(200, invoices()) })
    await click(button(host, /^Trials/))
    await click(button(row('Trial Co')!, /Open/))
    expect(nav[0].startsWith('/sales/rosterio-accounts/a9?q=')).toBe(true)
  })
})
