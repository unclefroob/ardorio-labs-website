import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { settle } from '../../testing/dom'
import { invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'

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

async function show(withRos: boolean) {
  const m = await loadSales()
  const w = invoicingWorld()
  m.bootstrap.hydrate(invoicingWorld(withRos ? { businesses: [w.collections.businesses[0], ROS] } : {}))
  setArdRole(m, 'admin', withRos ? { ros: 'admin' } : {})
  m.ui.bindNavigate(vi.fn())
  const { Dashboard } = await import('./Dashboard')
  await act(async () => { root.render(<Dashboard />) })
  await settle()
}

const labels = (): string[] => [...host.querySelectorAll('.kpi .l')].map(l => l.textContent ?? '')
const titles = (): string[] => [...host.querySelectorAll('.card-h')].map(h => h.textContent ?? '')

describe('Dashboard: one-off revenue words for Ardorio', () => {
  it('calls bookings Won value and shows no recurring revenue when only Ardorio is in view', async () => {
    await show(false)
    expect(titles().some(t => t.startsWith('Won value by month'))).toBe(true)
    expect(titles().some(t => t.includes('Won revenue'))).toBe(false)
    expect(labels()).not.toContain('Recurring revenue (ARR)')
    expect(host.textContent).not.toMatch(/\bMRR\b|\bARR\b/)
  })

  it('keeps the recurring revenue tile when Rosterio is in view too', async () => {
    await show(true)
    expect(labels()).toContain('Recurring revenue (ARR)')
    expect(titles().some(t => t.startsWith('Won value by month'))).toBe(true)
  })
})
