import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RevenueReport } from '../../api/contract'
import { button, click, field, settle, type } from '../../testing/dom'
import { changes, rec, user } from '../../testing/fixtures'
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

// The fixture clock is Fri 9 Oct 2026 (Melbourne): this week is Mon 5 Oct to today, last week 28 Sep to 4 Oct.
const WEEK = 'GET /sales/reports/revenue?business=ard&from=2026-10-05&to=2026-10-09&source=all'
const LAST_WEEK = 'GET /sales/reports/revenue?business=ard&from=2026-09-28&to=2026-10-04&source=all'
const report = (invoicedCents: number, collectedCents: number): RevenueReport => ({
  from: '', to: '', source: 'all', months: [], invoicedCents, collectedCents, outstandingCents: 999999999, overdueCents: 999999999, recordedLate: [],
})
const ROUTES = { [WEEK]: () => json(200, report(1250050, 600000)), [LAST_WEEK]: () => json(200, report(1000000, 800000)) }

const goal = (id: string, over: Record<string, unknown>) => rec(id, { businessId: 'ard', ownerType: 'user', ownerId: 'u-me', metric: 'calls', target: 20, period: 'week', createdBy: 'u-me', ...over })
const GOALS = [
  goal('g-won', { metric: 'won_value', target: 50000 }),
  goal('g-team-won', { metric: 'won_value', ownerType: 'team', ownerId: 't1', target: 100000 }),
  goal('g-inv', { metric: 'invoiced_cents', ownerType: 'team', ownerId: 't1', target: 2000000 }),
  goal('g-col', { metric: 'collected_cents', target: 1200000 }),
  goal('g-calls', { metric: 'calls', target: 20 }),
]

async function show(o: { role?: Parameters<typeof setArdRole>[1]; routes?: Parameters<typeof fakeApi>[0]; goals?: unknown[] } = {}) {
  m = await loadSales()
  const w = invoicingWorld({
    teams: [rec('t1', { name: 'Ardorio team', businessId: 'ard', managerId: 'u-me', members: ['u-me', 'u-jan'] })],
    deals: [
      // Mine, won this week: counted for me and for the team.
      ardDeal('d1', { value: 40000, closedAt: '2026-10-06T09:00:00' }),
      // Won this week with no closedAt: the close date counts.
      ardDeal('d2', { value: 2500, closedAt: null, close: '2026-10-07' }),
      // A teammate's: the team only.
      ardDeal('d3', { value: 10000, closedAt: '2026-10-08T11:00:00', ownerId: 'u-jan' }),
      // Not counted: archived, still open, another business, someone outside the team.
      ardDeal('d4', { value: 70000, closedAt: '2026-10-06T09:00:00', archived: true }),
      ardDeal('d5', { value: 80000, closedAt: null, close: '2026-10-07', status: 'open' }),
      ardDeal('d6', { value: 90000, closedAt: '2026-10-06T09:00:00', businessId: 'ros' }),
      ardDeal('d7', { value: 30000, closedAt: '2026-10-06T09:00:00', ownerId: 'u-out' }),
      // Mine, won last week: the previous period.
      ardDeal('d8', { value: 30000, closedAt: '2026-10-02T15:00:00' }),
      // Mine, won in June: the previous financial year.
      ardDeal('d9', { value: 15000, closedAt: '2026-06-30T16:00:00' }),
    ],
    goals: (o.goals ?? GOALS) as never,
  })
  w.users.push(user('u-jan', 'Jansen'), user('u-out', 'Outsider'))
  m.bootstrap.hydrate(w)
  setArdRole(m, o.role ?? 'admin')
  m.ui.bindNavigate(vi.fn())
  const api = fakeApi(o.routes ?? ROUTES)
  const { Goals } = await import('./Goals')
  await act(async () => { root.render(<Goals />) })
  await settle(4)
  return api
}

/** The cells of the goal row whose Metric cell reads `metric`, in the table titled `table`. */
function cells(table: 'Individual targets' | 'Team targets', metric: string): string[] {
  const card = [...host.querySelectorAll('.card')].find(c => c.textContent?.startsWith(table))
  const row = [...(card?.querySelectorAll('tbody tr') ?? [])].find(r => [...r.querySelectorAll('td')].some(td => td.textContent === metric))
  return [...(row?.querySelectorAll('td') ?? [])].map(td => td.textContent ?? '')
}
// Columns: owner, business, metric, target, actual, progress, remaining, prev, actions.

