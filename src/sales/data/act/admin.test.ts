import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
const nudgeEngine = vi.fn()
vi.mock('../engineNudge', () => ({ nudgeEngine: () => nudgeEngine() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('TZ', 'America/New_York')
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
  nudgeEngine.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: '', industries: [], roles: [] })

async function setup() {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [ROS] }))
  const { Act } = await import('../Act')
  const clock = await import('../clock')
  return { ...m, Act, clock }
}

describe('demo clock', () => {
  it('setClock reads a zoneless datetime as organisation wall time, not browser time', async () => {
    const m = await setup()
    m.Act.setClock('2026-10-12T09:41')
    // 09:41 AEDT (UTC+11) on 12 Oct is 22:41Z on 11 Oct, whatever zone the browser is in
    expect(new Date(m.clock.now()).toISOString().slice(0, 16)).toBe('2026-10-11T22:41')
  })

  it('setClock still honours an explicit instant', async () => {
    const m = await setup()
    m.Act.setClock('2026-10-12T00:00:00Z')
    expect(new Date(m.clock.now()).toISOString().slice(0, 16)).toBe('2026-10-12T00:00')
  })

  it('advance, setClock, resetClock and runSequences nudge the server engine', async () => {
    const m = await setup()
    m.Act.advance(4)
    m.Act.setClock('2026-10-12T09:41')
    m.Act.resetClock()
    m.Act.runSequences()
    expect(nudgeEngine).toHaveBeenCalledTimes(4)
  })

  it('advance moves the clock by whole minutes and resetClock restores it', async () => {
    const m = await setup()
    const before = m.clock.now()
    m.Act.advance(4)
    expect(m.clock.now() - before).toBe(4 * 3600000)
    m.Act.resetClock()
    expect(m.clock.now()).toBe(before)
  })

  it('does nothing for a non-admin', async () => {
    const m = await loadSales()
    const w = salesWorld({ businesses: [ROS] })
    w.users[0].super = false
    m.bootstrap.hydrate(w)
    const { Act } = await import('../Act')
    const clock = await import('../clock')
    const before = clock.now()
    Act.advance(4)
    Act.setClock('2026-10-12T09:41')
    expect(clock.now()).toBe(before)
    expect(nudgeEngine).not.toHaveBeenCalled()
  })

  it('a reconnected mailbox restarts failed enrolments and nudges', async () => {
    const m = await setup()
    m.store.S.enrolments[0].status = 'failed'
    m.Act.setMailbox('mb1', { status: 'connected' })
    expect(m.store.S.enrolments[0]).toMatchObject({ status: 'active', nextDue: expect.any(String) })
    expect(nudgeEngine).toHaveBeenCalledTimes(1)
  })
})
