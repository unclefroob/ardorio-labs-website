import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingClient } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { ardDeal, CLIENT, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'
import { formatCents } from '../../shared/money'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const CLIENTS = 'GET /sales/invoices/clients'

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
const stages = [
  { id: 'sg1', name: 'Lead', prob: 10, required: [], won: false, lost: false },
  { id: 'sg2', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
  { id: 'sg3', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
]

/** Open the Won dialog on an open Ardorio deal with an estimate of $60,000, without confirming. */
async function open(clients: BillingClient[] = [CLIENT], role: Parameters<typeof setArdRole>[1] = 'admin', routes: Parameters<typeof fakeApi>[0] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    pipelines: [rec('pl1', { businessId: 'ard', name: 'Pipeline', recurring: false, lostReasons: ['Price'], forecast: [], card: [], stages, fields: [] })],
    deals: [ardDeal('dl1', { status: 'open', stageId: 'sg1', probability: 50, forecast: 'Pipeline', closedAt: null })],
  }))
  setArdRole(m, role)
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const api = fakeApi({ [CLIENTS]: () => json(200, { clients }), ...routes })
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('won', { id: 'dl1' }) })
  await settle()
  return { nav, api, deal: () => m.store.S.deals.find(d => d.id === 'dl1'), plan: () => m.store.S.billingPlans.find(p => p.dealId === 'dl1') }
}

const amountField = () => field(host, 'Contracted amount (A$, ex GST)') as HTMLInputElement
const chip = () => host.querySelector('[aria-label="Milestone reconciliation"]')?.textContent ?? ''

