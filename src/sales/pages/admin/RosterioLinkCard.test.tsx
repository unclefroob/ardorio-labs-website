import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json, rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const STATUS = 'GET /sales/rosterio/status'
const RETRY = 'POST /sales/rosterio/sync/retry'

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  getChanges.mockResolvedValue(changes([]))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const at = (mins: number): string => new Date(Date.now() - mins * 60_000).toISOString()

async function show(routes: Parameters<typeof fakeApi>[0], role: Parameters<typeof setRole>[1] = 'admin') {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, role)
  const api = fakeApi(routes)
  const { RosterioLinkCard } = await import('./RosterioLinkCard')
  await act(async () => { root.render(<RosterioLinkCard />) })
  await settle(5)
  return api
}
const text = (): string => host.textContent ?? ''

describe('Rosterio CRM link card on the Integrations page', () => {
  it('says plainly that it is not set up, and shows no retry or history', async () => {
    await show({ [STATUS]: json(200, { configured: false, pendingFailures: 0, recent: [] }) })
    expect(text()).toContain('Rosterio CRM link')
    expect(text()).toContain('Not set up: ask an admin to set the Rosterio URL and key')
    expect(button(host, 'Retry failed pushes')).toBeUndefined()
    expect(text()).not.toContain('Last 20 sends')
  })

  it('says it is set up and that nothing has been sent yet', async () => {
    await show({ [STATUS]: json(200, { configured: true, pendingFailures: 0, recent: [] }) })
    expect(text()).toContain('Set up')
    expect(text()).not.toContain('Not set up')
    expect(text()).toContain('No failed sends')
    expect(text()).toContain('Nothing has been sent to Rosterio yet.')
  })

  it('shows failed sends and the recent outcomes in plain words, with Retry for admins', async () => {
    await show({
      [STATUS]: json(200, {
        configured: true, pendingFailures: 2,
        recent: [
          { at: at(5), dealId: 'dl1', outcome: 'failed', reason: 'Rosterio did not answer in time' },
          { at: at(30), dealId: 'dl2', outcome: 'ok' },
          { at: at(90), dealId: 'gone', outcome: 'skipped', reason: 'No contact email' },
        ],
      }),
    })
    expect(text()).toContain('2 deals could not be sent to Rosterio.')
    expect(button(host, 'Retry failed pushes')).toBeDefined()
    expect(text()).toContain('Last 20 sends')
    expect(text()).toContain('Could not send')
    expect(text()).toContain('Rosterio did not answer in time')
    expect(text()).toContain('Sent')
    expect(text()).toContain('Not sent')
    expect(text()).toContain('No contact email')
    expect(text()).toContain('Acme rostering')
    expect(text()).toContain('A deal')
  })

  it('uses the singular for one failed send', async () => {
    await show({ [STATUS]: json(200, { configured: true, pendingFailures: 1, recent: [] }) })
    expect(text()).toContain('1 deal could not be sent to Rosterio.')
  })

  it('shows at most the last 20 outcomes', async () => {
    const recent = Array.from({ length: 25 }, (_, i) => ({ at: at(i + 1), dealId: 'dl1', outcome: 'ok' }))
    await show({ [STATUS]: json(200, { configured: true, pendingFailures: 0, recent }) })
    expect(host.querySelectorAll('.faint.xs[title]')).toHaveLength(20)
  })

  it('does not offer Retry to a non-admin, but says an admin can', async () => {
    await show({ [STATUS]: json(200, { configured: true, pendingFailures: 3, recent: [] }) }, 'sales')
    expect(text()).toContain('3 deals could not be sent to Rosterio.')
    expect(text()).toContain('An admin can retry them.')
    expect(button(host, 'Retry failed pushes')).toBeUndefined()
  })

  it('retries when an admin presses the button, then shows the fresh status', async () => {
    let n = 0
    const api = await show({
      [STATUS]: () => json(200, ++n === 1 ? { configured: true, pendingFailures: 2, recent: [] } : { configured: true, pendingFailures: 0, recent: [{ at: at(1), dealId: 'dl1', outcome: 'ok' }] }),
      [RETRY]: json(200, { retried: 2 }),
    })
    await click(button(host, 'Retry failed pushes'))
    await settle(5)
    expect(api.count(RETRY)).toBe(1)
    expect(api.count(STATUS)).toBe(2)
    expect(text()).toContain('No failed sends')
    expect(button(host, 'Retry failed pushes')).toBeUndefined()
  })

  it('keeps the failures on screen when the retry itself fails', async () => {
    await show({
      [STATUS]: json(200, { configured: true, pendingFailures: 2, recent: [] }),
      [RETRY]: json(500, { error: 'Boom', code: 'INTERNAL' }),
    })
    await click(button(host, 'Retry failed pushes'))
    await settle(5)
    expect(text()).toContain('2 deals could not be sent to Rosterio.')
  })

  it('shows a plain message and a Retry button if the status cannot be read', async () => {
    await show({ [STATUS]: json(500, { error: 'Boom', code: 'INTERNAL' }) })
    expect(text()).toContain('Status unavailable.')
    expect(button(host, 'Retry')).toBeDefined()
  })

  it('shows nothing to someone who is not in Rosterio', async () => {
    const api = await show({ [STATUS]: json(200, { configured: true, pendingFailures: 0, recent: [] }) }, null)
    expect(host.textContent).toBe('')
    expect(api.count(STATUS)).toBe(0)
  })

  it('never shows a web address or key, even if the server sent one by mistake', async () => {
    await show({ [STATUS]: json(200, { configured: true, pendingFailures: 0, recent: [], url: 'https://rosterio.example/secret', apiKey: 'sk-live-123' }) })
    expect(text()).not.toMatch(/https?:|sk-live|secret/)
  })
})
