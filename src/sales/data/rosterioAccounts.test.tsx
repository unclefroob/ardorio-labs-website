import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../testing/fixtures'
import { settle } from '../testing/dom'
import { loadSales, type Sales } from '../testing/load'
import { account, accountsOf, fakeApi, json, link, rosterioWorld, setRole } from '../testing/rosterioWorld'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('./engineNudge', () => ({ nudgeEngine: vi.fn() }))
const flushAll = vi.fn(async () => true)
vi.mock('./sync', async orig => ({ ...(await orig<typeof import('./sync')>()), flushAll: () => flushAll(), pollOnce: vi.fn() }))

const ACCOUNTS = 'GET /sales/rosterio/accounts'
const LINK = 'POST /sales/rosterio/link'
const UNLINK = 'POST /sales/rosterio/unlink'

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
  vi.restoreAllMocks()
})

async function setup(routes: Parameters<typeof fakeApi>[0] = {}, role: Parameters<typeof setRole>[1] = 'sales', world: Parameters<typeof rosterioWorld>[0] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld(world))
  setRole(m, role)
  const api = fakeApi(routes)
  const mod = await import('./rosterio')
  return { api, mod }
}

async function probe(mod: typeof import('./rosterio'), mode: 'always' | 'ifStale' | 'never' = 'always') {
  function Probe() {
    const a = mod.useRosterioAccounts(mode)
    return <div data-s={a.s} data-prev={'previous' in a && a.previous ? 'yes' : 'no'}><button onClick={a.reload}>reload</button></div>
  }
  await act(async () => { root.render(<Probe />) })
  await settle(5)
  const el = (): HTMLElement => host.firstElementChild as HTMLElement
  return { s: () => el().dataset.s, prev: () => el().dataset.prev, reload: async () => { await act(async () => { host.querySelector('button')?.click() }); await settle(5) } }
}

describe('reading the live accounts', () => {
  it('reads Rosterio when the page opens and reports ok', async () => {
    const { api, mod } = await setup({ [ACCOUNTS]: json(200, accountsOf([account()])) })
    const p = await probe(mod)
    expect(p.s()).toBe('ok')
    expect(api.count(ACCOUNTS)).toBe(1)
  })

  it('does nothing for someone who is not in Rosterio', async () => {
    const { api, mod } = await setup({ [ACCOUNTS]: json(200, accountsOf([])) }, null)
    const p = await probe(mod)
    expect(p.s()).toBe('idle')
    expect(api.count(ACCOUNTS)).toBe(0)
  })

  it('"never" does not read', async () => {
    const { api, mod } = await setup({ [ACCOUNTS]: json(200, accountsOf([])) })
    await probe(mod, 'never')
    expect(api.count(ACCOUNTS)).toBe(0)
  })

  it('says not set up when the server says so', async () => {
    const { mod } = await setup({ [ACCOUNTS]: json(503, { error: 'Rosterio is not set up on the server', code: 'NOT_CONFIGURED' }) })
    expect((await probe(mod)).s()).toBe('notConfigured')
  })

  it('reports an error, and keeps the last good read for "last seen"', async () => {
    let fail = false
    const { mod } = await setup({ [ACCOUNTS]: () => (fail ? json(502, { error: 'Rosterio is down', code: 'UPSTREAM_ERROR' }) : json(200, accountsOf([account()]))) })
    const p = await probe(mod)
    expect(p.s()).toBe('ok')
    fail = true
    await p.reload()
    expect(p.s()).toBe('error')
    expect(p.prev()).toBe('yes')
  })

  it('an unexpected body is an error, not a half-empty list', async () => {
    const { mod } = await setup({ [ACCOUNTS]: json(200, { accounts: 'nope' }) })
    expect((await probe(mod)).s()).toBe('error')
  })

  it('two cards asking at once share one request, and a second mode reuses a fresh read', async () => {
    const { api, mod } = await setup({ [ACCOUNTS]: json(200, accountsOf([account()])) })
    function Two() {
      mod.useRosterioAccounts('ifStale')
      mod.useRosterioAccounts('ifStale')
      return null
    }
    await act(async () => { root.render(<Two />) })
    await settle(5)
    expect(api.count(ACCOUNTS)).toBe(1)
    await act(async () => { root.render(<Two key="again" />) })
    await settle(5)
    expect(api.count(ACCOUNTS)).toBe(1)
  })
})

