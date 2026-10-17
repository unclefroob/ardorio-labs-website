import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { ACC_ID, account, accountsOf, billingView, detail, fakeApi, invoice, json, link, rosterioWorld, setRole } from '../../testing/rosterioWorld'

// The page for one Rosterio account: details, billing (started inline), invoices, people, features, activity.

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../data/sync', async orig => ({ ...(await orig<typeof import('../../data/sync')>()), flushAll: async () => true, pollOnce: vi.fn() }))

const DETAIL = `GET /sales/rosterio/accounts/${ACC_ID}`
const ACCOUNTS = 'GET /sales/rosterio/accounts'
const BILLING = `GET /sales/rosterio/billing?accountId=${ACC_ID}`
const INVOICES = `GET /sales/rosterio/invoices?accountId=${ACC_ID}`
const START = 'POST /sales/rosterio/billing/start'
const STOP = 'POST /sales/rosterio/billing/stop'

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
const top = (): HTMLElement => [...host.querySelectorAll<HTMLElement>('[role="dialog"]')].pop() as HTMLElement
const tab = (name: RegExp) => click([...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(t => name.test(t.textContent ?? '')))
type Routes = Parameters<typeof fakeApi>[0]
// A reply's body is read once, so these build a fresh one on every call (billing is read again after a start or stop).
const base = (): Routes => ({
  [DETAIL]: () => json(200, detail()),
  [INVOICES]: () => json(200, { configured: true, syncedAt: null, syncError: null, invoices: [] }),
  [BILLING]: () => json(200, billingView()),
})

async function show(routes: Routes, o: { role?: Parameters<typeof setRole>[1]; others?: Parameters<typeof setRole>[2]; q?: Record<string, unknown>; linked?: boolean; id?: string } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld({ company: o.linked === false ? {} : { rosterio: link({ accountId: ACC_ID }) } }))
  setRole(m, o.role === undefined ? 'admin' : o.role, o.others)
  const { pathToRoute } = await import('../../routes')
  const nav: string[] = []
  // Navigation goes through the same address parsing the browser router uses, so a tab change really changes the route.
  m.ui.bindNavigate(to => {
    if (typeof to !== 'string') return
    nav.push(to)
    const u = new URL(to, 'https://app.test')
    const r = pathToRoute(u.pathname, u.search)
    m.ui.syncRoute({ page: r.page, id: r.id, q: r.q })
  })
  m.ui.syncRoute({ page: 'rosterioAccount', id: o.id ?? ACC_ID, q: o.q })
  const api = fakeApi(routes)
  const { RosterioAccount } = await import('./RosterioAccount')
  const { Hosts } = await import('../../shell/Hosts')
  function Page() {
    const ui = m.ui.useUi()
    return <RosterioAccount route={ui.route} />
  }
  await act(async () => { root.render(<><Page /><Hosts /></>) })
  await settle(8)
  return { api, nav }
}
const seg = (name: string): HTMLButtonElement | undefined => [...host.querySelectorAll<HTMLButtonElement>('.seg button')].find(b => b.textContent === name)
/** The row of a list (label on the left, value on the right) that starts with this label. */
const rowOf = (label: string): string | undefined => [...host.querySelectorAll('.row')].find(r => r.firstElementChild?.textContent === label)?.textContent ?? undefined

