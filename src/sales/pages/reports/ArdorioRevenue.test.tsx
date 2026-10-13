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

// The fixture clock is 9 Oct 2026 (Melbourne). Reports opens on "This quarter": 1 Oct to 9 Oct.
const ROUTE = 'GET /sales/reports/revenue?business=ard&from=2026-10-01&to=2026-10-09&source=all'
const REPORT: RevenueReport = {
  from: '2026-10-01', to: '2026-10-09', source: 'all',
  months: [{ month: '2026-10', invoicedCents: 1800000, collectedCents: 960000, externalInvoicedCents: 800000, externalCollectedCents: 0 }],
  invoicedCents: 1800000, collectedCents: 960000, outstandingCents: 2250000, overdueCents: 450000,
  recordedLate: [{ month: '2026-10', count: 2, cents: 1240000 }],
}
const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#654321', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl2', industries: [], roles: [] })
const CONTRACT = { baselineCents: 4000000, engagementType: 'fixed-price', contractedOn: '2026-10-05', contractedBy: 'Me Myself', estimateAtWonCents: 4000000 }
const VO = (id: string, amountCents: number, status: string, decidedAt?: string) => ({ id, label: id, amountCents, reason: 'scope', status, createdAt: '2026-10-06T01:00:00.000Z', createdBy: 'Me Myself', ...(decidedAt ? { decidedAt, decidedBy: 'Me Myself' } : {}) })

/** A tile of the Ardorio revenue section (the page's own Revenue row also has a Won value tile). */
const section = (): ParentNode => host.querySelector('section[aria-labelledby="ard-revenue-h"]') ?? document.createDocumentFragment()
const tileEl = (label: string): Element | undefined => [...section().querySelectorAll('.kpi')].find(x => x.querySelector('.l')?.textContent === label)
const tile = (label: string): { v: string; s: string } | null => {
  const t = tileEl(label)
  return t ? { v: t.querySelector('.v')?.textContent ?? '', s: t.querySelector('.s')?.textContent ?? '' } : null
}
const text = (): string => host.textContent ?? ''