describe('standing', () => {
  const NOW = Date.parse('2026-10-11T00:00:00Z')
  it('tells paid, trial, ended and inactive apart', async () => {
    const { mod } = await setup()
    expect(mod.standing(account(), NOW)).toMatchObject({ kind: 'paid', label: 'Paid' })
    expect(mod.standing(account({ isTrial: true, trialEndDate: '2026-10-15T00:00:00Z' }), NOW)).toMatchObject({ kind: 'trial', days: 4, label: 'Trial · 4 days left' })
    expect(mod.standing(account({ isTrial: true, trialEndDate: '2026-10-12T00:00:00Z' }), NOW).label).toBe('Trial · 1 day left')
    expect(mod.standing(account({ isTrial: true, trialEndDate: '2026-10-08T00:00:00Z' }), NOW)).toMatchObject({ kind: 'trialEnded', label: 'Trial ended 3 days ago' })
    expect(mod.standing(account({ isTrial: true }), NOW)).toMatchObject({ kind: 'trial', label: 'Trial' })
    expect(mod.standing(account({ isActive: false, status: 'cancelled' }), NOW)).toMatchObject({ kind: 'inactive', label: 'Cancelled' })
  })
})

describe('"Not it"', () => {
  it('is remembered in this browser, and a blocked store only means the suggestion returns', async () => {
    const { mod } = await setup()
    mod.dismissAccount('a1')
    expect([...mod.readDismissed()]).toEqual(['a1'])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => mod.dismissAccount('a2')).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(mod.readDismissed().size).toBe(0)
  })
})

describe('linking an account to a company', () => {
  it('saves the link after the company has synced, and the company shows it straight away', async () => {
    const { api, mod } = await setup({ [LINK]: json(200, { link: link({ accountId: 'acc9', accountName: 'Acme Pty Ltd' }) }) })
    const r = await mod.linkAccount('co1', 'acc9')
    expect(r.ok).toBe(true)
    expect(api.calls.find(c => c.path === '/sales/rosterio/link')?.body).toEqual({ companyId: 'co1', accountId: 'acc9' })
    expect(mod.rosterioLinkOf(m.store.S.companies.find(c => c.id === 'co1'))?.accountId).toBe('acc9')
  })

  it('does not call the server when the company has not synced, and says so', async () => {
    flushAll.mockResolvedValue(false)
    const { api, mod } = await setup({ [LINK]: json(200, { link: link() }) })
    const r = await mod.linkAccount('co1', 'acc1')
    expect(r).toEqual({ ok: false, kind: 'notSynced', message: 'Saved here, not synced yet. Retry' })
    expect(api.count(LINK)).toBe(0)
  })

  it('refuses a viewer without a request', async () => {
    const { api, mod } = await setup({ [LINK]: json(200, { link: link() }) }, 'viewer')
    expect(await mod.linkAccount('co1', 'acc1')).toMatchObject({ ok: false, kind: 'forbidden' })
    expect(api.count(LINK)).toBe(0)
  })

  it.each([
    [409, 'conflict', 'That account is already linked to another company.'],
    [404, 'missing', 'That account no longer exists in Rosterio.'],
    [403, 'forbidden', 'You need edit access to Rosterio to do this.'],
  ])('maps a %s to a clear message', async (status, kind, message) => {
    const { mod } = await setup({ [LINK]: json(status, { error: status === 403 ? 'nope' : message, code: 'X' }) })
    const r = await mod.linkAccount('co1', 'acc1')
    expect(r).toMatchObject({ ok: false, kind, message })
  })

  it('a link body that is not a link is not trusted', async () => {
    const { mod } = await setup({ [LINK]: json(200, { link: 'yes' }) })
    expect(await mod.linkAccount('co1', 'acc1')).toMatchObject({ ok: false, kind: 'failed' })
    expect(mod.rosterioLinkOf(m.store.S.companies.find(c => c.id === 'co1'))).toBeUndefined()
  })

  it('unlinking hides the link at once, even while the synced record still carries it', async () => {
    const { api, mod } = await setup({ [UNLINK]: json(200, {}) }, 'sales', { company: { rosterio: link({ accountId: 'acc1' }) } })
    const co = (): Parameters<typeof mod.rosterioLinkOf>[0] => m.store.S.companies.find(c => c.id === 'co1')
    expect(mod.rosterioLinkOf(co())?.accountId).toBe('acc1')
    expect(await mod.unlinkAccount('co1')).toEqual({ ok: true })
    expect(api.calls.find(c => c.path === '/sales/rosterio/unlink')?.body).toEqual({ companyId: 'co1' })
    expect(mod.rosterioLinkOf(co())).toBeUndefined()
  })

  it('a failed unlink leaves the link where it was', async () => {
    const { mod } = await setup({ [UNLINK]: json(500, { error: 'boom', code: 'INTERNAL' }) }, 'sales', { company: { rosterio: link({ accountId: 'acc1' }) } })
    const r = await mod.unlinkAccount('co1')
    expect(r.ok).toBe(false)
    expect(mod.rosterioLinkOf(m.store.S.companies.find(c => c.id === 'co1'))?.accountId).toBe('acc1')
  })
})

