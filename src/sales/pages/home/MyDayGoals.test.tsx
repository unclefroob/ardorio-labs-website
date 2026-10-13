import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RevenueReport } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { settle } from '../../testing/dom'
import { ardDeal, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root

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

// Fri 9 Oct 2026 in Melbourne: this week is Mon 5 Oct to today.
const WEEK = 'GET /sales/reports/revenue?business=ard&from=2026-10-05&to=2026-10-09&source=all'
const REPORT: RevenueReport = { from: '2026-10-05', to: '2026-10-09', source: 'all', months: [], invoicedCents: 1250050, collectedCents: 0, outstandingCents: 0, overdueCents: 0, recordedLate: [] }
const goal = (id: string, over: Record<string, unknown>) => rec(id, { businessId: 'ard', ownerType: 'user', ownerId: 'u-me', metric: 'calls', target: 20, period: 'week', createdBy: 'u-me', ...over })

async function show(role: 'admin' | 'sales') {
  const m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    deals: [ardDeal('d1', { value: 40000, closedAt: '2026-10-06T09:00:00' })],
    goals: [goal('g1', { metric: 'won_value', target: 50000 }), goal('g2', { metric: 'invoiced_cents', target: 2000000 }), goal('g3', { metric: 'calls', target: 20 })],
  }))
  setArdRole(m, role)
  m.ui.bindNavigate(vi.fn())
  const api = fakeApi({ [WEEK]: () => json(200, REPORT) })
  const { MyDay } = await import('./MyDay')
  await act(async () => { root.render(<MyDay />) })
  await settle(4)
  const card = [...host.querySelectorAll('.card')].find(c => c.textContent?.startsWith("This week's targets"))
  const lines = [...(card?.querySelectorAll('.col.gap12 > div') ?? [])].map(d => d.textContent ?? '')
  return { api, lines }
}

describe("My Day: this week's targets", () => {
  it('shows won value and invoiced as money, and activity goals as before', async () => {
    const { api, lines } = await show('admin')
    expect(api.count(WEEK)).toBe(1)
    expect(lines).toEqual(['Won value$40,000 / $50,000', 'Invoiced$12,500.50 / $20,000', 'calls0 / 20'])
  })

  it('says why invoiced is not shown to someone who is not an Ardorio admin', async () => {
    const { api, lines } = await show('sales')
    expect(api.calls).toEqual([])
    expect(lines[1]).toBe('Invoiced— / $20,000Only Ardorio admins can see invoiced and collected.')
  })
})