async function show(o: { role?: Parameters<typeof setArdRole>[1]; others?: Parameters<typeof setArdRole>[2]; routes?: Parameters<typeof fakeApi>[0]; goals?: unknown[]; ros?: boolean; ws?: string } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    ...(o.ros ? { businesses: [invoicingWorld().collections.businesses[0], ROS] } : {}),
    deals: [
      // Open, $50,000 at 50%: $25,000 weighted.
      invoicingWorld().collections.deals[0],
      // Won on 5 Oct for $40,000 with a $40,000 contract, VO-1 +$5,000 approved in range, VO-2 proposed.
      ardDeal('dl2', { value: 40000, closedAt: '2026-10-05T09:00:00', close: '2026-10-05' }),
      // Won in July: not in the range, but its variation approved on 2 Oct counts as contracted.
      ardDeal('dl3', { value: 90000 }),
      // Archived won deal in range: never counted.
      ardDeal('dl4', { value: 70000, closedAt: '2026-10-06T09:00:00', archived: true }),
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
  await act(async () => { root.render(<Reports />) })
  await settle(4)
  return api
}

const GOAL = (target: number, period = 'quarter') => rec('g1', { businessId: 'ard', ownerType: 'team', ownerId: 't1', metric: 'won_value', target, period, createdBy: 'u-me' })

describe('Reports: Ardorio revenue section', () => {
  it('shows won value, contracted, invoiced, collected, outstanding and overdue for an Ardorio admin', async () => {
    const api = await show()
    expect(api.count(ROUTE)).toBe(1)
    expect(host.querySelector('#ard-revenue-h')?.textContent).toBe('Ardorio revenue')
    expect(tile('Won value')).toEqual({ v: '$40,000', s: '1 deal won · bookings' })
    // $40,000 baseline + $5,000 VO-1 (dl2) + $2,000 VO-3 approved in range on the July contract (dl3).
    expect(tile('Contracted')?.v).toBe('$47,000')
    expect(tile('Invoiced')).toEqual({ v: '$18,000', s: 'By issue date' })
    expect(tile('Collected')).toEqual({ v: '$9,600', s: 'By paid date' })
    expect(tile('Outstanding')).toEqual({ v: '$22,500', s: 'As of now' })
    expect(tile('Overdue')).toEqual({ v: '$4,500', s: 'As of now' })
    expect(text()).toContain('October 2026 includes 2 records entered later ($12,400)')
    expect(text()).toContain('External $8,000 invoiced')
    // Chart and table both carry the month, so the split is never colour alone.
    expect(host.querySelector('[aria-label="Ardorio invoiced and collected by month"]')).toBeTruthy()
    const row = [...host.querySelectorAll('table[aria-label="Ardorio revenue by month"] tbody tr')].map(r => r.textContent)
    expect(row[0]).toContain('Oct 2026')
  })

  it('renames booked value to Won value and shows no recurring tile when only Ardorio is in view', async () => {
    await show()
    const labels = [...host.querySelectorAll('.kpi .l')].map(l => l.textContent)
    expect(labels).toContain('Won value')
    expect(labels).not.toContain('Won revenue')
    expect(labels).not.toContain('Recurring (won ARR)')
    expect(text()).not.toMatch(/\bMRR\b|\bARR\b/)
  })

  it('keeps the recurring tile when another business is in view', async () => {
    await show({ ros: true, role: 'super' })
    const labels = [...host.querySelectorAll('.kpi .l')].map(l => l.textContent)
    expect(labels).toContain('Recurring (won ARR)')
    expect(labels).toContain('Won value')
    expect(host.querySelector('#ard-revenue-h')).toBeTruthy()
  })

  it('works out pipeline coverage against the won value goal, with the formula alongside', async () => {
    // Goal $52,000, won $40,000: $12,000 still needed. Weighted open pipeline $25,000: 2.0×.
    await show({ goals: [GOAL(52000)] })
    expect(tile('Pipeline coverage')).toEqual({ v: '2.0×', s: 'Needed: $12,000' })
    const t = tileEl('Pipeline coverage')
    const desc = host.querySelector(`[id="${t?.getAttribute('aria-describedby')}"]`)?.textContent
    expect(desc).toBe('Pipeline coverage = weighted open Ardorio pipeline ($25,000) ÷ won value still needed to reach the goal ($12,000).')
    expect(t?.getAttribute('title')).toBe(desc)
  })

  it('asks for a won value goal when there is none for the period, and says when it is met', async () => {
    await show({ goals: [GOAL(52000, 'month')] })
    expect(tile('Pipeline coverage')).toEqual({ v: '—', s: 'Set a won value goal to see coverage' })
    act(() => root.unmount())
    root = createRoot(host)
    await show({ goals: [GOAL(30000)] })
    expect(tile('Pipeline coverage')).toEqual({ v: 'Goal met', s: 'Won $40,000 of $30,000' })
  })

  it('asks again with the source the person picks', async () => {
    const ext = ROUTE.replace('source=all', 'source=external')
    const api = await show({ routes: { [ROUTE]: () => json(200, REPORT), [ext]: () => json(200, { ...REPORT, source: 'external', invoicedCents: 800000, recordedLate: [] }) } })
    const seg = host.querySelector('[role="group"][aria-label="Source"]')
    expect([...(seg?.querySelectorAll('button') ?? [])].map(b => b.textContent)).toEqual(['All', 'SalesOS', 'External'])
    await click(button(seg as ParentNode, 'External'))
    await settle(4)
    expect(api.count(ext)).toBe(1)
    expect(button(seg as ParentNode, 'External')?.getAttribute('aria-pressed')).toBe('true')
    expect(tile('Invoiced')?.v).toBe('$8,000')
    expect(text()).not.toContain('records entered later')
  })

  it('shows nothing to people who are not Ardorio admins, and never asks the server', async () => {
    const api = await show({ role: 'manager' })
    expect(host.querySelector('#ard-revenue-h')).toBeNull()
    expect(tile('Contracted')).toBeNull()
    expect(api.calls.filter(c => c.path.startsWith('/sales/reports/revenue'))).toHaveLength(0)
    expect(text()).not.toContain('admins')
  })

  it('shows loading, then a retryable error, keeping the figures it has from the records', async () => {
    let n = 0
    let release: (r: Response) => void = () => undefined
    await show({ routes: { [ROUTE]: () => (++n === 1 ? json(500, { error: 'Database unavailable' }) : new Promise<Response>(r => { release = r })) } })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load invoiced and collected figures. Database unavailable')
    expect(tile('Invoiced')?.v).toBe('—')
    expect(tile('Won value')?.v).toBe('$40,000')
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
    expect(tile('Contracted')?.v).toBe('$47,000')
  })

  it('says so when the server refuses the caller', async () => {
    await show({ routes: { [ROUTE]: () => json(403, { error: 'Admins only', code: 'ROLE_REQUIRED' }) } })
    expect(text()).toContain('The Ardorio revenue report is for Ardorio admins')
    expect(tile('Invoiced')).toBeNull()
  })
})
