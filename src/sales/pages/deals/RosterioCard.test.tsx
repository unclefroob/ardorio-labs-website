import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, field, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json, link, provisioned, rosterioWorld, setRole, STATUS_OK } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const STATUS = 'GET /sales/rosterio/status'
const PROVISION = 'POST /sales/rosterio/provision'

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  getChanges.mockResolvedValue(changes([]))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

interface Opts { role?: Parameters<typeof setRole>[1]; world?: Parameters<typeof rosterioWorld>[0]; status?: unknown }
async function setup(routes: Parameters<typeof fakeApi>[0] = {}, o: Opts = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld(o.world))
  setRole(m, o.role === undefined ? 'sales' : o.role)
  return fakeApi({ [STATUS]: json(200, o.status ?? STATUS_OK), ...routes })
}
const text = (): string => host.textContent ?? ''
/** The dialog on top. Re-read it each time: the modal swaps to a new element as it moves on. */
const top = (): HTMLElement => [...host.querySelectorAll<HTMLElement>('[role="dialog"]')].pop() as HTMLElement

describe('Rosterio account card on the deal and company pages', () => {
  it('offers Provision to someone who can edit Rosterio when it is set up and there is no account', async () => {
    await setup()
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" dealId="dl1" />) })
    await settle(5)
    expect(button(host, 'Provision Rosterio account')).toBeDefined()
  })

  it('also offers it on the company page, which has no deal in hand but has a Rosterio deal', async () => {
    await setup()
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" />) })
    await settle(5)
    expect(button(host, 'Provision Rosterio account')).toBeDefined()
  })

  it('shows nothing to a viewer, even when it is set up', async () => {
    await setup({}, { role: 'viewer' })
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" dealId="dl1" />) })
    await settle(5)
    expect(button(host, 'Provision Rosterio account')).toBeUndefined()
    expect(text()).not.toContain('No Rosterio account yet')
  })

  it('shows nothing to someone who is not in Rosterio at all, and does not ask the server about it', async () => {
    const api = await setup({}, { role: null })
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" dealId="dl1" />) })
    await settle(5)
    expect(host.textContent).toBe('')
    expect(api.count(STATUS)).toBe(0)
  })

  it('does not offer it when the link is not set up on the server', async () => {
    await setup({}, { status: { configured: false, pendingFailures: 0, recent: [] } })
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" dealId="dl1" />) })
    await settle(5)
    expect(button(host, 'Provision Rosterio account')).toBeUndefined()
  })

  it('shows the account and no button once the company is provisioned', async () => {
    await setup({}, { world: { company: { rosterio: link({ isTrial: true, trialEndDate: '2026-12-12' }) } } })
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" dealId="dl1" />) })
    await settle(5)
    expect(text()).toMatch(/Rosterio account: Acme Pty Ltd · Pro · trial until 12 Dec/)
    expect(button(host, 'Provision Rosterio account')).toBeUndefined()
  })

  it('shows the account to a viewer too, without any button', async () => {
    await setup({}, { role: 'viewer', world: { company: { rosterio: link() } } })
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" dealId="dl1" />) })
    await settle(5)
    expect(text()).toContain('Rosterio account: Acme Pty Ltd · Pro')
    expect(text()).not.toContain('trial')
    expect(host.querySelectorAll('button')).toHaveLength(0)
  })

  it('shows a Check status button for the not-sure state, and it opens the dialog that re-sends', async () => {
    const api = await setup({ [PROVISION]: json(201, provisioned({ isNewUser: false, tempPassword: null })) }, { world: { company: { rosterio: { state: 'unknown' } } } })
    const { RosterioCard } = await import('./RosterioCard')
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<><RosterioCard companyId="co1" dealId="dl1" /><Hosts /></>) })
    await settle(5)
    expect(text()).toContain('We could not confirm whether the Rosterio account was created')
    expect(button(host, 'Provision Rosterio account')).toBeUndefined()
    await click(button(host, 'Check status'))
    await settle()
        expect(top()).toBeDefined()
    await click(button(top(), 'Check status'))
    await settle()
    expect(api.count(PROVISION)).toBe(1)
    expect(text()).toContain('Rosterio account created')
  })

  it('shows the new account on the card after a provision, without a reload', async () => {
    await setup({ [PROVISION]: json(201, provisioned()) })
    const { RosterioCard } = await import('./RosterioCard')
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<><RosterioCard companyId="co1" dealId="dl1" /><Hosts /></>) })
    await settle(5)
    await click(button(host, 'Provision Rosterio account'))
    await settle()
        expect(field(top(), 'Account name')).not.toBeNull()
    await click(button(top(), 'Continue'))
    await click(button(top(), 'Create account'))
    await settle()
    await click(button(top(), 'Close'))
    expect(text()).toContain('Rosterio account: Acme Pty Ltd · Pro')
    expect(button(host, 'Provision Rosterio account')).toBeUndefined()
  })
})

