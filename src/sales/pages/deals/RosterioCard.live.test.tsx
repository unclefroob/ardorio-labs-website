import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { account, accountsOf, fakeApi, json, link, rosterioWorld, setRole, STATUS_OK } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../data/sync', async orig => ({ ...(await orig<typeof import('../../data/sync')>()), flushAll: async () => true, pollOnce: vi.fn() }))

const STATUS = 'GET /sales/rosterio/status'
const ACCOUNTS = 'GET /sales/rosterio/accounts'
const UNLINK = 'POST /sales/rosterio/unlink'

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

async function show(routes: Parameters<typeof fakeApi>[0], o: { role?: Parameters<typeof setRole>[1]; company?: Record<string, unknown> } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld({ company: { domain: 'acme.test', ...o.company } }))
  setRole(m, o.role === undefined ? 'sales' : o.role)
  const api = fakeApi({ [STATUS]: json(200, STATUS_OK), ...routes })
  const { RosterioCard } = await import('./RosterioCard')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><RosterioCard companyId="co1" /><Hosts /></>) })
  await settle(6)
  return api
}

const linked = { rosterio: link({ accountId: 'acc1', accountName: 'Acme Pty Ltd' }) }

describe('company card with the live Rosterio account', () => {
  it('shows the live plan, status, users and billing email, and a note that lead pushes are paused', async () => {
    await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1', plan: 'enterprise', memberCount: 340, billingEmail: 'finance@acme.test' })])) }, { company: linked })
    expect(text()).toContain('Live')
    expect(text()).toContain('Enterprise')
    expect(text()).toContain('Paid')
    expect(text()).toContain('340')
    expect(text()).toContain('Customer since')
    expect(text()).toContain('finance@acme.test')
    expect(text()).toContain('Read from Rosterio')
    expect(text()).toContain('New Rosterio deals on this company are not sent as leads')
    expect(button(host, 'Unlink')).toBeDefined()
  })

  it('a Rosterio admin sees where the customer stands with Stripe: latest invoice, anything owing', async () => {
    const owing = { id: 'in_2', number: 'RS-2', accountId: 'acc1', companyId: 'co1', customerName: 'Acme', status: 'open', failed: true, overdue: false, amountDueCents: 9900, amountPaidCents: 0, amountRemainingCents: 9900, currency: 'aud', createdAt: '2026-10-01T00:00:00Z', dueAt: null, paidAt: null, periodStart: null, periodEnd: null, attemptCount: 1, nextAttemptAt: null, lastError: null, hostedUrl: null, pdfUrl: null }
    const api = await show({
      [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])),
      'GET /sales/rosterio/invoices?companyId=co1': json(200, { configured: true, syncedAt: null, syncError: null, invoices: [owing] }),
    }, { company: linked, role: 'admin' })
    expect(api.count('GET /sales/rosterio/invoices?companyId=co1')).toBe(1)
    expect(text()).toContain('Payments')
    expect(text()).toContain('Payment failed')
    expect(text()).toContain('A$99.00 owing')
  })

  it('anyone short of a Rosterio admin does not see payments, and nothing is asked of Stripe', async () => {
    const api = await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])) }, { company: linked, role: 'sales' })
    expect(text()).not.toContain('Payments')
    expect(api.calls.some(c => c.path.startsWith('/sales/rosterio/invoices'))).toBe(false)
  })

  describe('billing in Stripe (Rosterio admins)', () => {
    const BILLING = 'GET /sales/rosterio/billing?companyId=co1'
    const view = (o: Record<string, unknown> = {}) => ({
      accountId: 'acc1', accountName: 'Acme Pty Ltd', timezone: 'Australia/Sydney', today: '2026-10-17', billingEmail: 'finance@acme.test',
      terms: { billingModel: 'flat', amountCents: 40000, interval: 'monthly', effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: null, contractReference: null, status: 'active' },
      amounts: { quantity: 1, unitAmountCents: 40000, subtotalCents: 40000, gstCents: 4000, totalCents: 44000, gstPercent: 10, interval: 'monthly' }, options: [],
      billing: null, canStart: true, cannotStartReason: null, ...o,
    })
    const card = (state: string, o: Record<string, unknown> = {}) => view({
      canStart: false, cannotStartReason: 'Billing is already set up for this account.',
      billing: { state, collection: 'charge_automatically', firstBillingDate: '2026-11-01', daysUntilDue: null, billingEmail: 'finance@acme.test', startedAt: '2026-10-17T00:00:00.000Z',
        stoppedAt: null, cardUrl: 'https://api.rosterio.test/api/billing/card/abc', cardSavedAt: null, lastError: null, subscriptionStatus: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, termsChangedFrom: null, ...o },
    })
    // A reply's body is read once, so each test gets its own.
    const base = () => ({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])), 'GET /sales/rosterio/invoices?companyId=co1': json(200, { configured: true, syncedAt: null, syncError: null, invoices: [] }) })

    it('a managed account not billed yet says so, and has no billing buttons: those are on the account page', async () => {
      await show({ ...base(), [BILLING]: json(200, view()) }, { company: linked, role: 'admin' })
      expect(text()).toContain('Not billed yet')
      expect(button(host, /Start billing/)).toBeUndefined()
      expect(host.querySelector('[role="dialog"]')).toBeNull()
    })

    it('a self-serve account pays at checkout: nothing to start', async () => {
      await show({ ...base(), [BILLING]: json(200, view({ terms: null, amounts: null, canStart: false, cannotStartReason: 'This account has no managed contract terms.' })) }, { company: linked, role: 'admin' })
      expect(text()).toContain('Self-serve: pays at checkout')
      expect(button(host, /Start billing/)).toBeUndefined()
    })

    it.each([
      ['awaiting_card', 'Waiting for a card'],
      ['scheduled', 'Scheduled'],
      ['active', 'Billing'],
      ['stopping', 'Ending'],
      ['stopped', 'Stopped'],
    ])('billing %s is a read-only chip: %s', async (state, label) => {
      await show({ ...base(), [BILLING]: json(200, card(state)) }, { company: linked, role: 'admin' })
      const row = [...host.querySelectorAll('.row')].find(r => r.textContent?.startsWith('Billing'))
      expect(row?.textContent).toContain(label)
      for (const b of [/Start billing/, /^Stop$/, /Stop billing/, /Send again/]) expect(button(host, b)).toBeUndefined()
      expect(host.querySelector('input[aria-label="Card link"]')).toBeNull()
    })

    it('a Rosterio admin gets a link to the account page, which remembers the company', async () => {
      await show({ ...base(), [BILLING]: json(200, view()) }, { company: linked, role: 'admin' })
      const a = [...host.querySelectorAll('a')].find(x => x.textContent === 'Open Rosterio account →')
      expect(a).toBeDefined()
      const url = new URL(a!.getAttribute('href')!, 'https://app.test')
      expect(url.pathname).toBe('/sales/rosterio-accounts/acc1')
      expect(JSON.parse(url.searchParams.get('q')!)).toEqual({ from: 'company', companyId: 'co1' })
    })

    it('Rosterio sales do not see billing, and nothing is asked', async () => {
      const api = await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])) }, { company: linked, role: 'sales' })
      expect(text()).not.toContain('Billing')
      expect(text()).not.toContain('Open Rosterio account')
      expect(api.calls.some(c => c.path.startsWith('/sales/rosterio/billing'))).toBe(false)
    })
  })

  it('offers a follow-up task while the account is on trial', async () => {
    const end = new Date(Date.now() + 4 * 86_400_000).toISOString()
    await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1', isTrial: true, trialEndDate: end })])) }, { company: linked })
    expect(text()).toMatch(/Trial · \d days? left/)
    expect(button(host, 'Create a follow-up task')).toBeDefined()
  })

  it('a viewer sees the live account but no Unlink or task button', async () => {
    await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1', isTrial: true, trialEndDate: new Date(Date.now() + 86_400_000 * 3).toISOString() })])) }, { company: linked, role: 'viewer' })
    expect(text()).toContain('Live')
    expect(button(host, 'Unlink')).toBeUndefined()
    expect(button(host, 'Create a follow-up task')).toBeUndefined()
  })

  it('unlinks only after the person confirms, then offers to provision again', async () => {
    const api = await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])), [UNLINK]: json(200, {}) }, { company: linked })
    await click(button(host, 'Unlink'))
    await settle()
    expect(api.count(UNLINK)).toBe(0)
    expect(top().textContent).toContain('Nothing changes in Rosterio')
    await click(button(top(), 'Unlink'))
    await settle(6)
    expect(api.calls.find(c => c.path === '/sales/rosterio/unlink')?.body).toEqual({ companyId: 'co1' })
    expect(button(host, 'Provision Rosterio account')).toBeDefined()
    expect(text()).not.toContain('Read from Rosterio')
  })

  it('says it is the saved link when Rosterio cannot be reached and nothing was read before', async () => {
    await show({ [ACCOUNTS]: json(502, { error: 'down', code: 'UPSTREAM_ERROR' }) }, { company: linked })
    expect(text()).toContain('Rosterio account: Acme Pty Ltd · Pro')
    expect(text()).toContain("Rosterio can't be reached right now. This is the saved link.")
    expect(text()).not.toContain('Last seen')
  })

  it('says "last seen" with the age when it read the account earlier and then lost Rosterio', async () => {
    let fail = false
    await show({ [ACCOUNTS]: () => (fail ? json(502, { error: 'down', code: 'UPSTREAM_ERROR' }) : json(200, accountsOf([account({ id: 'acc1' })]))) }, { company: linked })
    expect(text()).toContain('Live')
    fail = true
    const mod = await import('../../data/rosterio')
    await act(async () => { await mod.loadRosterioAccounts() })
    await settle(4)
    expect(text()).toMatch(/Last seen/)
    expect(text()).toContain('the last status SalesOS saw')
  })

  it('says so when a linked account is no longer in the list', async () => {
    await show({ [ACCOUNTS]: json(200, accountsOf([account({ id: 'someone-else' })])) }, { company: linked })
    expect(text()).toContain('not in the latest list from Rosterio')
  })
})

