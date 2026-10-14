import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { ardDeal, CLIENT, invoicingWorld, PLAN_DATA, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'
import { formatCents } from '../../shared/money'
import { termSchedule } from '../../shared/termSchedule'

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
const stages = [
  { id: 'sg1', name: 'Lead', prob: 10, required: [], won: false, lost: false },
  { id: 'sg2', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
  { id: 'sg3', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
]

/** The Won dialog on an open Ardorio deal, on its Contract step with Term agreement chosen. The fixture day is 9 Oct 2026. */
async function openTerm(plan?: Record<string, unknown>) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    pipelines: [rec('pl1', { businessId: 'ard', name: 'Pipeline', recurring: false, lostReasons: ['Price'], forecast: [], card: [], stages, fields: [] })],
    deals: [ardDeal('dl1', { status: 'open', stageId: 'sg1', probability: 50, forecast: 'Pipeline', closedAt: null })],
    ...(plan ? { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, ...plan })] } : {}),
  }))
  setArdRole(m, 'admin')
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  fakeApi({ 'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }) })
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('won', { id: 'dl1' }) })
  await settle()
  await click(button(host, 'Next: contract'))
  await type(field(host, 'Engagement type'), 'term-agreement')
  await settle()
  return { nav, deal: () => m.store.S.deals.find(d => d.id === 'dl1'), plan: () => m.store.S.billingPlans.find(p => p.dealId === 'dl1') }
}

const preview = (): string[] => [...host.querySelectorAll('table[aria-labelledby="term-preview-h"] tbody tr')].map(r => r.textContent ?? '')
const baseline = (): string => host.querySelector('[aria-label="Contract baseline"]')?.textContent ?? ''
const seg = (group: string, label: string): HTMLButtonElement | undefined => [...host.querySelectorAll(`[role="group"][aria-label="${group}"] button`)].find(b => b.textContent === label) as HTMLButtonElement | undefined

