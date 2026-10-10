import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json, link, PASSWORD, provisioned, rosterioWorld, setRole, STATUS_OK } from '../../testing/rosterioWorld'

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
const spies: Array<ReturnType<typeof vi.spyOn>> = []

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  getChanges.mockResolvedValue(changes([]))
  localStorage.clear()
  sessionStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  spies.length = 0
  vi.unstubAllGlobals()
})

interface Opts { role?: Parameters<typeof setRole>[1]; others?: Parameters<typeof setRole>[2]; world?: Parameters<typeof rosterioWorld>[0]; status?: unknown }

/** Opens the dialog for deal dl1 through the real modal host, as the Provision button does. */
async function open(routes: Parameters<typeof fakeApi>[0] = {}, o: Opts = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld(o.world))
  setRole(m, o.role === undefined ? 'sales' : o.role, o.others)
  const api = fakeApi({ [STATUS]: json(200, o.status ?? STATUS_OK), ...routes })
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('provisionRosterio', { dealId: 'dl1' }) })
  await settle(5)
  return api
}

const dialog = (): HTMLElement => host.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement
const text = (): string => host.textContent ?? ''

describe('Provision Rosterio account: who gets the dialog', () => {
  it('shows a viewer in Rosterio a read-only message, not the form', async () => {
    await open({}, { role: 'viewer' })
    expect(text()).toContain('Read-only access')
    expect(field(dialog(), 'Account name')).toBeNull()
  })

  it('shows someone who can edit another business but not Rosterio a read-only message', async () => {
    await open({}, { role: null, others: { ard: 'manager' } })
    expect(text()).toContain('Read-only access')
    expect(field(dialog(), 'Account name')).toBeNull()
  })

  it('says plainly that the link is not set up when the server is not configured, and offers no form', async () => {
    await open({}, { status: { configured: false, pendingFailures: 0, recent: [] } })
    expect(text()).toContain('Not set up: ask an admin to set the Rosterio URL and key')
    expect(field(dialog(), 'Account name')).toBeNull()
  })

  it('shows the existing account instead of the form when the company is already provisioned', async () => {
    await open({}, { world: { company: { rosterio: link({ isTrial: true, trialEndDate: '2026-12-12' }) } } })
    expect(text()).toContain('Rosterio account: Acme Pty Ltd · Pro · trial until')
    expect(field(dialog(), 'Account name')).toBeNull()
    expect(button(dialog(), 'Continue')).toBeUndefined()
  })

  it('lets a person who can edit Rosterio in (a super admin passes too)', async () => {
    await open({}, { role: 'super' })
    expect(field(dialog(), 'Account name')).not.toBeNull()
  })
})

describe('Provision Rosterio account: the form', () => {
  it('is prefilled from the company, the primary contact and the deal plan', async () => {
    await open()
    const d = dialog()
    expect(field(d, 'Account name')?.value).toBe('Acme Pty Ltd')
    expect(field(d, 'Admin first name')?.value).toBe('Jo')
    expect(field(d, 'Admin last name')?.value).toBe('Park')
    expect(field(d, 'Admin email')?.value).toBe('jo@acme.test')
    expect(field(d, 'Admin phone')?.value).toBe('0400 000 000')
    expect(field(d, 'Plan')?.value).toBe('pro')
    expect([...(field(d, 'Plan') as HTMLSelectElement).options].map(o => o.textContent)).toEqual(['Starter', 'Pro', 'Enterprise'])
  })

  it('defaults the plan to Starter when the deal has none', async () => {
    await open({}, { world: { dealFields: { plan: '' } } })
    expect(field(dialog(), 'Plan')?.value).toBe('starter')
  })

  it('stops on a bad email or a trial that ends in the past, without asking the server', async () => {
    const api = await open()
    await type(field(dialog(), 'Admin email'), 'not-an-email')
    await click(button(dialog(), 'Continue'))
    expect(text()).toContain('Enter a valid email address')
    await type(field(dialog(), 'Admin email'), 'jo@acme.test')
    await click(host.querySelector('[role="switch"]'))
    await type(field(dialog(), 'Trial ends'), '2020-01-01')
    await click(button(dialog(), 'Continue'))
    expect(text()).toContain('Pick a trial end date in the future')
    expect(text()).not.toContain('Confirm new Rosterio account')
    expect(api.count(PROVISION)).toBe(0)
  })

  it('states exactly what will happen before anything is sent', async () => {
    const api = await open()
    await click(button(dialog(), 'Continue'))
    expect(text()).toContain('This creates a live Rosterio account and a login for jo@acme.test.')
    expect(api.count(PROVISION)).toBe(0)
    await click(button(dialog(), 'Back'))
    expect(field(dialog(), 'Account name')?.value).toBe('Acme Pty Ltd')
    expect(api.count(PROVISION)).toBe(0)
  })
})

