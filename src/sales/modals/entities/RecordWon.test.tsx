import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { formatCents } from '../../shared/money'
import { WON_DATE_FUTURE } from '../../shared/recordWon'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

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
const day = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const stages = (p: string) => [
  { id: `${p}1`, name: 'Lead', prob: 10, required: [], won: false, lost: false },
  { id: `${p}2`, name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
  { id: `${p}3`, name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
]
const biz = (id: string, name: string, pipelineId: string) => rec(id, { name, short: id.toUpperCase(), accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId, industries: [], roles: [] })

type Role = Parameters<typeof setArdRole>[1]

/** Open Record a won deal as `role` in Ardorio (plus sales in Rosterio), with these props. */
async function open(props: Record<string, unknown> = {}, role: Role = 'admin') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    businesses: [biz('ard', 'Ardorio', 'pl1'), biz('ros', 'Rosterio', 'pl2')],
    pipelines: [
      rec('pl1', { businessId: 'ard', name: 'Ardorio pipeline', recurring: false, lostReasons: [], forecast: [], card: [], stages: stages('sg'), fields: [] }),
      rec('pl2', { businessId: 'ros', name: 'Rosterio pipeline', recurring: true, lostReasons: [], forecast: [], card: [], stages: stages('rs'), fields: [] }),
    ],
    contacts: [rec('ct1', { firstName: 'Sam', lastName: 'Lee', name: 'Sam Lee', title: 'COO', companyId: 'co1', email: 'sam@tidewater.example', archived: false, notes: [] })],
  }))
  setArdRole(m, role, { ros: 'sales' })
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('recordWon', props) })
  await settle()
  const S = m.store.S
  return {
    nav,
    counts: () => ({ deals: S.deals.length, companies: S.companies.length, contacts: S.contacts.length, plans: S.billingPlans.length, activities: S.activities.length }),
    newDeal: () => S.deals.find(d => d.id !== 'dl1'),
  }
}

const lastNav = (nav: ReturnType<typeof vi.fn>): string => decodeURIComponent(String(nav.mock.calls.at(-1)?.[0]))
const companyInput = () => host.querySelector<HTMLInputElement>('#rw-company')

async function fill(o: { title?: string; wonOn?: string; amount?: string }) {
  if (o.title !== undefined) await type(field(host, 'Deal title'), o.title)
  if (o.wonOn !== undefined) await type(field(host, 'Won date'), o.wonOn)
  if (o.amount !== undefined) {
    const f = field(host, 'Contracted amount (A$, ex GST)') ?? field(host, 'Won value (A$, ex GST)') ?? field(host, 'Final contract value (A$)')
    await type(f, o.amount)
  }
}

