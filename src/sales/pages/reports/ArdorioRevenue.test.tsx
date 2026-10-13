import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RevenueReport } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

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

// The fixture clock is 9 Oct 2026 (Melbourne). The Ardorio revenue tab opens on "This financial year": 1 Jul to 9 Oct.
const Q_ = (from: string, to: string, source = 'all'): string => `GET /sales/reports/revenue?business=ard&from=${from}&to=${to}&source=${source}`
const ROUTE = Q_('2026-07-01', '2026-10-09')
const MONTH = Q_('2026-10-01', '2026-10-09')
const QUARTER = MONTH
const PREV = Q_('2025-07-01', '2026-06-30')
const zero = (month: string) => ({ month, invoicedCents: 0, collectedCents: 0, externalInvoicedCents: 0, externalCollectedCents: 0 })
// The API lists every month of the range.
const REPORT: RevenueReport = {
  from: '2026-07-01', to: '2026-10-09', source: 'all',
  months: [zero('2026-07'), zero('2026-08'), zero('2026-09'), { month: '2026-10', invoicedCents: 1800000, collectedCents: 960000, externalInvoicedCents: 800000, externalCollectedCents: 0 }],
  invoicedCents: 1800000, collectedCents: 960000, outstandingCents: 2250000, overdueCents: 450000,
  recordedLate: [{ month: '2026-10', count: 2, cents: 1240000 }],
}
const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#654321', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl2', industries: [], roles: [] })
const CONTRACT = { baselineCents: 4000000, engagementType: 'fixed-price', contractedOn: '2026-10-05', contractedBy: 'Me Myself', estimateAtWonCents: 3800000 }
const VO = (id: string, amountCents: number, status: string, decidedAt?: string) => ({ id, label: id, amountCents, reason: 'scope', status, createdAt: '2026-10-06T01:00:00.000Z', createdBy: 'Me Myself', ...(decidedAt ? { decidedAt, decidedBy: 'Me Myself' } : {}) })
const ARD_ROUTE = { page: 'reports', q: { tab: 'ardorio' } }

const section = (): ParentNode => host.querySelector('section[data-ard-revenue]') ?? document.createDocumentFragment()
const tileEl = (label: string): Element | undefined => [...section().querySelectorAll('.kpi')].find(x => x.querySelector('.l')?.textContent === label)
const tile = (label: string): { v: string; s: string } | null => {
  const t = tileEl(label)
  return t ? { v: t.querySelector('.v')?.textContent ?? '', s: t.querySelector('.s')?.textContent ?? '' } : null
}
const text = (): string => host.textContent ?? ''
const seg = (label: string): ParentNode => host.querySelector(`[role="group"][aria-label="${label}"]`) as ParentNode
const segOpts = (label: string): string[] => [...(seg(label)?.querySelectorAll('button') ?? [])].map(b => b.textContent ?? '')
const table = (): HTMLTableElement | null => host.querySelector('table[aria-label="Ardorio revenue by month"]')
const rows = (): string[][] => [...(table()?.querySelectorAll('tbody tr') ?? [])].map(r => [...r.querySelectorAll('td')].map(td => td.textContent ?? ''))
const foot = (): string[] => [...(table()?.querySelectorAll('tfoot td') ?? [])].map(td => td.textContent ?? '')
const goalsCard = (): Element | undefined => [...host.querySelectorAll('.card')].find(c => c.querySelector('.card-h h3')?.textContent?.startsWith('Against this'))
const bullet = (label: string): string => goalsCard()?.querySelector(`[data-goal="${label}"] .val`)?.textContent ?? ''

