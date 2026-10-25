import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { settle } from '../../testing/dom'
import { ardDeal, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'
import { account, accountsOf, fakeApi, json } from '../../testing/rosterioWorld'

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

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#654321', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl2', industries: [], roles: [] })
// A Rosterio deal won as a subscription: its value is what the deal says, and it must not be added to the live accounts for the same customer.
const rosDeal = ardDeal('rd1', { businessId: 'ros', recurring: true, value: 30000, pipelineId: 'pl2', stageId: 'x' })

async function show(rosRole: 'admin' | 'sales', accounts: ReturnType<typeof account>[] | null) {
  const m = await loadSales()
  const w = invoicingWorld()
  m.bootstrap.hydrate(invoicingWorld({ businesses: [w.collections.businesses[0], ROS], deals: [...w.collections.deals, rosDeal] }))
  setArdRole(m, 'admin', { ros: rosRole })
  m.ui.bindNavigate(vi.fn())
  const api = fakeApi({ 'GET /sales/rosterio/accounts': () => (accounts ? json(200, accountsOf(accounts)) : json(500, { error: 'down', code: 'SERVER' })) })
  const { Dashboard } = await import('./Dashboard')
  await act(async () => { root.render(<Dashboard />) })
  await settle(6)
  return api
}

const arr = (): { v: string; s: string } | null => {
  const t = [...host.querySelectorAll('.kpi')].find(x => x.querySelector('.l')?.textContent === 'Subscription ARR')
  return t ? { v: t.querySelector('.v')?.textContent ?? '', s: t.querySelector('.s')?.textContent ?? '' } : null
}

describe('Dashboard: subscription ARR includes Rosterio\'s live accounts', () => {
  it('adds twelve months of what paying Rosterio accounts pay, and leaves Rosterio\'s won deal out so it is not counted twice', async () => {
    await show('admin', [account({ id: 'a', name: 'A', monthlyCost: 1000 }), account({ id: 'b', name: 'B', monthlyCost: 500 }), account({ id: 't', name: 'Trial', isTrial: true, trialEndDate: '2999-01-01T00:00:00.000Z', monthlyCost: 9999 })])
    expect(arr()?.v).toBe('A$18k')
    expect(arr()?.s).toContain('Rosterio 2 paying accounts A$18k')
  })

  it('says why when Rosterio sent no prices (not a Rosterio admin), and keeps the deals figure', async () => {
    await show('sales', [account({ id: 'a', name: 'A' })])
    expect(arr()?.v).toBe('A$30k')
    expect(arr()?.s).toContain('Rosterio prices are shown to Rosterio admins')
  })

  it('keeps the deals figure when the accounts cannot be read', async () => {
    await show('admin', null)
    expect(arr()?.v).toBe('A$30k')
    expect(arr()?.s).toContain('Won subscription deals')
  })
})