describe('Record a won deal (Ardorio admin)', () => {
  it('creates the company by name, the contact and the deal straight in Won, freezes the contract, then opens Billing', async () => {
    const { nav, newDeal } = await open()
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Record a won deal')
    await type(companyInput(), 'Kestrel Logistics')
    expect(text()).toContain('No company called Kestrel Logistics in your CRM.')
    await click(button(host, '+ Create “Kestrel Logistics”'))
    expect(text()).toContain('New company · not researched yet')
    await type(field(host, 'Contact name (optional)'), 'Dana Wong')
    await type(field(host, 'Contact email (optional)'), 'Dana@Kestrel.example')
    await fill({ title: 'Fleet dashboard build', wonOn: '2026-03-03', amount: '120,000' })
    await click([...host.querySelectorAll('[role="group"][aria-label="Engagement type"] button')].find(b => b.textContent === 'Time and materials'))
    expect(host.querySelector('[role="group"][aria-label="Engagement type"] [aria-pressed="true"]')?.textContent).toBe('Time and materials')
    const summary = host.querySelector('[aria-label="What recording does"]')?.textContent ?? ''
    expect(summary).toContain('Creates the company and contact, and the deal straight in Won on 3 Mar 2026.')
    expect(summary).toContain(`Freezes a contract baseline of ${formatCents(12_000_000)} ex GST and counts it as Won value in March 2026.`)
    expect(summary).toContain('Recorded as won directly by Me Myself')

    await click(button(host, 'Record won deal'))

    const S = m.store.S
    const co = S.companies.find(c => c.name === 'Kestrel Logistics')
    expect(co).toMatchObject({ researchStatus: 'Not researched' })
    expect(S.companyRels.find(r => r.companyId === co?.id && r.businessId === 'ard')?.status).toBe('Customer')
    const ct = S.contacts.find(c => c.companyId === co?.id)
    expect(ct).toMatchObject({ firstName: 'Dana', lastName: 'Wong', email: 'dana@kestrel.example' })
    const d = newDeal()
    expect(d).toMatchObject({
      title: 'Fleet dashboard build', businessId: 'ard', companyId: co?.id, stageId: 'sg2', status: 'won', value: 120_000, mrr: null, probability: 100,
      forecast: 'Closed', close: '2026-03-03', recordedWonDirectly: true, recordedWonBy: 'Me Myself', contactIds: [ct?.id], primaryContact: ct?.id,
    })
    expect(d?.closedAt?.startsWith('2026-03-03T')).toBe(true)
    expect(S.activities.find(a => a.dealId === d?.id)).toMatchObject({ type: 'won', subject: 'Recorded as won directly', actorId: 'u-me' })
    expect(S.billingPlans.find(p => p.dealId === d?.id)).toMatchObject({
      id: `bp_${d?.id}`, businessId: 'ard', milestones: [],
      contract: { baselineCents: 12_000_000, engagementType: 'time-materials', contractedOn: '2026-03-03', estimateAtWonCents: 12_000_000, contractedBy: 'Me Myself' },
    })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(lastNav(nav)).toContain(String(d?.id))
    expect(lastNav(nav)).toContain('"tab":"billing"')

    // One sync batch, in the order the server needs: company and contact, then the deal, then its billing plan.
    const plan = m.plan.collectPlan().map(p => `${p.kind} ${p.c} ${p.id}`)
    const at = (s: string) => plan.findIndex(x => x === s)
    expect(at(`create companies ${co?.id}`)).toBeGreaterThanOrEqual(0)
    expect(at(`create companies ${co?.id}`)).toBeLessThan(at(`create deals ${d?.id}`))
    expect(at(`create contacts ${ct?.id}`)).toBeLessThan(at(`create deals ${d?.id}`))
    expect(at(`create deals ${d?.id}`)).toBeLessThan(at(`create billingPlans bp_${d?.id}`))
  })

  it('refuses a future won date inline, at once, and saves nothing', async () => {
    const { counts } = await open({ companyId: 'co1', businessId: 'ard' })
    const before = counts()
    await fill({ title: 'Support handover', amount: '9000' })
    await fill({ wonOn: day(3) })
    expect(text()).toContain(WON_DATE_FUTURE)
    expect(field(host, 'Won date')?.getAttribute('aria-invalid')).toBe('true')
    await click(button(host, 'Record won deal'))
    expect(counts()).toEqual(before)
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.activeElement).toBe(field(host, 'Won date'))
  })

  it('shows every missing field next to it and saves nothing', async () => {
    const { counts } = await open()
    const before = counts()
    await fill({ wonOn: '' })
    await click(button(host, 'Record won deal'))
    expect(counts()).toEqual(before)
    const errs = [...host.querySelectorAll('.err[role="alert"]')].map(e => e.textContent)
    expect(errs).toEqual([
      'Pick a company, or type a name to create one',
      'Enter a deal title',
      'Enter the date the deal was won',
      'Enter the contracted amount in dollars and cents, like 48000.00',
    ])
    expect(document.activeElement).toBe(companyInput())
  })

  it('from a company page the company is preselected; an existing contact can be picked', async () => {
    const { counts, newDeal, nav } = await open({ companyId: 'co1', businessId: 'ard' })
    const before = counts()
    expect(companyInput()?.value).toBe('Tidewater Foods')
    expect(companyInput()?.readOnly).toBe(true)
    const ct = field(host, 'Contact (optional)') as HTMLSelectElement
    expect([...ct.options].map(o => o.textContent)).toEqual(['No contact', 'Sam Lee, COO', '+ New contact'])
    await type(ct, 'ct1')
    await fill({ title: 'Platform build, phase 3', wonOn: '2026-08-01', amount: '48000' })
    await click(button(host, 'Record won deal'))
    expect(counts()).toMatchObject({ deals: before.deals + 1, companies: before.companies, contacts: before.contacts, plans: before.plans + 1 })
    expect(newDeal()).toMatchObject({ companyId: 'co1', contactIds: ['ct1'], status: 'won', close: '2026-08-01', value: 48_000 })
    expect(m.store.S.billingPlans.find(p => p.dealId === newDeal()?.id)?.contract).toMatchObject({ baselineCents: 4_800_000, engagementType: 'fixed-price', contractedOn: '2026-08-01' })
    expect(lastNav(nav)).toContain('"tab":"billing"')
  })

  it('a typed name that is already a company offers that company, never a copy', async () => {
    await open()
    await type(companyInput(), 'tidewater foods')
    expect(button(host, /^\+ Create/)).toBeUndefined()
    await click(host.querySelector('button[aria-label="Use Tidewater Foods"]'))
    expect(companyInput()?.value).toBe('Tidewater Foods')
    expect(text()).toContain('In your CRM')
    await click(button(host, 'Change'))
    expect(companyInput()?.readOnly).toBe(false)
  })

  it('a new contact on an existing company needs a name', async () => {
    const { counts } = await open({ companyId: 'co1', businessId: 'ard' })
    const before = counts()
    await type(field(host, 'Contact (optional)'), '__new')
    await fill({ title: 'Audit', wonOn: '2026-08-01', amount: '1000' })
    await click(button(host, 'Record won deal'))
    expect(counts()).toEqual(before)
    expect(text()).toContain('Enter the contact’s name, or leave the contact out')
  })
})

