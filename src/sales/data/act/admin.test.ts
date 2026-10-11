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

describe('admin actions', () => {
  it('a reconnected mailbox restarts failed enrolments and nudges', async () => {
    const m = await setup()
    m.store.S.enrolments[0].status = 'failed'
    m.Act.setMailbox('mb1', { status: 'connected' })
    expect(m.store.S.enrolments[0]).toMatchObject({ status: 'active', nextDue: expect.any(String) })
    expect(nudgeEngine).toHaveBeenCalledTimes(1)
  })
})
