import { act } from 'react'
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

async function show() {
  m = await loadSales()
  m.bootstrap.hydrate(salesWorld({
    businesses: [ROS],
    activities: [rec('a1', { type: 'call', businessId: 'ros', actorId: 'u-me', ts: '2026-10-05T09:00', visibility: 'business', subject: 'Intro call' })],
  }))
  m.ui.bindNavigate(vi.fn())
  const { Activities } = await import('./Activities')
  await act(async () => { root.render(<Activities route={{ page: 'activities' }} />) })
  await settle()
}

describe('Activities filters', () => {
  it('counts a filter that is not at its default', async () => {
    await show()
    const tog = () => host.querySelector('.fbar-tog')
    expect(tog()?.textContent).toBe('Filters')
    await type(host.querySelector('select[aria-label="Activity type"]'), 'call')
    expect(tog()?.textContent).toBe('Filters (1)')
    await type(host.querySelector('input[aria-label="From date"]'), '2026-10-01')
    expect(tog()?.textContent).toBe('Filters (2)')
  })

  it('puts the date field straight in the bar, not in a column wrapper that turns its flex-basis into a height', async () => {
    await show()
    const date = host.querySelector('input[aria-label="From date"]') as HTMLElement
    expect(date.parentElement?.classList.contains('fbar')).toBe(true)
  })
})