describe('Winning a Rosterio deal', () => {
  async function win(routes: Parameters<typeof fakeApi>[0] = {}, o: Opts = {}) {
    const api = await setup(routes, o)
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<Hosts />) })
    await act(async () => { m.ui.UI.open('won', { id: 'dl1' }) })
    await settle()
    await click(button(host, /Mark as won|Closed Won|Confirm/))
    await settle(5)
    return api
  }

  it('only asks. It never creates the account by itself', async () => {
    const api = await win({ [PROVISION]: json(201, provisioned()) })
    expect(text()).toContain('Deal won')
    expect(text()).toContain('Provision a Rosterio account for Acme Pty Ltd?')
    await settle(5)
    expect(api.count(PROVISION)).toBe(0)
  })

  it('opens the dialog when the person chooses to, and still sends nothing until they confirm', async () => {
    const api = await win({ [PROVISION]: json(201, provisioned()) })
    await click(button(host, 'Set up account'))
    await settle()
        expect(field(top(), 'Account name')?.value).toBe('Acme Pty Ltd')
    expect(api.count(PROVISION)).toBe(0)
  })

  it('does not ask when the company already has an account', async () => {
    await win({}, { world: { company: { rosterio: link() } } })
    expect(text()).toContain('Deal won')
    expect(text()).not.toContain('Provision a Rosterio account for')
  })

  it('does not ask when the link is not set up', async () => {
    await win({}, { status: { configured: false, pendingFailures: 0, recent: [] } })
    expect(text()).toContain('Deal won')
    expect(text()).not.toContain('Provision a Rosterio account for')
  })
})

