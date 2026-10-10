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