async function show(o: { role?: Parameters<typeof setArdRole>[1]; others?: Parameters<typeof setArdRole>[2]; routes?: Parameters<typeof fakeApi>[0]; goals?: unknown[]; ros?: boolean; ws?: string; route?: unknown } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    ...(o.ros ? { businesses: [invoicingWorld().collections.businesses[0], ROS] } : {}),
    deals: [
      // Open, $50,000 at 50%: $25,000 weighted.
      invoicingWorld().collections.deals[0],
      // Won on 5 Oct, estimated at $38,000, contracted at $40,000: won value is the contract. VO-1 approved later is not a booking.
      ardDeal('dl2', { value: 38000, closedAt: '2026-10-05T09:00:00', close: '2026-10-05' }),
      // Won on 28 Jul with a $90,000 contract: this financial year, not this quarter.
      ardDeal('dl3', { value: 90000 }),
      // Archived won deal in range: never counted.
      ardDeal('dl4', { value: 70000, closedAt: '2026-10-06T09:00:00', archived: true }),
      // Recorded directly as won in August, no contract: its deal value.
      ardDeal('dl5', { value: 12000, closedAt: null, close: '2026-08-14', recordedWonDirectly: true, recordedWonBy: 'Me Myself' }),
      // Won in May: last financial year.
      ardDeal('dl6', { value: 20000, closedAt: '2026-05-12T09:00:00' }),
    ],
    billingPlans: [
      rec('bp_dl2', { dealId: 'dl2', businessId: 'ard', milestones: [], contract: CONTRACT, variations: [VO('v1', 500000, 'approved', '2026-10-07T01:00:00.000Z'), VO('v2', 240000, 'proposed')] }),
      rec('bp_dl3', { dealId: 'dl3', businessId: 'ard', milestones: [], contract: { ...CONTRACT, contractedOn: '2026-07-28', baselineCents: 9000000 }, variations: [VO('v3', 200000, 'approved', '2026-10-02T01:00:00.000Z')] }),
      rec('bp_dl4', { dealId: 'dl4', businessId: 'ard', milestones: [], contract: { ...CONTRACT, baselineCents: 7000000 } }),
    ],
    goals: (o.goals ?? []) as never,
  }))
  setArdRole(m, o.role ?? 'admin', o.others)
  if (o.ws) m.store.S.session.ws = o.ws as never
  m.ui.bindNavigate(vi.fn())
  const api = fakeApi(o.routes ?? { [ROUTE]: () => json(200, REPORT) })
  const { Reports } = await import('./Reports')
  const route = (o.route === undefined ? ARD_ROUTE : o.route) as never
  await act(async () => { root.render(<Reports route={route} />) })
  await settle(4)
  return api
}

const GOAL = (target: number, period = 'year', metric = 'won_value', id = `g-${metric}-${period}`) => rec(id, { businessId: 'ard', ownerType: 'team', ownerId: 't1', metric, target, period, createdBy: 'u-me' })

