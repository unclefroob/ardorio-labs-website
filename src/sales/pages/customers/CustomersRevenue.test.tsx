import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { account, accountsOf, fakeApi, json, rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const flushAll = vi.fn(async () => true)
vi.mock('../../data/sync', async orig => ({ ...(await orig<typeof import('../../data/sync')>()), flushAll: () => flushAll(), pollOnce: vi.fn() }))

const ACCOUNTS = 'GET /sales/rosterio/accounts'

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
const rowNames = (): string[] => [...host.querySelectorAll('tbody tr')].map(r => r.querySelector('td b')?.textContent ?? '')
const trial = new Date(Date.now() + 9 * 86_400_000).toISOString()

const PRICED = accountsOf([
  account({ id: 'n1', name: 'Nova Freight', plan: 'pro', memberCount: 54, monthlyCost: null, pricingSource: null, billingQuantity: null }),
  account({ id: 'b1', name: 'Bayside Cafe', plan: 'starter', memberCount: 6, monthlyCost: 24, pricingSource: 'plan', billingQuantity: 6 }),
  account({ id: 'k1', name: 'Kestrel Logistics', plan: 'enterprise', memberCount: 340, monthlyCost: 4500, pricingSource: 'custom', billingQuantity: 340 }),
  account({ id: 't1', name: 'Trial Co', plan: 'pro', isTrial: true, trialEndDate: trial, memberCount: 9, monthlyCost: 99, pricingSource: 'plan', billingQuantity: 9 }),
  account({ id: 'c1', name: 'Closed Co', plan: 'pro', isActive: false, status: 'cancelled', memberCount: 0, monthlyCost: 77, pricingSource: 'plan', billingQuantity: 1 }),
])
const UNPRICED = accountsOf([
  account({ id: 'b1', name: 'Bayside Cafe', plan: 'starter', memberCount: 6 }),
  account({ id: 'k1', name: 'Kestrel Logistics', plan: 'enterprise', memberCount: 340 }),
])

async function show(accounts: ReturnType<typeof accountsOf>) {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, 'admin')
  fakeApi({ [ACCOUNTS]: json(200, accounts) })
  const { Customers } = await import('./Customers')
  await act(async () => { root.render(<Customers route={{ page: 'customers' } as never} />) })
  await settle(6)
}

describe('Customers page: Rosterio revenue', () => {
  it('shows monthly recurring revenue as the sum of the prices Rosterio returned, with a yearly line and how many had a price', async () => {
    await show(PRICED)
    expect(text()).toContain('Monthly recurring revenue')
    expect(text()).toContain('A$4,524')
    expect(text()).toContain('A$54,288 a year')
    expect(text()).toContain('2 of 3 paying accounts have a price')
  })

  it('leaves out the "x of y" line when every paying account has a price', async () => {
    await show(accountsOf([account({ id: 'b1', name: 'Bayside Cafe', monthlyCost: 24, pricingSource: 'plan', billingQuantity: 6 })]))
    expect(text()).toContain('A$24')
    expect(text()).not.toContain('have a price')
  })

  it('has no tile and no column when Rosterio sent no prices (a viewer, or a server that does not return them)', async () => {
    await show(UNPRICED)
    expect(text()).toContain('Paying customers')
    expect(text()).not.toContain('Monthly recurring revenue')
    expect(text()).not.toContain('Monthly revenue')
    expect(text()).not.toContain('A$')
    expect(host.querySelector('.g5')).toBeNull()
  })

  it('puts a Monthly revenue column on the Paid tab: price, seats, a custom-contract chip and a dash for no price', async () => {
    await show(PRICED)
    expect(text()).toContain('Monthly revenue')
    expect(text()).toContain('340 seats')
    expect(text()).toContain('6 seats')
    expect(text()).toContain('Custom contract')
    expect([...host.querySelectorAll('.chip')].filter(c => c.textContent === 'Custom contract')).toHaveLength(1)
    const dash = host.querySelector('[title="No price returned"]')
    expect(dash?.textContent).toBe('—')
  })

  it('opens sorted by revenue, highest first, with unpriced accounts last, and the header flips it', async () => {
    await show(PRICED)
    expect(rowNames()).toEqual(['Kestrel Logistics', 'Bayside Cafe', 'Nova Freight'])
    await click(button(host, /Monthly revenue/))
    expect(rowNames()).toEqual(['Nova Freight', 'Bayside Cafe', 'Kestrel Logistics'])
  })

  it('keeps the original order when no account has a price', async () => {
    await show(UNPRICED)
    expect(rowNames()).toEqual(['Bayside Cafe', 'Kestrel Logistics'])
  })

  it('shows no revenue on the Trials or Ended tabs, even if the server sent a price for those accounts', async () => {
    await show(PRICED)
    await click(button(host, /^Trials/))
    expect(text()).toContain('Trial Co')
    expect(text()).not.toContain('Monthly revenue')
    expect(text()).not.toContain('A$99')
    await click(button(host, /^Ended/))
    expect(text()).toContain('Closed Co')
    expect(text()).not.toContain('Monthly revenue')
    expect(text()).not.toContain('A$77')
  })

  it('totals only paying accounts, so a trial or ended price never reaches the tile', async () => {
    await show(PRICED)
    expect(text()).not.toContain('A$4,700')
    expect(text()).not.toContain('A$4,623')
  })
})

describe('Customers page: products with no account feed', () => {
  it('calls the figure Won value and says it is deal value, not recurring revenue', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld())
    setRole(m, 'sales', { pth: 'sales' })
    const S = m.store.S as unknown as { businesses: unknown[]; deals: unknown[]; companies: unknown[]; session: { ws: string } }
    S.businesses.push({ id: 'pth', name: 'PathIQ', short: 'PTH', accent: '#654321', currency: 'AUD' })
    S.companies.push({ id: 'sch1', name: 'Westfield Grammar', archived: false })
    S.deals.push({ id: 'w1', name: 'w1', title: 'Annual licence', businessId: 'pth', companyId: 'sch1', status: 'won', value: 24000, closedAt: '2026-09-03T00:00:00Z', stageChangedAt: '2026-09-03T00:00:00Z', ownerId: 'u-me' })
    S.session.ws = 'pth'
    m.store.reindex()
    fakeApi({ [ACCOUNTS]: json(200, UNPRICED) })
    const { Customers } = await import('./Customers')
    await act(async () => { root.render(<Customers route={{ page: 'customers' } as never} />) })
    await settle(6)
    expect(text()).toContain('Deal value, not recurring revenue')
    expect(text()).toContain('A$24,000')
    expect(text()).not.toContain('Total won value')
    expect(text()).not.toContain('Monthly recurring revenue')
    expect([...host.querySelectorAll('th')].map(h => h.textContent)).toContain('Won value')
  })
})