describe('Rosterio card: the refreshed snapshot', () => {
  const REFRESH = 'POST /sales/rosterio/refresh'
  const ACCOUNTS = 'GET /sales/rosterio/accounts'
  const UNLINK = 'POST /sales/rosterio/unlink'
  const linked = { rosterio: link({ accountId: 'acc1', accountName: 'Acme Pty Ltd' }) }
  const mount = async () => {
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" />) })
    await settle(6)
  }

  it('refreshes the saved snapshot when the company is opened, once', async () => {
    const api = await setup({ [REFRESH]: json(200, { link: link({ accountState: 'active' }), refreshed: true, planDrift: null }) }, { world: { company: linked } })
    await mount()
    expect(api.calls.find(c => c.path === '/sales/rosterio/refresh')?.body).toEqual({ companyId: 'co1' })
    expect(api.count(REFRESH)).toBe(1)
  })

  it('does not refresh a company with no account', async () => {
    const api = await setup()
    await mount()
    expect(api.count(REFRESH)).toBe(0)
  })

  it('stays quiet when Rosterio could not be asked (refreshed false) or the request fails', async () => {
    await setup({ [REFRESH]: json(200, { link: link(), refreshed: false, planDrift: null }) }, { world: { company: linked } })
    await mount()
    expect(text()).toContain('Rosterio account: Acme Pty Ltd · Pro')
    expect(text()).not.toContain('deleted')
    expect(text()).not.toContain('The account is on')
    vi.unstubAllGlobals()
    await setup({ [REFRESH]: json(500, { error: 'boom', code: 'INTERNAL' }) }, { world: { company: linked } })
    await mount()
    expect(text()).toContain('Rosterio account: Acme Pty Ltd · Pro')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('names the plan drift, as information only', async () => {
    await setup({ [REFRESH]: json(200, { link: link({ plan: 'pro' }), refreshed: true, planDrift: { dealPlan: 'starter', accountPlan: 'pro' } }) }, { world: { company: linked } })
    await mount()
    expect(text()).toContain('The account is on Pro, the deal says Starter.')
    expect(text()).toContain('The deal is not changed.')
  })

  it('shows no drift nudge when there is none', async () => {
    await setup({ [REFRESH]: json(200, { link: link(), refreshed: true, planDrift: null }) }, { world: { company: linked } })
    await mount()
    expect(text()).not.toContain('the deal says')
  })

  it('says the account was deleted in Rosterio and offers Unlink, which uses the existing unlink', async () => {
    const api = await setup({
      [REFRESH]: json(200, { link: link({ accountState: 'deleted', accountStatus: 'deleted' }), refreshed: true, planDrift: null }),
      [UNLINK]: json(200, {}),
    }, { world: { company: linked } })
    const { Hosts } = await import('../../shell/Hosts')
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<><RosterioCard companyId="co1" /><Hosts /></>) })
    await settle(6)
    expect(text()).toContain('Account deleted in Rosterio')
    expect(text()).toContain('kept until you unlink it')
    expect(text()).not.toContain('The account is on')
    await click(button(host, 'Unlink'))
    await click(button(top(), 'Unlink'))
    await settle(5)
    expect(api.calls.find(c => c.path === '/sales/rosterio/unlink')?.body).toEqual({ companyId: 'co1' })
  })

  it('never links or unlinks by itself: a deleted account makes no other call', async () => {
    const api = await setup({ [REFRESH]: json(200, { link: link({ accountState: 'deleted' }), refreshed: true, planDrift: null }) }, { world: { company: linked } })
    await mount()
    expect(api.calls.filter(c => c.method === 'POST').map(c => c.path)).toEqual(['/sales/rosterio/refresh'])
  })

  it('does not offer Unlink for the deleted account to someone who cannot edit', async () => {
    await setup({ [REFRESH]: json(200, { link: link({ accountState: 'deleted' }), refreshed: true, planDrift: null }) }, { role: 'viewer', world: { company: linked } })
    await mount()
    expect(text()).toContain('Account deleted in Rosterio')
    expect(button(host, 'Unlink')).toBeUndefined()
  })

  it('shows Open in Admin only when the server sent an address', async () => {
    await setup({ [REFRESH]: json(200, { link: link(), refreshed: true, planDrift: null, adminUrl: 'https://admin.rosterio.test/accounts/acc1' }) }, { role: 'admin', world: { company: linked } })
    await mount()
    const a = [...host.querySelectorAll('a')].find(x => x.textContent === 'Open in Admin')
    expect(a?.getAttribute('href')).toBe('https://admin.rosterio.test/accounts/acc1')
    expect(a?.getAttribute('rel')).toContain('noopener')
  })

  it('has no Open in Admin link without an address', async () => {
    await setup({ [REFRESH]: json(200, { link: link(), refreshed: true, planDrift: null }) }, { role: 'admin', world: { company: linked } })
    await mount()
    expect([...host.querySelectorAll('a')].some(x => x.textContent === 'Open in Admin')).toBe(false)
  })

  it('shows a salesperson the plan, status, trial end and seats, and no operator features, pricing or billing email', async () => {
    const { account, accountsOf } = await import('../../testing/rosterioWorld')
    await setup({
      [REFRESH]: json(200, { link: link(), refreshed: true, planDrift: null }),
      [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1', plan: 'pro', isTrial: true, trialEndDate: '2999-01-31T00:00:00.000Z', memberCount: 12, billingEmail: 'finance@acme.test' })])),
    }, { world: { company: linked } })
    await mount()
    expect(text()).toContain('Pro')
    expect(text()).toContain('Trial ends')
    expect(text()).toContain('31 Jan 2999')
    expect(text()).toContain('Active users')
    expect(text()).toContain('12')
    for (const t of ['Kiosk', 'Payroll', 'Compliance', 'Monthly', 'Billing email', 'finance@acme.test']) expect(text()).not.toContain(t)
  })

  it('shows the billing email to a Rosterio admin only', async () => {
    const { account, accountsOf } = await import('../../testing/rosterioWorld')
    await setup({
      [REFRESH]: json(200, { link: link(), refreshed: true, planDrift: null }),
      [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1', billingEmail: 'finance@acme.test' })])),
      'GET /sales/rosterio/billing?companyId=co1': json(404, { error: 'none', code: 'NOT_FOUND' }),
      'GET /sales/rosterio/invoices?companyId=co1': json(200, { configured: true, syncedAt: null, syncError: null, invoices: [] }),
    }, { role: 'admin', world: { company: linked } })
    await mount()
    expect(text()).toContain('finance@acme.test')
  })

  it('a fresh answer of active beats a stored deleted (the account was restored)', async () => {
    await setup({ [REFRESH]: json(200, { link: link({ accountState: 'active' }), refreshed: true, planDrift: null }) }, { world: { company: { rosterio: link({ accountState: 'deleted' }) } } })
    await mount()
    expect(text()).not.toContain('Account deleted in Rosterio')
    expect(text()).toContain('Rosterio account: Acme Pty Ltd')
  })

  it('a stored deleted still shows when the refresh could not be made', async () => {
    await setup({ [REFRESH]: json(500, { error: 'x', code: 'INTERNAL' }) }, { world: { company: { rosterio: link({ accountState: 'deleted' }) } } })
    await mount()
    expect(text()).toContain('Account deleted in Rosterio')
  })

  it('ignores a refresh that is for another account', async () => {
    await setup({ [REFRESH]: json(200, { link: link({ accountId: 'other' }), refreshed: true, planDrift: { dealPlan: 'starter', accountPlan: 'pro' }, adminUrl: 'https://admin.rosterio.test/accounts/other' }) }, { world: { company: linked } })
    await mount()
    expect(text()).not.toContain('the deal says')
    expect([...host.querySelectorAll('a')].some(x => x.textContent === 'Open in Admin')).toBe(false)
  })

  it('only links to an https address', async () => {
    await setup({ [REFRESH]: json(200, { link: link(), refreshed: true, planDrift: null, adminUrl: 'javascript:alert(1)' }) }, { role: 'admin', world: { company: linked } })
    await mount()
    expect([...host.querySelectorAll('a')].some(x => x.textContent === 'Open in Admin')).toBe(false)
    const { safeUrl } = await import('../../data/rosterio')
    expect(safeUrl('http://admin.example.com/x')).toBeUndefined()
    expect(safeUrl('http://localhost:5173/x')).toBe('http://localhost:5173/x')
    expect(safeUrl('https://admin.example.com/x')).toBe('https://admin.example.com/x')
  })

  it('gives each Unlink the account name, and the 44px phone class to the small ones', async () => {
    const { account, accountsOf } = await import('../../testing/rosterioWorld')
    await setup({ [REFRESH]: json(200, { link: link(), refreshed: true, planDrift: null }), [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])) }, { world: { company: linked } })
    await mount()
    const u = host.querySelector('button[aria-label="Unlink Acme Pty Ltd"]')
    expect(u).not.toBeNull()
    expect(u?.className).toContain('tap')
    expect(host.querySelector('button[aria-label="Refresh"]')?.className).toContain('tap')
  })
})

