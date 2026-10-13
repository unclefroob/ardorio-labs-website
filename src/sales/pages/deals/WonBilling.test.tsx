import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingClient } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, CLIENT, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const CLIENTS = 'GET /sales/invoices/clients'
const CREATE_CLIENT = 'POST /sales/invoices/clients'

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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

const text = (): string => host.textContent ?? ''
const cl = (slug: string, clientName: string, billing: BillingClient['billing'] = {}, linkedCompanyId: string | null = null): BillingClient => ({ slug, clientName, billing, linkedCompanyId })
const UNLINKED = [cl('tw', 'Tidewater Foods', { email: 'ap@tidewaterfoods.example' }), cl('other', 'Unrelated Ltd')]
const stages = (p: string) => [
  { id: `${p}1`, name: 'Lead', prob: 10, required: [], won: false, lost: false },
  { id: `${p}2`, name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
  { id: `${p}3`, name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
]
const pipe = (id: string, businessId: string, p: string) => rec(id, { businessId, name: 'Pipeline', recurring: false, lostReasons: ['Price'], forecast: [], card: [], stages: stages(p), fields: [] })

type Routes = Parameters<typeof fakeApi>[0]
interface Opts { role?: Parameters<typeof setArdRole>[1]; dealId?: string; routes?: Routes }

/** Open the Won dialog on a deal and confirm it, as a person would. */
async function win(clients: BillingClient[], o: Opts = {}) {
  m = await loadSales()
  const world = invoicingWorld({
    pipelines: [pipe('pl1', 'ard', 'sg'), pipe('pl2', 'ros', 'rs')],
    deals: [
      ardDeal('dl1', { status: 'open', stageId: 'sg1', probability: 50, forecast: 'Pipeline', closedAt: null }),
      ardDeal('dl9', { businessId: 'ros', pipelineId: 'pl2', status: 'open', stageId: 'rs1', probability: 50, forecast: 'Pipeline', closedAt: null }),
    ],
  })
  world.collections.businesses.push(rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#654321', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl2', industries: [], roles: [] }) as never)
  m.bootstrap.hydrate(world)
  setArdRole(m, o.role ?? 'admin', { ros: 'admin' })
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const api = fakeApi({ [CLIENTS]: () => json(200, { clients }), ...o.routes })
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('won', { id: o.dealId ?? 'dl1' }) })
  await settle()
  await click(button(host, 'Confirm won'))
  await settle(8)
  const writes = () => api.calls.filter(c => c.method !== 'GET')
  const clientLoads = () => api.calls.filter(c => c.path === '/sales/invoices/clients' && c.method === 'GET').length
  return { api, nav, writes, clientLoads }
}

const navTo = (nav: ReturnType<typeof vi.fn>) => {
  const [p] = nav.mock.calls.at(-1) as [string]
  const u = new URL(p, 'https://x')
  return { path: u.pathname, q: JSON.parse(u.searchParams.get('q') ?? '{}') }
}

describe('Won dialog, Ardorio deal with no billing client', () => {
  it('wins the deal first, then offers the Billing step without linking or creating anything', async () => {
    const { writes } = await win(UNLINKED)
    expect(m.store.S.deals.find(d => d.id === 'dl1')?.status).toBe('won')
    expect(text()).toContain('Deal won')
    const step = host.querySelector('section[aria-labelledby="won-billing-h"]')
    expect(step).not.toBeNull()
    expect(step?.textContent).toContain('Optional')
    expect(step?.textContent).toContain('No billing client is linked to Tidewater Foods')
    expect(step?.textContent).toContain('Same name')
    expect(step?.textContent).not.toContain('Unrelated Ltd')
    expect(writes()).toEqual([])
  })

  it('Link links that one suggestion on the click, then shows the confirmation line with focus on it', async () => {
    let after = false
    const { writes } = await win(UNLINKED, {
      routes: {
        [CLIENTS]: () => json(200, { clients: after ? [cl('tw', 'Tidewater Foods', { email: 'ap@tidewaterfoods.example' }, 'co1')] : UNLINKED }),
        'POST /sales/invoices/clients/tw/link': () => { after = true; return json(200, {}) },
      },
    })
    const link = host.querySelector<HTMLButtonElement>('button[aria-label="Link Tidewater Foods"]')
    expect(link?.textContent).toBe('Link')
    await click(link)
    await settle(8)
    expect(writes()).toEqual([{ method: 'POST', path: '/sales/invoices/clients/tw/link', body: { companyId: 'co1' } }])
    expect(text()).toContain('Billing client linked: Tidewater Foods')
    expect(text()).toContain('still missing an ABN, an address')
    expect(host.querySelector('section[aria-labelledby="won-billing-h"]')).toBeNull()
    expect(document.activeElement?.textContent).toContain('Billing client linked')
    expect(m.ui.UI.get().modals).toHaveLength(1)
  })

  it('Create billing client creates from the company name and links it, on one click', async () => {
    let after = false
    const { writes } = await win([], {
      routes: {
        [CLIENTS]: () => json(200, { clients: after ? [cl('tidewater-foods', 'Tidewater Foods', {}, 'co1')] : [] }),
        [CREATE_CLIENT]: () => json(201, cl('tidewater-foods', 'Tidewater Foods')),
        'POST /sales/invoices/clients/tidewater-foods/link': () => { after = true; return json(200, {}) },
      },
    })
    expect(writes()).toEqual([])
    await click(button(host, 'Create billing client from "Tidewater Foods"'))
    await settle(8)
    expect(writes()).toEqual([
      { method: 'POST', path: '/sales/invoices/clients', body: { clientName: 'Tidewater Foods', billing: {} } },
      { method: 'POST', path: '/sales/invoices/clients/tidewater-foods/link', body: { companyId: 'co1' } },
    ])
    expect(text()).toContain('Billing client linked: Tidewater Foods')
  })

  it('a failed link says why, keeps the suggestion, and the deal stays won', async () => {
    await win(UNLINKED, { routes: { 'POST /sales/invoices/clients/tw/link': () => json(409, { error: 'That billing client is already linked to another company', code: 'CONFLICT' }) } })
    await click(host.querySelector('button[aria-label="Link Tidewater Foods"]'))
    await settle(8)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('already linked to another company')
    expect(host.querySelector('button[aria-label="Link Tidewater Foods"]')).not.toBeNull()
    expect(m.store.S.deals.find(d => d.id === 'dl1')?.status).toBe('won')
  })

  it('Not it hides that suggestion and sends nothing', async () => {
    const { writes } = await win(UNLINKED)
    await click(host.querySelector('button[aria-label="Not it, Tidewater Foods"]'))
    expect(text()).not.toContain('Same name')
    expect(writes()).toEqual([])
  })

  it('Later skips the step: nothing is sent, focus lands on the note, and Skip closes without leaving the page', async () => {
    const { writes, nav } = await win(UNLINKED)
    await click(button(host, 'Later'))
    expect(host.querySelector('section[aria-labelledby="won-billing-h"]')).toBeNull()
    expect(text()).toContain('Billing skipped')
    expect(document.activeElement?.textContent).toContain('Billing skipped')
    expect(writes()).toEqual([])
    await click(button(host, 'Skip'))
    expect(m.ui.UI.get().modals).toEqual([])
    expect(nav).not.toHaveBeenCalled()
  })

  it('a load failure is shown with Try again and does not stop the post-sale tasks', async () => {
    await win([], { routes: { [CLIENTS]: () => json(500, { error: 'boom', code: 'INTERNAL' }) } })
    expect(button(host, 'Try again')).toBeTruthy()
    expect(button(host, /^Create 3 tasks$/)).toBeTruthy()
  })
})

describe('Won dialog, Add milestones', () => {
  it('opens the deal Billing tab after the dialog closes with Skip', async () => {
    const { nav } = await win([CLIENT])
    const box = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(i => i.closest('label')?.textContent?.includes('Add milestones next'))
    expect(box?.checked).toBe(false)
    await click(box)
    expect(nav).not.toHaveBeenCalled()
    await click(button(host, 'Skip'))
    expect(m.ui.UI.get().modals).toEqual([])
    expect(navTo(nav)).toEqual({ path: '/sales/deals/dl1', q: { tab: 'billing' } })
  })

  it('opens the deal Billing tab after creating the post-sale tasks too', async () => {
    const { nav } = await win(UNLINKED)
    const box = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(i => i.closest('label')?.textContent?.includes('Add milestones next'))
    await click(box)
    await click(button(host, /^Create 3 tasks$/))
    expect(m.ui.UI.get().modals).toEqual([])
    expect(navTo(nav)).toEqual({ path: '/sales/deals/dl1', q: { tab: 'billing' } })
  })

  it('left unticked, closing the dialog stays where it is', async () => {
    const { nav } = await win([CLIENT])
    await click(button(host, /^Create 3 tasks$/))
    expect(nav).not.toHaveBeenCalled()
  })
})

describe('Won dialog, billing client already linked', () => {
  it('shows one confirmation line instead of the step', async () => {
    const { writes } = await win([CLIENT])
    expect(text()).toContain('Billing client linked: Tidewater Foods')
    expect(text()).not.toContain('still missing')
    expect(host.querySelector('section[aria-labelledby="won-billing-h"]')).toBeNull()
    expect(button(host, 'Later')).toBeUndefined()
    expect(writes()).toEqual([])
  })
})

describe('Won dialog, who sees the Billing step', () => {
  it('nobody but an Ardorio admin, and no billing request for anyone else', async () => {
    for (const role of ['manager', 'sales'] as const) {
      const { clientLoads } = await win(UNLINKED, { role })
      expect(text()).toContain('Deal won')
      expect(text()).not.toContain('No billing client is linked')
      expect(text()).not.toContain('Add milestones next')
      expect(clientLoads()).toBe(0)
      act(() => root.unmount())
      root = createRoot(host)
    }
  })

  it('a deal outside Ardorio is unchanged', async () => {
    const { clientLoads } = await win(UNLINKED, { dealId: 'dl9' })
    expect(m.store.S.deals.find(d => d.id === 'dl9')?.status).toBe('won')
    expect(text()).toContain('Deal won')
    expect(text()).not.toContain('No billing client is linked')
    expect(text()).not.toContain('Add milestones next')
    expect(clientLoads()).toBe(0)
  })
})

describe('Deal page follows a tab link to the deal already open', () => {
  it('switches to Billing when the route asks for it, without remounting', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [ardDeal('dl1')] }))
    setArdRole(m, 'admin')
    fakeApi({ [CLIENTS]: () => json(200, { clients: [CLIENT] }) })
    const { Deal } = await import('./Deal')
    const selected = () => host.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? ''
    await act(async () => { root.render(<Deal route={{ page: 'deal', id: 'dl1' } as never} />) })
    await settle(4)
    expect(selected()).toMatch(/^Overview/)
    await act(async () => { root.render(<Deal route={{ page: 'deal', id: 'dl1', q: { tab: 'billing' } } as never} />) })
    await settle(4)
    expect(selected()).toMatch(/^Billing/)
  })
})