describe('the same card on the deal page', () => {
  it('carries the lead-push note on a Rosterio deal of a linked company', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld({ company: linked }))
    setRole(m, 'sales')
    fakeApi({ [STATUS]: json(200, STATUS_OK), [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])) })
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" dealId="dl1" />) })
    await settle(6)
    expect(text()).toContain('not sent as leads')
  })
})

describe('company card suggesting a Rosterio account', () => {
  const routes = { [ACCOUNTS]: () => json(200, accountsOf([account({ id: 'accX', name: 'Acme Pty Ltd', billingEmail: 'ap@acme.test' })])) }

  it('says an account looks like this company, and links only after the dialog', async () => {
    await show(routes)
    expect(text()).toContain('A Rosterio account looks like this company')
    expect(text()).toContain('Not linked')
    await click(button(host, 'Review and link'))
    await settle()
    expect(top().textContent).toContain('Link Acme Pty Ltd to a CRM company')
  })

  it('Not it takes the suggestion away', async () => {
    await show(routes)
    await click(button(host, 'Not it'))
    expect(text()).not.toContain('A Rosterio account looks like this company')
  })

  it('does not suggest an account another company already holds', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld({ company: { domain: 'acme.test' }, extraCompanies: { other: { name: 'Other', rosterio: link({ accountId: 'accX' }) } } }))
    setRole(m, 'sales')
    fakeApi({ [STATUS]: json(200, STATUS_OK), ...routes })
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" />) })
    await settle(6)
    expect(text()).not.toContain('A Rosterio account looks like this company')
  })
})
