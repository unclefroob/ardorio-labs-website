import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrap, rec } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
const nudgeEngine = vi.fn()
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: () => nudgeEngine() }))
const nudge = vi.fn()
vi.mock('../../api/engine', () => ({ nudge: () => nudge() }))

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: '', industries: [], roles: [] })

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.stubEnv('TZ', 'America/New_York')
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
  nudgeEngine.mockClear()
  nudge.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function setup(admin = true) {
  const m = await loadSales()
  m.bootstrap.hydrate(bootstrap({ businesses: [ROS] }))
  m.store.S.users.forEach(u => { u.super = admin })
  m.store.reindex()
  const { Clock } = await import('./Clock')
  const clock = await import('../../data/clock')
  act(() => root.render(<Clock />))
  return { ...m, clock }
}

const btn = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').startsWith(label))
function press(label: string): void {
  const b = btn(label)
  if (!b) throw new Error(`no button "${label}" among ${[...host.querySelectorAll('button')].map(x => x.textContent).join(' | ')}`)
  act(() => b.click())
}
function type(label: string, value: string): void {
  const el = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!el) throw new Error('no input ' + label)
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Clock page', () => {
  it('is closed to non-admins: no controls', async () => {
    await setup(false)
    expect(btn('+1 hour')).toBeUndefined()
    expect(btn('Run due steps')).toBeUndefined()
    expect(host.textContent).toMatch(/administrator/i)
  })

  it('shows real time with no offset', async () => {
    await setup()
    expect(host.textContent).toContain('Real time')
  })

  it('a preset advances the clock and nudges the server', async () => {
    const m = await setup()
    const before = m.clock.now()
    press('+4 hours')
    expect(m.clock.now() - before).toBe(4 * 3600000)
    expect(nudgeEngine).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('+4h')
  })

  it('offers the five presets', async () => {
    await setup()
    for (const l of ['+1 hour', '+4 hours', '+1 day', '+3 days', '+1 week']) expect(btn(l), l).toBeDefined()
  })

  it('Set reads the datetime as organisation time, not the browser zone', async () => {
    const m = await setup()
    type('Set date and time', '2026-10-12T09:41')
    press('Set')
    // 09:41 on 12 Oct in Melbourne (UTC+11) is 22:41Z on 11 Oct, whatever the browser zone is
    expect(new Date(m.clock.now()).toISOString().slice(0, 16)).toBe('2026-10-11T22:41')
    expect(nudgeEngine).toHaveBeenCalled()
  })

  it('Reset puts the clock back to real time', async () => {
    const m = await setup()
    press('+1 day')
    press('Reset')
    expect(m.clock.getOffsetMinutes()).toBe(0)
  })

  it('Run due steps asks the server and shows what it said', async () => {
    nudge.mockResolvedValue({ ran: true, businessIds: ['ros'], serverNow: '2026-10-09T10:00:00.000Z' })
    await setup()
    await act(async () => { btn('Run due steps')?.click() })
    expect(nudge).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('Ran')
    expect(host.textContent).toContain('ros')
  })

  it('Run due steps explains when the server did not run', async () => {
    nudge.mockResolvedValue({ ran: false, reason: 'busy', businessIds: [], serverNow: '2026-10-09T10:00:00.000Z' })
    await setup()
    await act(async () => { btn('Run due steps')?.click() })
    expect(host.textContent).toContain('busy')
  })

  it('Run due steps reports a failed call', async () => {
    nudge.mockRejectedValue(new Error('boom'))
    await setup()
    await act(async () => { btn('Run due steps')?.click() })
    expect(host.textContent).toMatch(/could not|couldn't/i)
  })
})
