import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterioTestAccount } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { account, accountsOf, fakeApi, json, link, rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../data/sync', async orig => ({ ...(await orig<typeof import('../../data/sync')>()), flushAll: vi.fn(async () => true), pollOnce: vi.fn() }))

const ACCOUNTS = 'GET /sales/rosterio/accounts'

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
const world = {
  extraCompanies: {
    harbour: { name: 'Harbour Retail Group', domain: 'harbour.example' },
    kestrel: { name: 'Kestrel Logistics', domain: 'kestrel.example', rosterio: link({ accountId: 'k1', accountName: 'Kestrel Logistics' }) },
  },
}
// Kestrel and the Apple review account are paying; Apple is the one to mark as a test account.
const ACCOUNTS_OK = accountsOf([
  account({ id: 'k1', name: 'Kestrel Logistics', plan: 'enterprise', memberCount: 340, billingEmail: 'finance@kestrel.example', monthlyCost: 1000 }),
  account({ id: 'ap1', name: 'Apple Test Account', plan: 'pro', memberCount: 3, billingEmail: 'review@apple.example', monthlyCost: 79 }),
  account({ id: 'h1', name: 'Harbour Retail Group', plan: 'starter', isTrial: true, trialEndDate: new Date(Date.now() + 4 * 86_400_000).toISOString(), memberCount: 9 }),
  account({ id: 'c1', name: 'Closed Co', plan: 'pro', isActive: false, status: 'cancelled', memberCount: 0 }),
])
const marked = (o: Partial<RosterioTestAccount> = {}): RosterioTestAccount =>
  ({ accountId: 'ap1', name: 'Apple Test Account', reason: 'App Store review account', markedBy: 'Sam Lee', markedAt: '2026-10-02T03:00:00.000Z', ...o })

type Who = Parameters<typeof setRole>[1]
async function show(role: Who = 'admin', tests: RosterioTestAccount[] = [], others: Parameters<typeof setRole>[2] = {}, route: Record<string, unknown> = { page: 'customers' }) {
  m = await loadSales()
  const b = rosterioWorld(world)
  if (tests.length) b.collections.settings.push(rec('rosterioTest', { accounts: tests }, 2))
  m.bootstrap.hydrate(b)
  setRole(m, role, others)
  fakeApi({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
  const { Customers } = await import('./Customers')
  await act(async () => { root.render(<Customers route={route as never} />) })
  await settle(6)
}

const tabs = (): Array<string | null> => [...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)
const tile = (label: string): string => [...host.querySelectorAll('.kpi')].find(k => k.querySelector('.l')?.textContent === label)?.textContent ?? ''
const confirmBox = (): HTMLElement | null => host.querySelector('[role="group"][aria-label="Mark as test account"], [role="group"][aria-label="Not a test account"]')
const markApple = async (reason?: string): Promise<void> => {
  await click(host.querySelector('[aria-label="More for Apple Test Account"]'))
  await click(button(host, 'Mark as test account'))
  if (reason !== undefined) await type(confirmBox()?.querySelector('input') ?? null, reason)
}
const confirmBtn = (): HTMLButtonElement | undefined => button(confirmBox() as HTMLElement, /^(Mark as test account|Not a test account)$/)

describe('Customers page: marking a Rosterio test account', () => {
  it('a ros admin marks an account: it leaves Paid for Test accounts and every figure drops it', async () => {
    await show('admin')
    expect(tabs()).toEqual(['Paid2', 'Trials1', 'Ended1', 'Needs linking3'])
    expect(tile('Paying customers')).toContain('2')
    expect(tile('Monthly recurring revenue')).toContain('$1,079')
    expect(tile('Active users across them')).toContain('343')
    expect(text()).not.toContain('left out of these figures')

    await click(host.querySelector('[aria-label="More for Apple Test Account"]'))
    await click(button(host, 'Mark as test account'))
    const box = confirmBox()
    expect(box?.textContent).toContain('The account stays in Rosterio unchanged. SalesOS only leaves it out of customer counts and revenue')
    expect((box?.querySelector('input') as HTMLInputElement).value).toBe('App Store review account')
    expect(m.ui.UI.get().modals).toEqual([])
    await click(confirmBtn())
    await settle()

    expect(tabs()).toEqual(['Paid1', 'Trials1', 'Ended1', 'Test accounts1', 'Needs linking2'])
    expect(tile('Paying customers')).toContain('1')
    expect(tile('Monthly recurring revenue')).toContain('$1,000')
    expect(tile('Monthly recurring revenue')).toContain('$12,000 a year')
    expect(tile('Active users across them')).toContain('340')
    expect(tile('By plan')).not.toContain('Pro')
    expect(tile('Linked to a CRM company')).toContain('of 1 paying')
    expect(text()).toContain('1 test account left out of these figures')
    expect([...host.querySelectorAll('tbody tr')].some(r => r.textContent?.includes('Apple Test Account'))).toBe(false)

    // The record written: the whole list, one entry with the reason, the name when marked, and local stamps the server replaces.
    const op = m.plan.collectPlan().find(p => p.c === 'settings' && p.id === 'rosterioTest')?.op as unknown as { set: { accounts: RosterioTestAccount[] } }
    expect(op.set.accounts).toEqual([{ accountId: 'ap1', name: 'Apple Test Account', reason: 'App Store review account', markedBy: 'Me Myself', markedAt: expect.any(String) }])
  })

  it('the Test accounts tab lists it with its real standing, reason and who marked it, and the faint line leads there', async () => {
    await show('admin', [marked()])
    await click([...host.querySelectorAll('a')].find(a => a.textContent?.includes('left out of these figures')))
    await settle()
    const row = [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes('Apple Test Account'))
    expect(row?.textContent).toContain('review@apple.example')
    expect(row?.textContent).toContain('Pro')
    expect(row?.textContent).toContain('Paid')
    expect(row?.textContent).toContain('App Store review account')
    expect(row?.textContent).toContain('Sam Lee')
    expect(button(row as HTMLElement, 'Not a test account')?.disabled).toBe(false)
  })

  it('un-marking asks in the page, then puts it back on Paid and into every figure', async () => {
    await show('admin', [marked()], {}, { page: 'customers', q: { tab: 'test' } })
    expect(tile('Paying customers')).toContain('1')
    await click(button(host, 'Not a test account'))
    expect(confirmBox()?.textContent).toContain('It goes back on the tab its Rosterio status puts it on')
    expect(confirmBox()?.textContent).toContain('Nothing changes in Rosterio')
    await click(confirmBtn())
    await settle()
    expect(tabs()).toEqual(['Paid2', 'Trials1', 'Ended1', 'Test accounts0', 'Needs linking3'])
    expect(tile('Paying customers')).toContain('2')
    expect(tile('Monthly recurring revenue')).toContain('$1,079')
    expect(text()).not.toContain('left out of these figures')
    const op = m.plan.collectPlan().find(p => p.c === 'settings' && p.id === 'rosterioTest')?.op as unknown as { set: { accounts: unknown[] }; baseRev: number }
    expect(op).toMatchObject({ baseRev: 2, set: { accounts: [] } })
    // Leaving the empty tab hides it.
    await click(button(host, /^Paid/))
    expect(tabs()).toEqual(['Paid2', 'Trials1', 'Ended1', 'Needs linking3'])
  })

  it('Cancel closes the confirmation and changes nothing', async () => {
    await show('super')
    await click(host.querySelector('[aria-label="More for Apple Test Account"]'))
    await click(button(host, 'Mark as test account'))
    await click(button(confirmBox() as HTMLElement, 'Cancel'))
    expect(confirmBox()).toBeNull()
    expect(tabs()).toEqual(['Paid2', 'Trials1', 'Ended1', 'Needs linking3'])
    expect(m.plan.collectPlan().filter(p => p.c === 'settings')).toEqual([])
  })

  it('a reason over 300 characters is flagged inline and cannot be saved; 300 can', async () => {
    await show('admin')
    await click(host.querySelector('[aria-label="More for Apple Test Account"]'))
    await click(button(host, 'Mark as test account'))
    await type(confirmBox()?.querySelector('input') ?? null, 'r'.repeat(301))
    const input = confirmBox()?.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const err = document.getElementById(String(input.getAttribute('aria-describedby')))
    expect(err?.textContent).toBe('Keep the reason to 300 characters or fewer')
    expect(confirmBtn()?.disabled).toBe(true)
    await type(input, 'r'.repeat(300))
    expect(input.getAttribute('aria-invalid')).toBeNull()
    await click(confirmBtn())
    expect(tabs()).toContain('Test accounts1')
  })

  it('an empty reason is allowed', async () => {
    await show('admin')
    await markApple('')
    await click(confirmBtn())
    await click(button(host, /^Test accounts/))
    expect(text()).toContain('No reason given')
  })

  it.each([
    ['a ros viewer', 'viewer', {}],
    ['a ros manager', 'manager', {}],
    ['a ros sales member who is an ard admin', 'sales', { ard: 'admin' }],
  ] as const)('%s cannot mark, and sees Not a test account switched off with the reason why', async (_label, role, others) => {
    await show(role, [marked({ accountId: 'k1', name: 'Kestrel Logistics' })], others)
    expect(host.querySelector('[aria-label^="More for"]')).toBeNull()
    expect(text()).not.toContain('Mark as test account')
    expect(tile('Paying customers')).toContain('1')
    await click(button(host, /^Test accounts/))
    const off = button(host, 'Not a test account')
    expect(off?.disabled).toBe(true)
    expect(off?.title).toBe('Only a Rosterio admin can change test accounts')
  })

  it('a marked account Rosterio no longer lists stays on Test accounts so it can be un-marked, and is not counted as left out', async () => {
    await show('admin', [marked({ accountId: 'gone1', name: 'Old Review Login' })])
    expect(tabs()).toContain('Test accounts1')
    expect(text()).not.toContain('left out of these figures')
    await click(button(host, /^Test accounts/))
    expect(text()).toContain('Old Review Login')
    expect(text()).toContain('Not in the latest list')
  })

  it('a marked account is never on Needs linking, even when it has no CRM company', async () => {
    await show('admin', [marked()])
    await click(button(host, /^Needs linking/))
    expect(text()).not.toContain('Apple Test Account')
  })
})

describe('Customers page: the product toggle count leaves test accounts out', () => {
  it('Rosterio shows its paying count without the test account', async () => {
    m = await loadSales()
    const b = rosterioWorld(world)
    b.collections.settings.push(rec('rosterioTest', { accounts: [marked()] }, 2))
    m.bootstrap.hydrate(b)
    setRole(m, 'admin', { pth: 'sales' })
    ;(m.store.S as unknown as { businesses: unknown[] }).businesses.push({ id: 'pth', name: 'PathIQ', short: 'PTH', accent: '#654321', currency: 'AUD' })
    m.store.reindex()
    fakeApi({ [ACCOUNTS]: json(200, ACCOUNTS_OK) })
    const { Customers } = await import('./Customers')
    await act(async () => { root.render(<Customers route={{ page: 'customers', q: { product: 'ros' } } as never} />) })
    await settle(6)
    expect(button(host, /^Rosterio 1$/)).toBeDefined()
  })
})