describe('Won dialog, Contract step (Ardorio admins)', () => {
  it('Outcome shows the steps and the estimate; Next opens the Contract step prefilled from the estimate', async () => {
    const { deal } = await open()
    expect(host.querySelector('ol[aria-label="Steps"] [aria-current="step"]')?.textContent).toBe('1 Outcome')
    expect(field(host, 'Estimate (A$, ex GST)')).not.toBeNull()
    await click(button(host, 'Next: contract'))
    expect(deal()?.status).toBe('open')
    expect(host.querySelector('ol[aria-label="Steps"] [aria-current="step"]')?.textContent).toBe('2 Contract')
    expect(amountField().value).toBe('60000.00')
    expect((field(host, 'Engagement type') as HTMLSelectElement).value).toBe('fixed-price')
    expect([...(field(host, 'Engagement type') as HTMLSelectElement).options].map(o => o.textContent)).toEqual(['Fixed-price project', 'Time and materials', 'Support retainer'])
    await settle(4)
    expect(text()).toContain('Billing client linked: Tidewater Foods')
    expect(chip()).toBe(`Scheduled ${formatCents(0)} of ${formatCents(6000000)}, ${formatCents(6000000)} unscheduled`)
  })

  it('reconciles the quick plan live: unscheduled, all scheduled, over-scheduled, with words not colour alone', async () => {
    await open()
    await click(button(host, 'Next: contract'))
    await type(host.querySelector('[aria-label="Milestone 1 amount"]'), '40000')
    expect(chip()).toBe(`Scheduled ${formatCents(4000000)} of ${formatCents(6000000)}, ${formatCents(2000000)} unscheduled`)
    await click(button(host, '+ Add milestone'))
    await type(host.querySelector('[aria-label="Milestone 2 amount"]'), '20000')
    expect(chip()).toContain('all scheduled')
    await type(amountField(), '55000')
    expect(chip()).toBe(`Scheduled ${formatCents(6000000)} of ${formatCents(5500000)}, ${formatCents(500000)} over-scheduled`)
  })

  it('Win and set up billing wins the deal, freezes the contract with the milestones, and opens the Billing tab', async () => {
    const { deal, plan, nav } = await open()
    await type(field(host, 'Close date'), '2026-10-10')
    await click(button(host, 'Next: contract'))
    await type(amountField(), '48,000')
    await type(field(host, 'Engagement type'), 'time-materials')
    await type(host.querySelector('[aria-label="Milestone 1 label"]'), 'Discovery and design')
    await type(host.querySelector('[aria-label="Milestone 1 amount"]'), '8000')
    await type(host.querySelector('[aria-label="Milestone 1 planned date"]'), '2026-10-31')
    await click(button(host, '+ Add milestone'))
    await click(button(host, '+ Add milestone'))
    await type(host.querySelector('[aria-label="Milestone 2 label"]'), 'Build')
    await type(host.querySelector('[aria-label="Milestone 2 amount"]'), '24000')
    await click(button(host, 'Win and set up billing'))
    expect(deal()?.status).toBe('won')
    // The estimate is left as it was: the contract lives on the plan.
    expect(deal()?.value).toBe(60000)
    expect(plan()?.contract).toEqual({ baselineCents: 4800000, engagementType: 'time-materials', contractedOn: '2026-10-10', contractedBy: 'u-me', estimateAtWonCents: 6000000 })
    // The third row was left blank and is not a milestone.
    expect(plan()?.milestones.map(x => [x.label, x.amountCents, x.plannedDate])).toEqual([['Discovery and design', 800000, '2026-10-31'], ['Build', 2400000, undefined]])
    expect(m.ui.UI.get().modals).toEqual([])
    const [p] = nav.mock.calls.at(-1) as [string]
    const u = new URL(p, 'https://x')
    expect([u.pathname, JSON.parse(u.searchParams.get('q') ?? '{}')]).toEqual(['/sales/deals/dl1', { tab: 'billing' }])
  })

  it('refuses a missing or zero contract and a half-filled milestone, and wins nothing', async () => {
    const { deal, plan } = await open()
    await click(button(host, 'Next: contract'))
    await type(amountField(), '')
    await click(button(host, 'Win and set up billing'))
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Enter the contracted amount/)
    expect(amountField().getAttribute('aria-invalid')).toBe('true')
    await type(amountField(), '0')
    await click(button(host, 'Win and set up billing'))
    expect(text()).toMatch(/contracted amount is from/)
    await type(amountField(), '48000')
    await type(host.querySelector('[aria-label="Milestone 1 label"]'), 'Discovery')
    await click(button(host, 'Win and set up billing'))
    expect(text()).toContain('Milestone 1: the amount is dollars and cents')
    await type(host.querySelector('[aria-label="Milestone 1 amount"]'), '8000')
    await type(host.querySelector('[aria-label="Milestone 1 label"]'), '')
    await click(button(host, 'Win and set up billing'))
    expect(text()).toContain('Milestone 1: the label is 1 to 120 characters')
    expect(deal()?.status).toBe('open')
    expect(plan()).toBeUndefined()
  })

  it('Later wins the deal without a contract and shows the usual won screen', async () => {
    const { deal, plan, nav } = await open()
    await click(button(host, 'Next: contract'))
    await click(button(host, 'Later'))
    expect(deal()?.status).toBe('won')
    expect(plan()?.contract).toBeUndefined()
    expect(text()).toContain('Deal won')
    expect(nav).not.toHaveBeenCalled()
  })

  it('Back keeps what was typed in the Contract step', async () => {
    await open()
    await click(button(host, 'Next: contract'))
    await type(amountField(), '51000')
    await click(button(host, 'Back'))
    await click(button(host, 'Next: contract'))
    expect(amountField().value).toBe('51000')
  })

  it('links a suggested billing client on the click, from the Contract step', async () => {
    let after = false
    const unlinked = { slug: 'tw', clientName: 'Tidewater Foods', billing: { email: 'ap@tidewater.example' }, linkedCompanyId: null }
    const { api } = await open([], 'admin', {
      [CLIENTS]: () => json(200, { clients: [after ? { ...unlinked, linkedCompanyId: 'co1' } : unlinked] }),
      'POST /sales/invoices/clients/tw/link': () => { after = true; return json(200, {}) },
    })
    await click(button(host, 'Next: contract'))
    await settle(4)
    expect(text()).toContain('Nothing is linked until you click')
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([])
    await click(host.querySelector('button[aria-label="Link Tidewater Foods"]'))
    await settle(8)
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([{ method: 'POST', path: '/sales/invoices/clients/tw/link', body: { companyId: 'co1' } }])
    expect(text()).toContain('Billing client linked: Tidewater Foods')
  })

  it('anyone but an Ardorio admin keeps the one-step dialog with no contract', async () => {
    for (const role of ['manager', 'sales'] as const) {
      await open([CLIENT], role)
      expect(button(host, 'Next: contract')).toBeUndefined()
      expect(host.querySelector('ol[aria-label="Steps"]')).toBeNull()
      expect(field(host, 'Final contract value (A$)')).not.toBeNull()
      act(() => root.unmount())
      root = createRoot(host)
    }
  })
})