describe('Rosterio account page: header and overview', () => {
  it('shows the account, its standing, plan, contract, users and the six tabs', async () => {
    await show(base())
    expect(text()).toContain('Rosterio account')
    expect(text()).toContain('Acme Pty Ltd')
    expect(text()).toContain('Live')
    expect(text()).toContain('Pro')
    expect(text()).toContain('Managed contract')
    expect(text()).toContain('12 of 20 users')
    expect(text()).toContain('customer since 14 Mar 2025')
    const admin = [...host.querySelectorAll('a')].find(a => a.textContent?.includes('Open in Rosterio admin'))
    expect(admin?.getAttribute('href')).toBe(`https://rosterio-crm.web.app/accounts/${ACC_ID}`)
    expect(admin?.getAttribute('target')).toBe('_blank')
    expect([...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)).toEqual(['Overview', 'Billing', 'Invoices0', 'People12', 'Features', 'Activity'])
    // Overview figures and cards
    expect(text()).toContain('Locations')
    expect(text()).toContain('3 of 5')
    expect(text()).toContain('A$400.00 a month ex GST')
    expect(text()).toContain('A$4,800.00 a year ex GST')
    expect(text()).toContain('Not billed yet')
    expect(text()).toContain('ACME-MSA')
    expect(text()).toContain('Jo Park')
    expect(text()).toContain('Kiosk clock-in')
  })

  it('a self-serve account says so and shows no contract', async () => {
    await show({ ...base(), [DETAIL]: json(200, detail({ pricing: { source: 'plan', managedContract: false, monthlyCost: 99, billingQuantity: 11 }, terms: null, maxUsers: null, memberCount: 11 })) })
    expect(text()).toContain('Self-serve')
    expect(text()).toContain('11 of unlimited users')
    expect(text()).not.toContain('Managed contract')
  })

  it('reaches the page from a company: the breadcrumb goes back to Companies and the company', async () => {
    await show(base(), { q: { from: 'company', companyId: 'co1' } })
    const crumb = host.querySelector('.crumb')
    expect(crumb?.textContent).toMatch(/Companies.*Acme Pty Ltd.*Rosterio account/)
    expect([...crumb!.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['/sales/companies', '/sales/companies/co1'])
  })

  it('reaches the page from Customers: the breadcrumb goes back to Customers and Rosterio', async () => {
    await show(base(), { q: { from: 'customers' } })
    const crumb = host.querySelector('.crumb')
    expect(crumb?.textContent ?? '').toMatch(/Customers.*Rosterio.*Acme Pty Ltd/)
    const hrefs = [...crumb!.querySelectorAll('a')].map(a => a.getAttribute('href') ?? '')
    expect(hrefs).toHaveLength(2)
    for (const h of hrefs) expect(JSON.parse(new URL(h, 'https://app.test').searchParams.get('q')!)).toEqual({ product: 'ros' })
    expect(hrefs.every(h => h.startsWith('/sales/customers?'))).toBe(true)
  })

  it('from=company without a company id falls back to the Customers breadcrumb', async () => {
    await show(base(), { q: { from: 'company' } })
    expect(host.querySelector('.crumb')?.textContent ?? '').toMatch(/Customers.*Rosterio.*Acme Pty Ltd/)
  })

  it('the eyebrow sits above the heading, not inside it', async () => {
    await show(base())
    expect(host.querySelector('h1')?.textContent).toBe('Acme Pty Ltd')
    expect(text()).toContain('Rosterio account')
  })

  it('an account with no company says so and Link company opens the link window for it', async () => {
    await show({ ...base(), [DETAIL]: json(200, detail({ company: null })), [ACCOUNTS]: json(200, accountsOf([account({ id: ACC_ID })])) }, { linked: false })
    expect(text()).toContain('Not linked to a company')
    expect(button(host, /Link company/)?.disabled).toBe(false)
    await click(button(host, /Link company/))
    const open = m.ui.UI.get().modals.at(-1)
    expect(open?.name).toBe('linkRosterio')
    expect(open?.props).toMatchObject({ accountId: ACC_ID })
  })

  it('Link company waits for the account to be in the loaded list, and says why', async () => {
    await show({ ...base(), [DETAIL]: json(200, detail({ company: null })), [ACCOUNTS]: json(200, accountsOf([account({ id: 'someone-else' })])) }, { linked: false })
    const b = button(host, /Link company/)
    expect(b?.disabled).toBe(true)
    expect(b?.title).toContain('not in the latest list')
  })

  it('Link company stays off, saying so, when the account list cannot be read', async () => {
    await show({ ...base(), [DETAIL]: json(200, detail({ company: null })), [ACCOUNTS]: json(502, { error: 'Rosterio is down', code: 'UPSTREAM_ERROR' }) }, { linked: false })
    const b = button(host, /Link company/)
    expect(b?.disabled).toBe(true)
    expect(b?.title).toContain('could not be read')
  })

  it('a linked account links to its company', async () => {
    await show(base())
    const a = [...host.querySelectorAll('a')].find(x => x.textContent === 'Acme Pty Ltd' && x.getAttribute('href')?.includes('/sales/companies/co1'))
    expect(a).toBeDefined()
  })

  it('shows the server message when Rosterio does not have the account', async () => {
    await show({ ...base(), [DETAIL]: json(404, { error: 'That Rosterio account was not found', code: 'NOT_FOUND' }) })
    expect(text()).toContain('That Rosterio account was not found')
    expect(host.querySelectorAll('[role="tab"]').length).toBe(0)
  })

  it.each([
    ['a Rosterio salesperson', 'sales', undefined],
    ['someone with no Rosterio role', null, undefined],
    ['an Ardorio admin with no Rosterio role', null, { ard: 'admin' }],
  ] as const)('%s is denied and nothing is asked of the server', async (_who, role, others) => {
    const { api } = await show(base(), { role, others })
    expect(text()).toContain('Rosterio accounts are for Rosterio admins')
    expect(api.calls).toEqual([])
  })

  it('an id that is not 24 hex characters is not found, and nothing is asked', async () => {
    const { api } = await show(base(), { id: 'acc1' })
    expect(text()).toContain('Account not found')
    expect(api.calls).toEqual([])
  })

  it('standing chips: trial, trial ended, inactive', async () => {
    const day = 86_400_000
    await show({ ...base(), [DETAIL]: json(200, detail({ isTrial: true, trialEndDate: new Date(Date.now() + 5 * day).toISOString() })) })
    expect(text()).toMatch(/Trial · \d days? left/)
    act(() => root.unmount()); root = createRoot(host)
    await show({ ...base(), [DETAIL]: json(200, detail({ isTrial: true, trialEndDate: new Date(Date.now() - 3 * day).toISOString() })) })
    expect(text()).toMatch(/Trial ended \d+ days? ago/)
    act(() => root.unmount()); root = createRoot(host)
    await show({ ...base(), [DETAIL]: json(200, detail({ isActive: false, status: 'cancelled' })) })
    expect(text()).toContain('Cancelled')
  })

  it('locations Rosterio could not list read as unknown, not zero', async () => {
    await show({ ...base(), [DETAIL]: json(200, detail({ locationCount: null })) })
    expect(text()).toContain('Rosterio could not list them')
    expect(text()).not.toContain('0 of 5')
  })

  it('the overview links through to the Billing and People tabs, and Correct terms goes to Rosterio admin', async () => {
    await show(base())
    const terms = [...host.querySelectorAll('a')].find(a => a.textContent === 'Correct terms')
    expect(terms?.getAttribute('href')).toBe(`https://rosterio-crm.web.app/accounts/${ACC_ID}`)
    await click(button(host, /All 12 people/))
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toMatch(/^People/)
    await tab(/^Overview/)
    await click([...host.querySelectorAll<HTMLButtonElement>('button.kpi')].find(b => b.textContent?.includes('Stripe billing')))
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Billing')
  })

  it('the tab comes from the address: Back and Forward move between tabs', async () => {
    const { nav } = await show(base())
    await tab(/^Features/)
    expect(decodeURIComponent(nav.at(-1)!)).toContain('"tab":"features"')
    expect(text()).toContain('Kiosk clock-in')
    await act(async () => { m.ui.syncRoute({ page: 'rosterioAccount', id: ACC_ID, q: { tab: 'people' } }) })
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toMatch(/^People/)
    await act(async () => { m.ui.syncRoute({ page: 'rosterioAccount', id: ACC_ID, q: {} }) })
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Overview')
  })

  it('a super user is let in', async () => {
    await show(base(), { role: 'super' })
    expect(text()).toContain('12 of 20 users')
  })

  it('opens on the tab named in the address', async () => {
    await show(base(), { q: { tab: 'features' } })
    expect(rowOf('Kiosk clock-in')).toBe('Kiosk clock-inOn')
    expect(rowOf('Payroll')).toBe('PayrollOff')
  })
})

describe('Rosterio account page: billing tab', () => {
  it('starts billing inline for the account, with what Stripe will do', async () => {
    const { api } = await show({ ...base(), [START]: json(200, { billing: billingView('scheduled', { collection: 'send_invoice', daysUntilDue: 14 }) }) }, { q: { tab: 'billing' } })
    expect(text()).toContain('Start billing')
    expect(text()).toContain('What Stripe will do')
    expect(text()).toContain('Stripe will email finance@acme.test an invoice for A$440.00 (A$400.00 + A$40.00 GST) a month, from 1 Nov 2026, due in 14 days.')
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    await click(button(host, /^Start billing$/))
    await settle(4)
    const call = api.calls.find(c => `${c.method} ${c.path}` === START)
    expect(call?.body).toEqual({ accountId: ACC_ID, collection: 'send_invoice', firstBillingDate: '2026-11-01', daysUntilDue: 14, billingEmail: 'finance@acme.test' })
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Billing starts 1 Nov 2026')
  })

  it('card on file sends no days to pay', async () => {
    const { api } = await show({ ...base(), [START]: json(200, { cardEmailSent: true, billing: billingView('awaiting_card') }) }, { q: { tab: 'billing' } })
    await click([...host.querySelectorAll<HTMLButtonElement>('.seg button')].find(b => b.textContent === 'Card on file'))
    await click([...host.querySelectorAll<HTMLButtonElement>('.seg button')].find(b => b.textContent === 'Today'))
    await click(button(host, /^Start billing$/))
    await settle(4)
    expect(api.calls.find(c => `${c.method} ${c.path}` === START)?.body).toEqual({ accountId: ACC_ID, collection: 'charge_automatically', firstBillingDate: '2026-10-17', billingEmail: 'finance@acme.test' })
  })

  it('lets the billing email be changed before starting', async () => {
    const { api } = await show({ ...base(), [START]: json(200, { billing: billingView('scheduled') }) }, { q: { tab: 'billing' } })
    await type(field(host, 'Billing email'), 'ap@acme.test')
    await click(button(host, /^Start billing$/))
    await settle(4)
    expect((api.calls.find(c => `${c.method} ${c.path}` === START)?.body as { billingEmail: string }).billingEmail).toBe('ap@acme.test')
  })

  it('terms billed yearly: says billing is yearly and points at Rosterio admin to change that', async () => {
    const yearly = billingView(null, {}, {
      terms: { billingModel: 'flat', amountCents: 480000, interval: 'yearly', effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: null, contractReference: null, status: 'active' },
      amounts: { quantity: 1, unitAmountCents: 480000, subtotalCents: 480000, gstCents: 48000, totalCents: 528000, gstPercent: 10, interval: 'yearly' },
    })
    await show({ ...base(), [BILLING]: json(200, yearly) }, { q: { tab: 'billing' } })
    expect(text()).toContain('Billed yearly per the terms. To bill monthly, correct the terms in Rosterio admin first')
  })

  it('cannot start: says why and offers no Start billing', async () => {
    await show({ ...base(), [BILLING]: json(200, billingView(null, {}, { canStart: false, cannotStartReason: 'The contract terms have ended.' })) }, { q: { tab: 'billing' } })
    expect(text()).toContain('The contract terms have ended.')
    expect(button(host, /^Start billing$/)).toBeUndefined()
  })

  it('a self-serve account pays at checkout: nothing to start', async () => {
    await show({ ...base(), [BILLING]: json(200, billingView(null, {}, { terms: null, amounts: null, canStart: false, cannotStartReason: 'This account has no managed contract terms.' })) }, { q: { tab: 'billing' } })
    expect(text()).toContain('pays at checkout')
    expect(button(host, /^Start billing$/)).toBeUndefined()
  })

  it('shows Rosterio\'s field errors from a refused start', async () => {
    const { api } = await show({
      ...base(),
      [START]: () => json(400, { error: 'Billing could not be started', code: 'VALIDATION', details: { errors: { billingEmail: 'A billing email is required' } } }),
    }, { q: { tab: 'billing' } })
    await click(button(host, /^Start billing$/))
    await settle(4)
    expect(api.count(START)).toBe(1)
    expect(text()).toContain('A billing email is required')
  })

  it('running: the amount, next bill, who pays and who it goes to, owing from the invoices', async () => {
    await show({
      ...base(),
      [BILLING]: json(200, billingView('active', { collection: 'send_invoice', currentPeriodEnd: '2026-11-17T00:00:00.000Z' })),
      [INVOICES]: json(200, { configured: true, syncedAt: null, syncError: null, invoices: [invoice({ id: 'in_9', status: 'open', amountRemainingCents: 44000, amountPaidCents: 0, paidAt: null })] }),
    }, { q: { tab: 'billing' } })
    expect(text()).toContain('A$440.00 a month incl. GST')
    expect(text()).toContain('Next bill')
    expect(text()).toContain('17 Nov')
    expect(text()).toContain('Emailed invoice')
    expect(text()).toContain('finance@acme.test')
    expect(text()).toContain('A$440.00 owing')
  })

  it('waiting for a card: the link to send, Send again, and Stop only after confirming', async () => {
    let stopped = false
    const { api } = await show({
      ...base(),
      [BILLING]: () => json(200, stopped ? billingView(null, {}, { billing: billingView('stopped', { stoppedAt: '2026-10-17T01:00:00.000Z', cardUrl: null }).billing, canStart: true, cannotStartReason: null }) : billingView('awaiting_card')),
      'POST /sales/rosterio/billing/card-link': json(200, { billing: billingView('awaiting_card'), cardEmailSent: true }),
      [STOP]: () => { stopped = true; return json(200, { billing: billingView('stopped') }) },
    }, { q: { tab: 'billing' } })
    expect(text()).toContain('Waiting for a card')
    expect((host.querySelector('input[aria-label="Card link"]') as HTMLInputElement).value).toBe('https://api.rosterio.test/api/billing/card/abc')
    await click(button(host, /Send again/))
    await settle(3)
    expect(api.calls.find(c => c.path === '/sales/rosterio/billing/card-link')?.body).toEqual({ accountId: ACC_ID })

    await click(button(host, /^Stop billing$/))
    await settle(2)
    expect(api.count(STOP)).toBe(0) // asks first
    await click(button(top(), /Stop billing/))
    await settle(6)
    expect(api.calls.find(c => `${c.method} ${c.path}` === STOP)?.body).toEqual({ accountId: ACC_ID })
    expect(text()).toContain('Stopped')
    expect(button(host, /^Start billing$/)).toBeDefined() // and can be started again
  })
})

describe('Rosterio account page: other tabs', () => {
  it('Invoices: this account\'s Stripe invoices, newest first, asked for by account', async () => {
    const { api } = await show({
      ...base(),
      [INVOICES]: json(200, { configured: true, syncedAt: null, syncError: null, invoices: [invoice({ id: 'in_2', number: 'RS-2', status: 'open', failed: true, amountRemainingCents: 44000, amountPaidCents: 0, paidAt: null }), invoice()] }),
    }, { q: { tab: 'invoices' } })
    expect(api.count(INVOICES)).toBe(1)
    expect(text()).toContain('RS-2')
    expect(text()).toContain('Payment failed')
    expect(text()).toContain('RS-1')
    expect([...host.querySelectorAll('[role="tab"]')].find(t => t.textContent?.startsWith('Invoices'))?.textContent).toBe('Invoices2')
  })

  it('Invoices: an empty list says so', async () => {
    await show(base(), { q: { tab: 'invoices' } })
    expect(text()).toContain('No Stripe invoices yet')
  })

  it('People: counts by role and the account admins, with no email addresses', async () => {
    await show(base(), { q: { tab: 'people' } })
    expect(text()).toContain('Super admins')
    expect(text()).toContain('Managers')
    expect(text()).toContain('Staff')
    expect(text()).toContain('Jo Park')
    expect(text()).not.toContain('@')
  })

  it('Activity: when the account was created and what has happened to its billing', async () => {
    await show({ ...base(), [BILLING]: json(200, billingView('stopping', { collection: 'send_invoice', startedAt: '2026-10-10T00:00:00.000Z', firstBillingDate: '2026-10-12', currentPeriodEnd: '2026-11-12T00:00:00.000Z', cancelAtPeriodEnd: true })) }, { q: { tab: 'activity' } })
    expect(text()).toContain('Account created')
    expect(text()).toContain('14 Mar 2025')
    expect(text()).toContain('Billing started')
    expect(text()).toContain('10 Oct')
    expect(text()).toContain('First bill')
    expect(text()).toContain('12 Oct')
  })

  it('switching tabs changes what is shown', async () => {
    await show(base())
    expect(text()).toContain('Contract terms')
    await tab(/^Features/)
    expect(text()).not.toContain('Contract terms')
    expect(text()).toContain('Kiosk clock-in')
  })
})

describe('Rosterio account page: after a start or stop the whole page reads again', () => {
  it('Start: billing, the account and the invoices are read again, the new state shows, and focus moves to it', async () => {
    let started = false
    const { api } = await show({
      ...base(),
      [DETAIL]: () => json(200, detail({ billingState: started ? 'scheduled' : null })),
      [BILLING]: () => json(200, started ? billingView('scheduled', { collection: 'send_invoice', daysUntilDue: 14 }) : billingView()),
      [START]: () => { started = true; return json(200, { billing: billingView('scheduled', { collection: 'send_invoice', daysUntilDue: 14 }) }) },
      [INVOICES]: () => json(200, { configured: true, syncedAt: null, syncError: null, invoices: [] }),
    }, { q: { tab: 'billing' } })
    await click(button(host, /^Start billing$/))
    await settle(8)
    expect(api.count(BILLING)).toBe(2)
    expect(api.count(DETAIL)).toBe(2)
    expect(api.count(INVOICES)).toBe(2)
    expect(text()).toContain('Scheduled')
    expect(text()).toContain('Emailed invoice')
    expect(document.activeElement?.textContent).toBe('Stripe billing')
    await tab(/^Overview/)
    expect(text()).toContain('Scheduled')
    expect(text()).not.toContain('Not billed yet')
  })

  it('Stop: the same, and focus lands on the start form', async () => {
    let stopped = false
    const { api } = await show({
      ...base(),
      [DETAIL]: () => json(200, detail()),
      [BILLING]: () => json(200, stopped ? billingView('stopped', { stoppedAt: '2026-10-17T01:00:00.000Z', cardUrl: null }, { canStart: true, cannotStartReason: null }) : billingView('awaiting_card')),
      [STOP]: () => { stopped = true; return json(200, { billing: billingView('stopped') }) },
      [INVOICES]: () => json(200, { configured: true, syncedAt: null, syncError: null, invoices: [] }),
    }, { q: { tab: 'billing' } })
    await click(button(host, /^Stop billing$/))
    await click(button(top(), /Stop billing/))
    await settle(8)
    expect(api.count(STOP)).toBe(1)
    expect(api.count(BILLING)).toBe(2)
    expect(api.count(DETAIL)).toBe(2)
    expect(api.count(INVOICES)).toBe(2)
    expect(document.activeElement?.textContent).toBe('Start billing in Stripe')
  })

  it('cancelling the Stop confirmation sends nothing', async () => {
    const { api } = await show({ ...base(), [BILLING]: () => json(200, billingView('active')) }, { q: { tab: 'billing' } })
    await click(button(host, /^Stop billing$/))
    await click(button(top(), 'Cancel'))
    await settle(3)
    expect(api.count(STOP)).toBe(0)
    expect(api.count(BILLING)).toBe(1)
  })

  it('a refused start (502) shows the server message and leaves the form ready to try again', async () => {
    const { api } = await show({
      ...base(),
      [START]: () => json(502, { error: 'Rosterio could not be reached', code: 'UPSTREAM_ERROR' }),
    }, { q: { tab: 'billing' } })
    await click(button(host, /^Start billing$/))
    await settle(4)
    expect(api.count(START)).toBe(1)
    expect(text()).toContain('Rosterio could not be reached')
    expect(button(host, /^Start billing$/)?.disabled).toBe(false)
    expect(api.count(BILLING)).toBe(1) // nothing changed, so nothing is read again
  })

  it('billing that cannot be read has a Try again that reads it again', async () => {
    let n = 0
    const { api } = await show({ ...base(), [BILLING]: () => (++n === 1 ? json(502, { error: 'Rosterio is down', code: 'UPSTREAM_ERROR' }) : json(200, billingView())) }, { q: { tab: 'billing' } })
    expect(text()).toContain('Rosterio is down')
    await click(button(host, 'Try again'))
    await settle(4)
    expect(api.count(BILLING)).toBe(2)
    expect(text()).toContain('What Stripe will do')
  })

  it('invoices that cannot be read have a Try again', async () => {
    let n = 0
    const { api } = await show({ ...base(), [INVOICES]: () => (++n === 1 ? json(502, { error: 'Stripe is down', code: 'UPSTREAM_ERROR' }) : json(200, { configured: true, syncedAt: null, syncError: null, invoices: [invoice()] })) }, { q: { tab: 'invoices' } })
    expect(text()).toContain('Stripe is down')
    await click(button(host, 'Try again'))
    await settle(4)
    expect(api.count(INVOICES)).toBe(2)
    expect(text()).toContain('RS-1')
  })
})

describe('Rosterio account page: the start form checks what it sends', () => {
  const start = (api: { calls: { method: string; path: string; body: unknown }[] }) => api.calls.find(c => `${c.method} ${c.path}` === START)

  it('days to pay must be 1 to 60: otherwise Start is off, the reason shows, and the summary never says NaN', async () => {
    await show(base(), { q: { tab: 'billing' } })
    for (const bad of ['0', '61', '', '2.5']) {
      await type(field(host, 'Days to pay'), bad)
      expect(button(host, /^Start billing$/)?.disabled).toBe(true)
      expect(text()).toContain('Days to pay must be a whole number from 1 to 60')
      expect(text()).not.toContain('NaN')
      expect(text()).not.toContain('Stripe will email')
    }
    await type(field(host, 'Days to pay'), '30')
    expect(button(host, /^Start billing$/)?.disabled).toBe(false)
    expect(text()).toContain('due in 30 days')
  })

  it('sends the same days the summary shows', async () => {
    const { api } = await show({ ...base(), [START]: () => json(200, { billing: billingView('scheduled') }) }, { q: { tab: 'billing' } })
    await type(field(host, 'Days to pay'), '45')
    expect(text()).toContain('due in 45 days')
    await click(button(host, /^Start billing$/))
    await settle(4)
    expect((start(api)?.body as { daysUntilDue: number }).daysUntilDue).toBe(45)
  })

  it('no billing email: Start is off and says why', async () => {
    await show({ ...base(), [BILLING]: () => json(200, billingView(null, {}, { billingEmail: null })) }, { q: { tab: 'billing' } })
    expect(button(host, /^Start billing$/)?.disabled).toBe(true)
    expect(text()).toContain('A billing email is required')
  })

  it('picking a date with none chosen: Start is off and says why', async () => {
    await show(base(), { q: { tab: 'billing' } })
    await click(seg('Pick a date'))
    expect(button(host, /^Start billing$/)?.disabled).toBe(true)
    expect(text()).toContain('Choose the first billing date')
  })

  it('the choices are named groups, not labels with nothing to point at', async () => {
    await show(base(), { q: { tab: 'billing' } })
    const groups = [...host.querySelectorAll('[role="group"][aria-labelledby]')].map(g => document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent)
    expect(groups).toEqual(expect.arrayContaining(['How they pay', 'First bill']))
    for (const l of host.querySelectorAll('label')) expect(l.getAttribute('for')).toBeTruthy()
  })
})

describe('Rosterio account page: billing states and the other tabs', () => {
  it('scheduled: when it starts and how it is paid', async () => {
    await show({ ...base(), [BILLING]: () => json(200, billingView('scheduled', { collection: 'send_invoice', daysUntilDue: 14, cardUrl: null })) }, { q: { tab: 'billing' } })
    expect(text()).toContain('Scheduled')
    expect(rowOf('First bill')).toContain('1 Nov')
    expect(rowOf('Paid by')).toContain('Emailed invoice')
  })

  it('waiting for a card: the amount and that a card pays', async () => {
    await show({ ...base(), [BILLING]: () => json(200, billingView('awaiting_card')) }, { q: { tab: 'billing' } })
    expect(rowOf('Amount')).toContain('A$440.00 a month incl. GST')
    expect(rowOf('Paid by')).toContain('Card on file')
  })

  it('an invoice link is shown only for an https address', async () => {
    await show({
      ...base(),
      [INVOICES]: () => json(200, { configured: true, syncedAt: null, syncError: null, invoices: [invoice({ id: 'a', number: 'RS-A', hostedUrl: 'javascript:alert(1)' }), invoice({ id: 'b', number: 'RS-B', hostedUrl: 'https://invoice.stripe.test/b' })] }),
    }, { q: { tab: 'invoices' } })
    const links = [...host.querySelectorAll('a')].filter(a => a.textContent === 'View in Stripe')
    expect(links.map(a => a.getAttribute('href'))).toEqual(['https://invoice.stripe.test/b'])
  })

  it('Activity with no billing lists only the account being created', async () => {
    await show(base(), { q: { tab: 'activity' } })
    expect(text()).toContain('Account created')
    expect(text()).not.toContain('Billing started')
  })

  it('Activity after billing was stopped says so', async () => {
    await show({ ...base(), [BILLING]: () => json(200, billingView('stopped', { stoppedAt: '2026-10-17T01:00:00.000Z', cardUrl: null }, { canStart: true, cannotStartReason: null })) }, { q: { tab: 'activity' } })
    expect(text()).toContain('Billing started')
    expect(text()).toContain('Billing stopped')
  })
})