describe('Won dialog, Contract step: term agreement', () => {
  it('offers the term fields instead of the contracted amount, starting on the close date', async () => {
    await openTerm()
    expect(field(host, 'Contracted amount (A$, ex GST)')).toBeNull()
    expect((field(host, 'Start date') as HTMLInputElement).value).toBe('2026-10-09')
    expect((host.querySelector('[aria-label="Term years"]') as HTMLInputElement).value).toBe('5')
    expect(seg('Billed', 'Annually')?.getAttribute('aria-pressed')).toBe('true')
    expect(seg('Invoice timing', 'In advance')?.getAttribute('aria-pressed')).toBe('true')
    expect(seg('Yearly rise', 'No rise')?.getAttribute('aria-pressed')).toBe('true')
    expect(seg('Exit', 'Committed for the term')?.getAttribute('aria-pressed')).toBe('true')
    expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
    expect(text()).toContain('Enter the start date, term and annual fee to see the schedule.')
    expect(text()).toContain('Billing client linked: Tidewater Foods')
  })

  it('previews the schedule live, by year, with yearly totals and the baseline of build fee plus schedule', async () => {
    await openTerm()
    await type(field(host, 'Annual fee (A$, ex GST)'), '24000')
    await type(host.querySelector('[aria-label="Term years"]'), '3')
    await click(seg('Billed', 'Quarterly'))
    await click(seg('Yearly rise', 'Fixed %'))
    await type(host.querySelector('[aria-label="Yearly rise (%)"]'), '3')
    // 3 years of 4 quarters, plus a total row per year.
    const rows = preview()
    expect(rows).toHaveLength(15)
    expect(rows[0]).toContain('Year 1 of 3, quarter 1')
    expect(rows[0]).toContain('9 Oct 2026 to 8 Jan 2027')
    expect(rows[0]).toContain(formatCents(600000))
    expect(rows[4]).toBe(`Year 1 total${formatCents(2400000)}`)
    expect(rows[5]).toContain(formatCents(618000))
    expect(rows[9]).toBe(`Year 2 total${formatCents(2472000)}`)
    expect(rows[14]).toBe(`Year 3 total${formatCents(2546160)}`)
    expect(baseline()).toContain(`Contract ${formatCents(7418160)} ex GST`)
    expect(baseline()).toContain('schedule total')
    await click(button(host, '+ Add build fee milestone'))
    expect((host.querySelector('[aria-label="Build fee 1 label"]') as HTMLInputElement).value).toBe('Build fee')
    await type(host.querySelector('[aria-label="Build fee 1 amount"]'), '40000')
    expect(baseline()).toContain(`Contract ${formatCents(11418160)} ex GST`)
    expect(baseline()).toContain('build fee + schedule total')
    // In arrears the invoice date is the last day of the period.
    await click(seg('Invoice timing', 'In arrears'))
    expect(preview()[0]).toContain('8 Jan 2027')
    expect(text()).toContain('Each instalment is invoiced on the last day of its period.')
  })

  it('Win and set up billing wins the deal with the term, the build fee and the schedule, and opens the Billing tab', async () => {
    const { deal, plan, nav } = await openTerm()
    await type(field(host, 'Start date'), '2026-11-01')
    await type(field(host, 'Annual fee (A$, ex GST)'), '24,000')
    await click(seg('Yearly rise', 'CPI'))
    await type(host.querySelector('[aria-label="Assumed CPI (%)"]'), '2.5')
    await click(seg('Exit', 'Break at each anniversary'))
    await type(host.querySelector('[aria-label="Notice (days)"]'), '60')
    await click(button(host, '+ Add build fee milestone'))
    await type(host.querySelector('[aria-label="Build fee 1 amount"]'), '40000')
    await type(host.querySelector('[aria-label="Build fee 1 planned date"]'), '2026-11-15')
    await click(host.querySelector('input[type="checkbox"]'))
    await click(button(host, 'Win and set up billing'))
    expect(deal()?.status).toBe('won')
    expect(deal()?.value).toBe(60000)
    const term = { startDate: '2026-11-01', termMonths: 60, annualCents: 2400000, frequency: 'annual', timing: 'advance', escalation: 'cpi', escalationBp: 250, exit: 'break', breakNoticeDays: 60, autoDraft: false } as const
    const schedule = termSchedule(term)
    const total = schedule.reduce((a, x) => a + x.amountCents, 0)
    expect(plan()?.contract).toEqual({ baselineCents: 4000000 + total, engagementType: 'term-agreement', contractedOn: '2026-10-09', contractedBy: 'Me Myself', estimateAtWonCents: 6000000 })
    expect(plan()?.term).toEqual({ ...term, draftFrom: '2026-10-09' })
    expect(plan()?.milestones.map(x => [x.label, x.amountCents, x.kind])).toEqual([['Build fee', 4000000, undefined], ...schedule.map(x => [x.label, x.amountCents, 'instalment'])])
    expect(m.ui.UI.get().modals).toEqual([])
    const u = new URL((nav.mock.calls.at(-1) as [string])[0], 'https://x')
    expect([u.pathname, JSON.parse(u.searchParams.get('q') ?? '{}')]).toEqual(['/sales/deals/dl1', { tab: 'billing' }])
  })

  it('wins a term agreement worth more than $1,000,000 ex GST (5 years at $250,000), up to the term cap the API allows', async () => {
    const { deal, plan } = await openTerm()
    await type(field(host, 'Annual fee (A$, ex GST)'), '250000')
    expect(baseline()).toContain(`Contract ${formatCents(125_000_000)} ex GST`)
    expect(baseline()).toContain('Frozen when you save')
    await click(button(host, 'Win and set up billing'))
    expect(text()).not.toContain('close date')
    expect(deal()?.status).toBe('won')
    expect(plan()?.contract?.baselineCents).toBe(125_000_000)
    expect(plan()?.contract?.engagementType).toBe('term-agreement')
    expect(plan()?.milestones.filter(x => x.kind === 'instalment')).toHaveLength(5)
  })

  it('wins the largest term the fields allow: 10 years at $1,000,000 a year rising 20% a year', async () => {
    const { deal, plan } = await openTerm()
    await type(field(host, 'Annual fee (A$, ex GST)'), '1000000')
    await type(host.querySelector('[aria-label="Term years"]'), '10')
    await click(seg('Yearly rise', 'Fixed %'))
    await type(host.querySelector('[aria-label="Yearly rise (%)"]'), '20')
    const total = termSchedule({ startDate: '2026-10-09', termMonths: 120, annualCents: 100_000_000, frequency: 'annual', timing: 'advance', escalation: 'fixed', escalationBp: 2000 }).reduce((x, i) => x + i.amountCents, 0)
    expect(total).toBeGreaterThan(2_500_000_000)
    await click(button(host, 'Win and set up billing'))
    expect(deal()?.status).toBe('won')
    expect(plan()?.contract?.baselineCents).toBe(total)
  })

  it('counts the milestones already planned in the baseline and keeps them', async () => {
    const { plan } = await openTerm({ milestones: PLAN_DATA.milestones.slice(0, 1) })
    await type(field(host, 'Annual fee (A$, ex GST)'), '10000')
    await type(host.querySelector('[aria-label="Term years"]'), '1')
    expect(baseline()).toContain(`Contract ${formatCents(1800000 + 1000000)} ex GST`)
    expect(baseline()).toContain('milestones already planned + schedule total')
    await click(button(host, 'Win and set up billing'))
    expect(plan()?.contract?.baselineCents).toBe(2800000)
    expect(plan()?.milestones.map(x => x.id)).toEqual(['m1', 'inst_1_1'])
  })

  it('says what to fix, field by field, and wins nothing', async () => {
    const { deal, plan } = await openTerm()
    await click(button(host, 'Win and set up billing'))
    expect(text()).toContain('Enter the year-1 fee in dollars and cents')
    expect(field(host, 'Annual fee (A$, ex GST)')?.getAttribute('aria-invalid')).toBe('true')
    await type(field(host, 'Annual fee (A$, ex GST)'), '24000')
    await type(host.querySelector('[aria-label="Term years"]'), '11')
    await click(seg('Yearly rise', 'Fixed %'))
    await type(host.querySelector('[aria-label="Yearly rise (%)"]'), '25')
    await click(button(host, 'Win and set up billing'))
    expect(text()).toContain('The term is 1 month to 10 years')
    expect(text()).toContain('The yearly rise is 0% to 20%')
    expect(deal()?.status).toBe('open')
    expect(plan()).toBeUndefined()
  })
})
