import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec, salesWorld } from '../../testing/fixtures'
import { settle, type } from '../../testing/dom'
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
const deal = (id: string, title: string, over: Record<string, unknown> = {}) => rec(id, {
  name: title, title, businessId: 'ros', companyId: 'co1', pipelineId: 'pl1', stageId: 's1', ownerId: 'u-me', type: 'New', value: 12000, mrr: null,
  recurring: false, contractMonths: 12, close: '2026-12-01', probability: 10, forecast: 'Pipeline', source: 'Outbound', contactIds: ['ct1'], primaryContact: 'ct1',
  next: '', description: '', lostReason: '', status: 'open', createdAt: '2026-10-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-01T09:00',
  closedAt: null, priority: 'Medium', fields: {}, stageHistory: [], notes: [], ...over,
})

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(salesWorld({
    businesses: [ROS], pipelines: [PIPE], deals: [deal('dl1', 'Roster rollout'), deal('dl2', 'Payroll add-on')],
    companies: [rec('co1', { name: 'Acme', tradingName: 'Acme', tags: [], notes: [], industry: '', hq: '', state: '', domain: 'acme.example' })],
    companyRels: [rec('cr1', { companyId: 'co1', businessId: 'ros', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [], createdAt: '2026-10-01T09:00' })],
    ...over,
  }))
  m.ui.bindNavigate(vi.fn())
  const { Act } = await import('../../data/Act')
  const { Q } = await import('../../data/Q')
  const { Hosts } = await import('../../shell/Hosts')
  return { Act, Q, Hosts }
}

async function show(page: ReactElement, Hosts: () => ReactElement) {
  await act(async () => { root.render(<>{page}<Hosts /></>) })
  await settle()
}


describe('Deals filters fold behind a Filters button on a phone', () => {
  it('counts each filter that is not at its default', async () => {
    const t = await setup()
    const { Deals } = await import('./Deals')
    await show(<Deals route={{ page: 'deals' }} />, t.Hosts)
    const bar = () => host.querySelector('.fbar') as HTMLElement
    expect(bar().querySelector('.fbar-tog')?.textContent).toBe('Filters')
    await type(bar().querySelector('select[aria-label="Priority"]'), 'High')
    expect(bar().querySelector('.fbar-tog')?.textContent).toBe('Filters (1)')
    await type(bar().querySelector('input[aria-label="Search deals"]'), 'roster')
    expect(bar().querySelector('.fbar-tog')?.textContent).toBe('Filters (1)')
  })
})