describe('Goals: money metrics', () => {
  it('measures won value from won deals of the owner, and shows it as money', async () => {
    await show()
    const mine = cells('Individual targets', 'Won value')
    expect(mine.slice(3, 8)).toEqual(['$50,000', '$42,500', '85%', '$7,500', '$30,000 ▲$12,500'])
    const team = cells('Team targets', 'Won value')
    // Me and Jansen; not the archived, open, Rosterio or outsider deals.
    expect(team.slice(3, 7)).toEqual(['$100,000', '$52,500', '53%', '$47,500'])
    // Progress is a labelled bar with the percentage in text, never colour alone.
    expect(host.querySelectorAll('[role="progressbar"]').length).toBeGreaterThanOrEqual(4)
  })

  it('reads invoiced and collected from the revenue report for the goal range, business-wide', async () => {
    const api = await show()
    expect(api.count(WEEK)).toBe(1)
    expect(api.count(LAST_WEEK)).toBe(1)
    // A team goal: the report is for all of Ardorio, whoever owns the deals.
    expect(cells('Team targets', 'Invoiced').slice(3, 8)).toEqual(['$20,000', '$12,500.50', '63%', '$7,499.50', '$10,000 ▲$2,500.50'])
    expect(cells('Individual targets', 'Collected').slice(3, 8)).toEqual(['$12,000', '$6,000', '50%', '$6,000', '$8,000 ▼$2,000'])
    // Activity goals are unchanged.
    expect(cells('Individual targets', 'Calls').slice(3, 5)).toEqual(['20', '0'])
    expect(host.textContent).toContain('Invoiced and collected are for all of Ardorio, ex GST')
  })

  it('shows a dash with the reason, and never calls the report, for someone who is not an Ardorio admin', async () => {
    const api = await show({ role: 'manager' })
    expect(api.calls.filter(c => c.path.startsWith('/sales/reports/revenue'))).toEqual([])
    const inv = cells('Team targets', 'Invoiced')
    expect(inv.slice(3, 8)).toEqual(['$20,000', '—', 'Only Ardorio admins can see invoiced and collected.', '—', '—'])
    // Won value is not report money: it still shows.
    expect(cells('Individual targets', 'Won value')[4]).toBe('$42,500')
  })

  it('says why when the server refuses, and offers a retry when it fails', async () => {
    await show({ routes: { [WEEK]: () => json(403, { error: 'Admins only', code: 'ROLE_REQUIRED' }), [LAST_WEEK]: () => json(200, report(0, 0)) } })
    expect(cells('Team targets', 'Invoiced').slice(4, 6)).toEqual(['—', 'The Ardorio revenue report is for admins of the Ardorio business.'])
    expect(button(host, 'Try again')).toBeUndefined()

    act(() => root.unmount())
    root = createRoot(host)
    let ok = false
    const api = await show({ routes: { [WEEK]: () => (ok ? json(200, report(1250050, 600000)) : json(500, { error: 'Database unavailable', code: 'INTERNAL' })), [LAST_WEEK]: () => json(200, report(0, 0)) } })
    expect(cells('Team targets', 'Invoiced')[5]).toContain('Database unavailable')
    ok = true
    await click(button(host, 'Try again'))
    await settle(4)
    expect(api.count(WEEK)).toBe(2)
    expect(cells('Team targets', 'Invoiced')[4]).toBe('$12,500.50')
  })

  it('measures a financial year goal from 1 July, against the whole financial year before', async () => {
    await show({ goals: [...GOALS, goal('g-fy', { metric: 'won_value', target: 600000, period: 'year' }), goal('g-q', { metric: 'calls', target: 300, period: 'quarter' })] })
    const seg = host.querySelector('.ph [role="group"]') as ParentNode
    expect([...seg.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Financial year'])
    // The weekly view leaves the year goal out.
    expect(cells('Individual targets', 'Won value')[3]).toBe('$50,000')
    await click(button(seg, 'Financial year'))
    // d1 + d2 + d8 since 1 July 2026; d9 (30 June) is last financial year.
    expect(cells('Individual targets', 'Won value').slice(3, 8)).toEqual(['$600,000', '$72,500', '12%', '$527,500', '$15,000 ▲$57,500'])
    await click(button(seg, 'Quarterly'))
    expect(cells('Individual targets', 'Calls').slice(3, 5)).toEqual(['300', '0'])
  })

  it('says it is loading while the report is on its way', async () => {
    await show({ routes: { [WEEK]: () => new Promise<Response>(() => {}), [LAST_WEEK]: () => json(200, report(0, 0)) } })
    const inv = cells('Team targets', 'Invoiced')
    expect(inv[4]).toBe('…')
    expect(inv[5]).toBe('Loading invoiced and collected…')
    expect(host.querySelector('td [role="status"]')?.textContent).toBe('Loading invoiced and collected…')
  })
})

describe('Goal form: money metrics', () => {
  async function form(o: { role?: Parameters<typeof setArdRole>[1]; id?: string; extraBiz?: boolean } = {}) {
    m = await loadSales()
    const w = invoicingWorld({
      teams: [rec('t1', { name: 'Ardorio team', businessId: 'ard', managerId: 'u-me', members: ['u-me'] })],
      goals: GOALS,
    })
    if (o.extraBiz) w.collections.businesses.push(rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#654321', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl2', industries: [], roles: [] }))
    w.users.push(user('u-seller', 'Sam Seller'))
    m.bootstrap.hydrate(w)
    setArdRole(m, o.role ?? 'admin', o.extraBiz ? { ros: 'admin' } : {})
    const seller = m.store.S.users.find(u => u.id === 'u-seller')
    if (seller) seller.m = { ard: 'sales', ros: 'sales' }
    m.store.reindex()
    m.ui.bindNavigate(vi.fn())
    fakeApi({})
    const { GoalModal } = await import('../../modals/reports/GoalModal')
    await act(async () => { root.render(<GoalModal id={o.id} />) })
    await settle()
  }
  const options = (label: string): string[] => [...(field(host, label)?.querySelectorAll('option') ?? [])].map(x => x.textContent ?? '')

  it('offers invoiced and collected for Ardorio to its admins, with a business-wide hint', async () => {
    await form({ extraBiz: true })
    expect(options('Metric')).toEqual(['Calls', 'Emails sent', 'Meetings booked', 'Meetings completed', 'Won value', 'Invoiced', 'Collected'])
    await type(field(host, 'Metric'), 'invoiced_cents')
    expect(host.textContent).toContain('Business-wide: every Ardorio invoice by issue date, whoever owns the deal. The salesperson or team is not used.')
    expect(field(host, 'Target (A$, ex GST)')).toBeTruthy()
    // Another business offers won value but not invoiced or collected, and leaves the report metric behind.
    await type(field(host, 'Business'), 'ros')
    expect(options('Metric')).toEqual(['Calls', 'Emails sent', 'Meetings booked', 'Meetings completed', 'Won value'])
    expect((field(host, 'Metric') as HTMLSelectElement).value).toBe('calls')
  })

  it('does not offer invoiced or collected to an Ardorio manager', async () => {
    await form({ role: 'manager' })
    expect(options('Metric')).toEqual(['Calls', 'Emails sent', 'Meetings booked', 'Meetings completed', 'Won value'])
  })

  it('saves a money target typed in dollars: won value in dollars, invoiced in cents', async () => {
    await form()
    await type(field(host, 'Salesperson'), 'u-seller')
    await type(field(host, 'Metric'), 'won_value')
    await type(field(host, 'Target (A$, ex GST)'), '12,400.50')
    await click(button(host, 'Save'))
    const won = m.store.S.goals.find(g => g.ownerId === 'u-seller')
    expect(won).toMatchObject({ metric: 'won_value', target: 12400.5, businessId: 'ard' })

    act(() => root.unmount())
    root = createRoot(host)
    await form()
    await type(field(host, 'Salesperson'), 'u-seller')
    await type(field(host, 'Metric'), 'collected_cents')
    await type(field(host, 'Target (A$, ex GST)'), '20000')
    await click(button(host, 'Save'))
    expect(m.store.S.goals.find(g => g.ownerId === 'u-seller')).toMatchObject({ metric: 'collected_cents', target: 2000000 })
  })

  it('offers quarter and financial year periods and saves a financial year goal', async () => {
    await form()
    expect(options('Period')).toEqual(['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Financial year'])
    await type(field(host, 'Salesperson'), 'u-seller')
    await type(field(host, 'Metric'), 'won_value')
    await type(field(host, 'Period'), 'year')
    await type(field(host, 'Target (A$, ex GST)'), '600000')
    await click(button(host, 'Save'))
    expect(m.store.S.goals.find(g => g.ownerId === 'u-seller')).toMatchObject({ metric: 'won_value', target: 600000, period: 'year' })
  })

  it('refuses a money target that is not an amount', async () => {
    await form()
    await type(field(host, 'Salesperson'), 'u-seller')
    await type(field(host, 'Metric'), 'invoiced_cents')
    await type(field(host, 'Target (A$, ex GST)'), '12,50')
    await click(button(host, 'Save'))
    expect(m.store.S.goals.find(g => g.ownerId === 'u-seller')).toBeUndefined()
  })

  it('edits an invoiced goal in dollars', async () => {
    await form({ id: 'g-inv' })
    expect((field(host, 'Target (A$, ex GST)') as HTMLInputElement).value).toBe('20000.00')
    expect((field(host, 'Metric') as HTMLSelectElement).value).toBe('invoiced_cents')
  })
})