describe('Provision Rosterio account: sending', () => {
  it('sends the edited details once and shows the password panel', async () => {
    const api = await open({ [PROVISION]: json(201, provisioned()) })
    await type(field(dialog(), 'Account name'), 'Acme Group')
    await type(field(dialog(), 'Plan'), 'enterprise')
    await click(host.querySelector('[role="switch"]'))
    const end = '2999-01-01'
    await type(field(dialog(), 'Trial ends'), end)
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle()
    expect(api.count(PROVISION)).toBe(1)
    expect(api.calls.find(c => c.path === '/sales/rosterio/provision')?.body).toEqual({
      dealId: 'dl1', accountName: 'Acme Group', adminFirstName: 'Jo', adminLastName: 'Park', adminEmail: 'jo@acme.test', adminPhone: '0400 000 000',
      plan: 'enterprise', isTrial: true, trialEndDate: end,
    })
    expect(host.querySelector('[data-testid="temp-password"]')?.textContent).toBe(PASSWORD)
    expect(text()).toContain('Shown once, not stored by SalesOS')
    expect(text()).toContain('pass it to the customer securely'.replace('pass', 'Pass'))
    expect(button(dialog(), 'Copy password')).toBeDefined()
  })

  it('copies the password on request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await open({ [PROVISION]: json(201, provisioned()) })
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle()
    await click(button(dialog(), 'Copy password'))
    expect(writeText).toHaveBeenCalledWith(PASSWORD)
  })

  it('discards the password when the panel is closed', async () => {
    await open({ [PROVISION]: json(201, provisioned()) })
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle()
    expect(text()).toContain(PASSWORD)
    await click(button(dialog(), 'Close'))
    expect(text()).not.toContain(PASSWORD)
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => { m.ui.UI.open('provisionRosterio', { dealId: 'dl1' }) })
    await settle()
    expect(text()).not.toContain(PASSWORD)
  })

  it('never puts the password in storage, the shared data, the save queue, the console or the link', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(k => vi.spyOn(console, k).mockImplementation(() => undefined))
    await open({ [PROVISION]: json(201, provisioned()) })
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle(6)
    expect(text()).toContain(PASSWORD)
    const everything = JSON.stringify([m.store.S, { ...localStorage }, { ...sessionStorage }, logs.map(s => s.mock.calls)])
    expect(everything).not.toContain(PASSWORD)
    expect(m.sync.hasUnsaved()).toBe(false)
    const { rosterioLinkOf } = await import('../../data/rosterio')
    expect(JSON.stringify(rosterioLinkOf(m.store.S.companies[0]))).not.toContain(PASSWORD)
  })

  it('makes one request when the button is pressed twice', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const api = await open({ [PROVISION]: async () => { await gate; return json(201, provisioned()) } })
    await click(button(dialog(), 'Continue'))
    const create = button(dialog(), 'Create account') as HTMLButtonElement
    await act(async () => { create.click(); create.click() })
    release()
    await settle(5)
    expect(api.count(PROVISION)).toBe(1)
    expect(text()).toContain(PASSWORD)
  })

  it('shows the server\'s message for a rejected request and creates nothing', async () => {
    await open({ [PROVISION]: json(400, { error: 'That email already belongs to another Rosterio account.', code: 'VALIDATION' }) })
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle()
    expect(text()).toContain('That email already belongs to another Rosterio account.')
    expect(host.querySelector('[data-testid="temp-password"]')).toBeNull()
    expect(button(dialog(), 'Continue')).toBeDefined()
    const { rosterioLinkOf } = await import('../../data/rosterio')
    expect(rosterioLinkOf(m.store.S.companies[0])).toBeUndefined()
  })

  it('says someone already set the account up on a 409', async () => {
    await open({ [PROVISION]: json(409, { error: 'Already provisioned', code: 'CONFLICT', details: { link: link() } }) })
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle()
    expect(text()).toContain('This company already has a Rosterio account.')
    expect(host.querySelector('[data-testid="temp-password"]')).toBeNull()
  })

  it('does not mention a password when the person already had a login', async () => {
    await open({ [PROVISION]: json(201, provisioned({ isNewUser: false, tempPassword: null })) })
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle()
    expect(text()).toContain('already had a Rosterio login')
    expect(host.querySelector('[data-testid="temp-password"]')).toBeNull()
  })
})

describe('Provision Rosterio account: not sure what happened', () => {
  it('asks the person to press Check status after a timeout, then re-sends the same details and recovers', async () => {
    let n = 0
    const api = await open({
      [PROVISION]: () => (++n === 1 ? json(504, { error: 'Gateway timeout', code: 'INTERNAL' }) : json(201, provisioned({ isNewUser: false, tempPassword: null }))),
    })
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle()
    expect(text()).toContain('We could not confirm whether the Rosterio account was created')
    expect(button(dialog(), 'Check status')).toBeDefined()
    expect(button(dialog(), 'Continue')).toBeUndefined()
    await click(button(dialog(), 'Check status'))
    await settle()
    const sent = api.calls.filter(c => c.path === '/sales/rosterio/provision')
    expect(sent).toHaveLength(2)
    expect(sent[1].body).toEqual(sent[0].body)
    expect(text()).toContain('Rosterio account created')
    expect(text()).not.toContain(PASSWORD)
    const { rosterioLinkOf } = await import('../../data/rosterio')
    expect(rosterioLinkOf(m.store.S.companies[0])?.state).toBe('provisioned')
  })

  it('treats a dropped connection the same way', async () => {
    await open({ [PROVISION]: () => { throw new TypeError('Failed to fetch') } })
    await click(button(dialog(), 'Continue'))
    await click(button(dialog(), 'Create account'))
    await settle()
    expect(text()).toContain('We could not confirm whether the Rosterio account was created')
    expect(button(dialog(), 'Check status')).toBeDefined()
  })

  it('opens straight into Check status when the saved link is already in the not-sure state', async () => {
    const api = await open({ [PROVISION]: json(201, provisioned({ isNewUser: false, tempPassword: null })) }, { world: { company: { rosterio: { state: 'unknown' } } } })
    expect(text()).toContain('Check Rosterio account')
    expect(button(dialog(), 'Continue')).toBeUndefined()
    await click(button(dialog(), 'Check status'))
    await settle()
    expect(api.count(PROVISION)).toBe(1)
    expect(text()).toContain('Rosterio account created')
  })
})