describe('Reports › Ardorio revenue (board 5)', () => {
  it('is its own Reports tab, with the board’s period control, and the Overview never asks for the revenue report', async () => {
    const api = await show({ route: null })
    const tabs = [...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)
    expect(tabs).toEqual(['Overview', 'Ardorio revenue'])
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Overview')
    expect(section().querySelector('.kpi')).toBeNull()
    expect(api.calls.filter(c => c.path.startsWith('/sales/reports/revenue'))).toHaveLength(0)

    await click(button(host, 'Ardorio revenue'))
    await settle(4)
    expect(host.querySelector('h1')?.textContent).toBe('Ardorio revenue')
    expect(host.querySelector('.crumb')?.textContent).toBe('Reports › Ardorio revenue')
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Ardorio revenue')
    expect(segOpts('Period')).toEqual(['This financial year', 'Previous financial year', 'Quarter', 'Month'])
    expect(button(seg('Period'), 'This financial year')?.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('.sub')?.textContent).toContain('This financial year, 1 Jul 2026 to 9 Oct 2026.')
    expect(api.count(ROUTE)).toBe(1)
    expect(button(host, 'Goals')).toBeTruthy()
    expect(button(host, 'By deal')).toBeTruthy()
  })

  it('shows won value from the contracts, invoiced, collected, outstanding, overdue and coverage, and no contracted tile or chart', async () => {
    const api = await show()
    expect(api.count(ROUTE)).toBe(1)
    // $40,000 (dl2's contract, not its $38,000 estimate) + $90,000 (dl3) + $12,000 (dl5, no contract).
    expect(tile('Won value')).toEqual({ v: '$142,000', s: 'bookings · 3 deals won' })
    expect(tile('Invoiced')).toEqual({ v: '$18,000', s: 'By issue date · $8,000 external' })
    expect(tile('Collected')).toEqual({ v: '$9,600', s: 'By paid date' })
    expect(tile('Outstanding')).toEqual({ v: '$22,500', s: 'As of now' })
    expect(tile('Overdue')).toEqual({ v: '$4,500', s: 'As of now' })
    expect(tileEl('Pipeline coverage')).toBeTruthy()
    expect(tile('Contracted')).toBeNull()
    expect(host.querySelector('[aria-label="Ardorio invoiced and collected by month"]')).toBeNull()
    expect(text()).toContain('October 2026 includes 2 records entered later ($12,400)')
    expect(text()).not.toMatch(/\bMRR\b|\bARR\b/)
  })

  it('has a By month table with won value per month and a year to date total', async () => {
    await show()
    expect([...(table()?.querySelectorAll('thead th') ?? [])].map(th => th.textContent)).toEqual(['Month', 'Won value', 'Invoiced', 'Collected', 'Includes'])
    expect(rows()).toEqual([
      ['Jul 2026', '$90,000', '$0', '$0', ''],
      ['Aug 2026', '$12,000', '$0', '$0', 'Recorded directly $12,000 won'],
      ['Sep 2026', '$0', '$0', '$0', ''],
      ['Oct 2026 (to date)', '$40,000', '$18,000', '$9,600', 'External $8,000 invoiced'],
    ])
    expect(foot()).toEqual(['Year to date', '$142,000', '$18,000', '$9,600', ''])
  })

  it('compares with this year’s goals: won value, invoiced and collected bullets, with the goal as the marker', async () => {
    await show({ goals: [GOAL(154500), GOAL(3600000, 'year', 'invoiced_cents'), GOAL(1, 'month', 'collected_cents')] })
    expect(goalsCard()?.querySelector('h3')?.textContent).toBe('Against this year’s goals')
    expect(bullet('Won value')).toBe('$142,000 of $154,500 · 92%')
    expect(bullet('Invoiced')).toBe('$18,000 of $36,000 · 50%')
    // A monthly collected goal is not this year's.
    expect(bullet('Collected')).toBe('No goal set')
    expect(goalsCard()?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Won value $142,000 of $154,500 goal, 92 percent')
    expect(goalsCard()?.textContent).toContain('The black marker is the goal. The year is 4 of 12 months in (33%).')
    // Coverage is against the year's won value goal: $25,000 weighted ÷ $12,500 still needed.
    expect(tile('Pipeline coverage')).toEqual({ v: '2.0×', s: 'Needed: $12,500' })
    const t = tileEl('Pipeline coverage')
    const desc = host.querySelector(`[id="${t?.getAttribute('aria-describedby')}"]`)?.textContent
    expect(desc).toBe('Pipeline coverage = weighted open Ardorio pipeline ($25,000) ÷ won value still needed to reach this year’s goal ($12,500).')
    expect(t?.getAttribute('title')).toBe(desc)
  })

  it('asks for a year goal it can now set, and works out coverage for the quarter and the month from their own goals', async () => {
    const api = await show({ goals: [GOAL(52000, 'month'), GOAL(30000, 'quarter')], routes: { [ROUTE]: () => json(200, REPORT), [MONTH]: () => json(200, { ...REPORT, months: [REPORT.months[3]] }) } })
    expect(tile('Pipeline coverage')).toEqual({ v: '—', s: 'Set a won value goal for the financial year to see coverage' })
    expect(goalsCard()?.textContent).toContain('No Ardorio goals for this financial year')
    expect(button(goalsCard() as ParentNode, 'Set goal')).toBeTruthy()

    await click(button(seg('Period'), 'Quarter'))
    await settle(4)
    expect(api.count(QUARTER)).toBe(1)
    // Only dl2 was won this quarter: $40,000 of a $30,000 goal.
    expect(tile('Pipeline coverage')).toEqual({ v: 'Goal met', s: 'Won $40,000 of $30,000' })
    expect(goalsCard()?.querySelector('h3')?.textContent).toBe('Against this quarter’s goals')
    expect(goalsCard()?.textContent).toContain('The quarter is 1 of 3 months in (33%).')
    expect(foot()[0]).toBe('Quarter to date')

    await click(button(seg('Period'), 'Month'))
    await settle(4)
    // $25,000 weighted ÷ ($52,000 − $40,000).
    expect(tile('Pipeline coverage')).toEqual({ v: '2.0×', s: 'Needed: $12,000' })
    expect(goalsCard()?.textContent).toContain('The month is 9 of 31 days in (29%).')
    expect(foot()).toEqual(['Month to date', '$40,000', '$18,000', '$9,600', ''])
  })

  it('shows the previous financial year without goals or coverage, as board 11 does', async () => {
    const months = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
    const api = await show({ goals: [GOAL(154500)], routes: { [ROUTE]: () => json(200, REPORT), [PREV]: () => json(200, { ...REPORT, from: '2025-07-01', to: '2026-06-30', months: months.map(zero), recordedLate: [] }) } })
    await click(button(seg('Period'), 'Previous financial year'))
    await settle(4)
    expect(api.count(PREV)).toBe(1)
    expect(tileEl('Pipeline coverage')).toBeUndefined()
    expect(goalsCard()).toBeUndefined()
    expect(tile('Won value')).toEqual({ v: '$20,000', s: 'bookings · 1 deal won' })
    expect(rows()).toHaveLength(12)
    expect(rows()[10].slice(0, 2)).toEqual(['May 2026', '$20,000'])
    expect(foot()[0]).toBe('Jul 2025 to Jun 2026')
  })

  it('renames booked value to Won value and shows no recurring tile on the Overview when only Ardorio is in view', async () => {
    await show({ route: null })
    const labels = [...host.querySelectorAll('.kpi .l')].map(l => l.textContent)
    expect(labels).toContain('Won value')
    expect(labels).not.toContain('Won revenue')
    expect(labels).not.toContain('Recurring (won ARR)')
    expect(text()).not.toMatch(/\bMRR\b|\bARR\b/)
  })

  it('keeps the recurring tile when another business is in view, and still offers the Ardorio tab', async () => {
    await show({ ros: true, role: 'super', route: null })
    const labels = [...host.querySelectorAll('.kpi .l')].map(l => l.textContent)
    expect(labels).toContain('Recurring (won ARR)')
    expect(labels).toContain('Won value')
    expect(button(host, 'Ardorio revenue')).toBeTruthy()
  })

  it('asks again with the source the person picks, and keeps comparing goals with all sources', async () => {
    const ext = Q_('2026-07-01', '2026-10-09', 'external')
    const api = await show({ goals: [GOAL(3600000, 'year', 'invoiced_cents')], routes: { [ROUTE]: () => json(200, REPORT), [ext]: () => json(200, { ...REPORT, source: 'external', invoicedCents: 800000, recordedLate: [] }) } })
    expect(segOpts('Source')).toEqual(['All', 'SalesOS', 'External'])
    await click(button(seg('Source'), 'External'))
    await settle(4)
    expect(api.count(ext)).toBe(1)
    expect(button(seg('Source'), 'External')?.getAttribute('aria-pressed')).toBe('true')
    expect(tile('Invoiced')?.v).toBe('$8,000')
    expect(bullet('Invoiced')).toBe('$18,000 of $36,000 · 50%')
    expect(text()).not.toContain('records entered later')
  })

  it('offers no tab to people who are not Ardorio admins, even from a link, and never asks the server', async () => {
    const api = await show({ role: 'manager' })
    expect(button(host, 'Ardorio revenue')).toBeUndefined()
    expect(host.querySelector('h1')?.textContent).toBe('Reports')
    expect(tile('Won value')).toBeNull()
    expect(api.calls.filter(c => c.path.startsWith('/sales/reports/revenue'))).toHaveLength(0)
    expect(text()).not.toContain('admins')
  })

  it('shows loading, then a retryable error, keeping the figures it has from the records', async () => {
    let n = 0
    let release: (r: Response) => void = () => undefined
    await show({ routes: { [ROUTE]: () => (++n === 1 ? json(500, { error: 'Database unavailable' }) : new Promise<Response>(r => { release = r })) } })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load invoiced and collected figures. Database unavailable')
    expect(tile('Invoiced')?.v).toBe('—')
    expect(tile('Won value')?.v).toBe('$142,000')
    expect(rows()[0].slice(0, 3)).toEqual(['Jul 2026', '$90,000', '—'])
    await click(button(host, 'Try again'))
    await settle(2)
    expect(tile('Invoiced')?.v).toBe('…')
    expect(tileEl('Invoiced')?.getAttribute('aria-busy')).toBe('true')
    release(json(200, REPORT))
    await settle(4)
    expect(tile('Invoiced')?.v).toBe('$18,000')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('says the report is not available yet on a server without it', async () => {
    await show({ routes: {} })
    expect(text()).toContain('The revenue report is not available on this server yet.')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(tile('Won value')?.v).toBe('$142,000')
  })

  it('says so when the server refuses the caller', async () => {
    await show({ routes: { [ROUTE]: () => json(403, { error: 'Admins only', code: 'ROLE_REQUIRED' }) } })
    expect(text()).toContain('The Ardorio revenue report is for Ardorio admins')
    expect(tile('Invoiced')).toBeNull()
  })
})
