import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec, salesWorld } from '../../testing/fixtures'
import { settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'

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

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })
const PIPE = rec('pl1', {
  businessId: 'ros', name: 'Sales', recurring: true, lostReasons: ['Price'], forecast: [], card: [], fields: [],
  stages: [
    { id: 's1', name: 'Lead', prob: 10, required: [], won: false, lost: false },
    { id: 's2', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
    { id: 's3', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
  ],
})
const deal = (id: string, over: Record<string, unknown> = {}) => rec(id, {
  name: id, title: id, businessId: 'ros', companyId: 'co1', pipelineId: 'pl1', stageId: 's1', ownerId: 'u-me', type: 'New', value: 1000, mrr: null,
  recurring: false, contractMonths: 12, close: '2026-12-01', probability: 10, forecast: 'Pipeline', source: 'Outbound', contactIds: ['ct1'], primaryContact: 'ct1',
  next: '', description: '', lostReason: '', status: 'open', createdAt: '2026-10-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-01T09:00',
  closedAt: null, priority: 'Medium', fields: {}, stageHistory: [], notes: [], ...over,
})
const activity = (id: string, type: string, dealId: string, contactId: string) =>
  rec(id, { type, businessId: 'ros', actorId: 'u-me', ts: '2026-10-09T08:00', visibility: 'business', dealId, contactId, companyId: 'co1', subject: type })

const kpi = (label: string): string => {
  const b = [...host.querySelectorAll('button.kpi')].find(x => x.querySelector('.l')?.textContent === label)
  return b?.querySelector('.v')?.textContent ?? ''
}

async function show() {
  m = await loadSales()
  m.bootstrap.hydrate(salesWorld({
    businesses: [ROS], pipelines: [PIPE],
    deals: [deal('live'), deal('gone', { archived: true, archivedAt: '2026-10-08T10:00', archivedBy: 'u-me' })],
    activities: [
      activity('a1', 'call', 'live', 'ct1'), activity('a2', 'call', 'gone', 'ct2'),
      activity('a3', 'email_out', 'gone', 'ct2'), activity('a4', 'meeting_booked', 'gone', 'ct2'),
    ],
    companyRels: [rec('cr1', { companyId: 'co1', businessId: 'ros', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [] })],
  }))
  m.ui.bindNavigate(vi.fn())
  const { Dashboard } = await import('./Dashboard')
  await act(async () => { root.render(<Dashboard />) })
  await settle()
}

describe('Dashboard: activity on an archived deal does not count', () => {
  it('leaves it out of the calls, emails and meetings KPIs, as Reports and Goals do', async () => {
    await show()
    expect(kpi('Calls completed')).toBe('1')
    expect(kpi('Emails sent')).toBe('0')
    expect(kpi('Meetings booked')).toBe('0')
  })
})
