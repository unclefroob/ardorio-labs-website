// Reproduces ticket 2: a task a person gives themself for Friday must show under Upcoming (and My tasks).
// The app clock follows the bootstrap's serverNow: 2026-10-09T10:00Z, which is 21:00 on Fri 9 Oct in Melbourne.
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

const biz = (id: string, name: string) => rec(id, { name, short: id.toUpperCase(), accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl_' + id, industries: [], roles: [] })
const task = (id: string, over: Record<string, unknown>) => rec(id, {
  title: id, type: 'Follow-up', desc: '', businessId: 'ros', assigneeId: 'u-me', priority: 'Medium', due: '2026-10-16T10:00', companyId: 'co1', contactId: null, dealId: null,
  reminder: '', status: 'Not Started', source: 'Manual', createdAt: '2026-10-09T09:00', ...over,
})

async function render(tasks: ReturnType<typeof task>[], view: string) {
  m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [biz('ros', 'Rosterio')], tasks }))
  m.ui.bindNavigate(vi.fn())
  const { Tasks } = await import('./Tasks')
  const { useStore } = await import('../../data/store')
  function Live() {
    useStore()
    return <Tasks route={{ page: 'tasks', q: { view } } as never} />
  }
  await act(async () => { root.render(<Live />) })
  await settle()
}

const titles = (): string[] => [...host.querySelectorAll('tbody tr')].map(r => r.textContent ?? '')

describe('Tasks: Upcoming', () => {
  it('lists a task due next Friday under Upcoming and under My tasks', async () => {
    await render([task('Send tender docs', {})], 'upcoming')
    expect(titles().join('|')).toContain('Send tender docs')
    expect(host.textContent).toContain('My tasks')
  })

  it('does not list a task due today or one that is done', async () => {
    await render([task('Due today', { due: '2026-10-09T23:00' }), task('Done later', { status: 'Completed' })], 'upcoming')
    expect(titles().join('|')).not.toContain('Due today')
    expect(titles().join('|')).not.toContain('Done later')
  })
})

describe('Tasks: work hidden by the workspace', () => {
  it('says so when an open task of mine is in a business outside the one being viewed', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(salesWorld({ businesses: [biz('ros', 'Rosterio'), biz('ard', 'Ardorio')], tasks: [task('Send tender docs', { businessId: 'ros' }), task('Ard thing', { businessId: 'ard' })] }))
    m.ui.bindNavigate(vi.fn())
    const { setWorkspace } = await import('../../data/session')
    setWorkspace('ard')
    const { Tasks } = await import('./Tasks')
    const { useStore } = await import('../../data/store')
    function Live() {
      useStore()
      return <Tasks route={{ page: 'tasks', q: { view: 'upcoming' } } as never} />
    }
    await act(async () => { root.render(<Live />) })
    await settle()
    expect(host.querySelector('[data-testid="tasks-elsewhere"]')?.textContent).toContain('1 open task assigned to you is in Rosterio')
    expect(titles().join('|')).not.toContain('Send tender docs')
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="tasks-elsewhere"] button')?.click() })
    await settle()
    expect(host.querySelector('[data-testid="tasks-elsewhere"]')).toBeNull()
    expect(titles().join('|')).toContain('Send tender docs')
  })
})