describe('creating a company from an account', () => {
  it('names it after the account, takes its website from a business billing email, tags the source and links it', async () => {
    const { api, mod } = await setup({ [LINK]: json(200, { link: link({ accountId: 'accN' }) }) })
    const before = m.store.S.companies.length
    const r = await mod.createCompanyFor(account({ id: 'accN', name: 'Newco Pty Ltd', billingEmail: 'ap@newco.example' }))
    expect(r.ok).toBe(true)
    const made = m.store.S.companies.find(c => c.name === 'Newco Pty Ltd')
    expect(m.store.S.companies.length).toBe(before + 1)
    expect(made).toMatchObject({ source: 'Rosterio customer', domain: 'newco.example' })
    expect(api.calls.find(c => c.path === '/sales/rosterio/link')?.body).toEqual({ companyId: made?.id, accountId: 'accN' })
  })

  it('leaves the website empty for a personal email address', async () => {
    const { mod } = await setup({ [LINK]: json(200, { link: link({ accountId: 'accG' }) }) })
    await mod.createCompanyFor(account({ id: 'accG', name: 'Bayside Cafe', billingEmail: 'owner@gmail.com' }))
    expect(m.store.S.companies.find(c => c.name === 'Bayside Cafe')?.website).toBe('')
  })

  it('Retry after "not synced" links the same company instead of making a second', async () => {
    flushAll.mockResolvedValueOnce(false)
    const { api, mod } = await setup({ [LINK]: json(200, { link: link({ accountId: 'accG' }) }) })
    const a = account({ id: 'accG', name: 'Bayside Cafe', billingEmail: 'owner@gmail.com' })
    const first = await mod.createCompanyFor(a)
    expect(first).toMatchObject({ ok: false, kind: 'notSynced' })
    const count = m.store.S.companies.filter(c => c.name === 'Bayside Cafe').length
    const second = await mod.createCompanyFor(a)
    expect(second.ok).toBe(true)
    expect(m.store.S.companies.filter(c => c.name === 'Bayside Cafe').length).toBe(count)
    expect(api.count(LINK)).toBe(1)
  })

  it('is refused for a viewer and creates nothing', async () => {
    const { mod } = await setup({}, 'viewer')
    const before = m.store.S.companies.length
    expect(await mod.createCompanyFor(account({ name: 'Nope Co' }))).toMatchObject({ ok: false, kind: 'forbidden' })
    expect(m.store.S.companies.length).toBe(before)
  })
})