describe('Record a won deal outside the Ardorio contract', () => {
  it('an Ardorio member who is not an admin records the won value; no contract, no engagement type', async () => {
    const { newDeal, counts, nav } = await open({ companyId: 'co1', businessId: 'ard' }, 'sales')
    const before = counts()
    expect(host.querySelector('[aria-label="Engagement type"]')).toBeNull()
    expect(field(host, 'Contracted amount (A$, ex GST)')).toBeNull()
    expect(text()).toContain('An Ardorio admin sets the contract from the deal’s Billing tab.')
    await fill({ title: 'Discovery sprint', wonOn: '2026-09-01', amount: '15000' })
    await click(button(host, 'Record won deal'))
    expect(newDeal()).toMatchObject({ status: 'won', value: 15_000, recordedWonDirectly: true })
    expect(counts().plans).toBe(before.plans)
    expect(lastNav(nav)).not.toContain('"tab":"billing"')
  })

  it('another business records the deal value, with its MRR, in its own Won stage', async () => {
    const { newDeal, counts } = await open({ companyId: 'co1', businessId: 'ros' })
    const before = counts()
    expect(host.querySelector('[aria-label="Engagement type"]')).toBeNull()
    await fill({ title: 'Rostering rollout', wonOn: '2026-06-30', amount: '24000' })
    await click(button(host, 'Record won deal'))
    expect(newDeal()).toMatchObject({ businessId: 'ros', stageId: 'rs2', status: 'won', value: 24_000, mrr: 2000, recurring: true, recordedWonDirectly: true })
    expect(counts().plans).toBe(before.plans)
    expect(m.store.S.companyRels.find(r => r.companyId === 'co1' && r.businessId === 'ros')?.status).toBe('Customer')
  })
})

describe('Act.recordWonDeal guards', () => {
  it('refuses a future won date, or a contract from a non-admin, and writes nothing', async () => {
    const { counts } = await open({}, 'sales')
    const before = counts()
    const { Act } = await import('../../data/Act')
    const base = { businessId: 'ard' as const, company: { name: 'Kestrel Logistics' }, title: 'Build', amountCents: 100_00 }
    expect(Act.recordWonDeal({ ...base, wonOn: day(2) })).toEqual({ ok: false, error: WON_DATE_FUTURE })
    expect(Act.recordWonDeal({ ...base, wonOn: '2026-03-03', engagementType: 'fixed-price' })).toEqual({ ok: false, error: 'Only admins of Ardorio can set a contract' })
    expect(counts()).toEqual(before)
  })
})

describe('Entry points', () => {
  it('the Deals page header has Record won deal, which opens the dialog', async () => {
    await open()
    await act(async () => { m.ui.UI.close() })
    const { Deals } = await import('../../pages/deals/Deals')
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<><Deals route={{ page: 'deals' }} /><Hosts /></>) })
    await click(button(host, 'Record won deal'))
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Record a won deal')
  })

  it('the company page More menu has Record won deal, with the company preselected', async () => {
    await open()
    await act(async () => { m.ui.UI.close() })
    const { Company } = await import('../../pages/companies/Company')
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<><Company route={{ page: 'company', id: 'co1' }} /><Hosts /></>) })
    await click(host.querySelector('button[aria-label="More actions"]'))
    await click([...host.querySelectorAll('[role="menuitem"], button')].find(b => b.textContent?.trim() === 'Record won deal'))
    await settle()
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Record a won deal')
    expect(companyInput()?.value).toBe('Tidewater Foods')
  })
})