describe('Rosterio card: locations', () => {
  const REFRESH = 'POST /sales/rosterio/refresh'
  const ACCOUNTS = 'GET /sales/rosterio/accounts'
  const linked = { rosterio: link({ accountId: 'acc1' }) }
  const show = async () => {
    const { RosterioCard } = await import('./RosterioCard')
    await act(async () => { root.render(<RosterioCard companyId="co1" />) })
    await settle(6)
  }
  const rowText = (l: string): string | undefined => [...host.querySelectorAll('.row')].find(r => r.firstElementChild?.textContent === l)?.textContent ?? undefined

  it('shows the count to a salesperson, on the live card and the saved-link card', async () => {
    const { account, accountsOf } = await import('../../testing/rosterioWorld')
    await setup({ [REFRESH]: json(200, { link: link({ locationCount: 4 }), refreshed: true, planDrift: null }), [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])) }, { world: { company: linked } })
    await show()
    expect(rowText('Locations')).toBe('Locations4')
  })

  it('shows the count when the live list is unavailable too', async () => {
    await setup({ [REFRESH]: json(200, { link: link({ locationCount: 2 }), refreshed: true, planDrift: null }) }, { world: { company: linked } })
    await show()
    expect(text()).toMatch(/Locations\s*2/)
  })

  it('shows nothing for null or an absent count', async () => {
    const { account, accountsOf } = await import('../../testing/rosterioWorld')
    await setup({ [REFRESH]: json(200, { link: link({ locationCount: null }), refreshed: true, planDrift: null }), [ACCOUNTS]: json(200, accountsOf([account({ id: 'acc1' })])) }, { world: { company: linked } })
    await show()
    expect(text()).not.toContain('Locations')
  })
})

describe('Rosterio refresh: the once-a-minute rule', () => {
  const REFRESH = 'POST /sales/rosterio/refresh'
  const ok = () => json(200, { link: link(), refreshed: true, planDrift: null })
  afterEach(() => vi.restoreAllMocks())

  it('asks once a minute per company, separately for each company, and again after a minute', async () => {
    const api = await setup({ [REFRESH]: ok })
    const { refreshRosterio } = await import('../../data/rosterio')
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await refreshRosterio('co1')
    await refreshRosterio('co1')
    expect(api.count(REFRESH)).toBe(1)
    await refreshRosterio('co2')
    expect(api.count(REFRESH)).toBe(2)
    now += 61_000
    await refreshRosterio('co1')
    expect(api.count(REFRESH)).toBe(3)
  })

  it('counts a failed attempt too, so errors do not fire on every mount, and tries again after a minute', async () => {
    const api = await setup({ [REFRESH]: json(500, { error: 'x', code: 'INTERNAL' }) })
    const { refreshRosterio } = await import('../../data/rosterio')
    let now = 5_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await refreshRosterio('co1')
    await refreshRosterio('co1')
    expect(api.count(REFRESH)).toBe(1)
    now += 61_000
    await refreshRosterio('co1')
    expect(api.count(REFRESH)).toBe(2)
  })

  it('sends one request when two callers ask together', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const api = await setup({ [REFRESH]: async () => { await gate; return ok() } })
    const { refreshRosterio } = await import('../../data/rosterio')
    const a = refreshRosterio('co1')
    const b = refreshRosterio('co1')
    release()
    await Promise.all([a, b])
    expect(api.count(REFRESH)).toBe(1)
  })
})
