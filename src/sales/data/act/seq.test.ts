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
  vi.stubEnv('TZ', 'UTC')
  // hydrate() adopts the fixture's serverNow (10:00Z), which is 21:00 in Australia/Melbourne (AEDT, UTC+11)
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
  nudgeEngine.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ enrolments: [], threads: [], ...over }))
  const { Act } = await import('../Act')
  return { ...m, Act }
}

describe('Act.enrol', () => {
  it('writes an active, unscheduled enrolment: the server computes the first nextDue', async () => {
    const m = await setup()
    const r = m.Act.enrol(['ct1'], 'sq1', { mailboxId: 'mb1' })
    expect(r.ok).toEqual(['ct1'])
    const e = m.store.S.enrolments[0]
    expect(e).toMatchObject({ status: 'active', stepIdx: 0, nextDue: null, seqId: 'sq1', contactId: 'ct1', threadId: null })
    expect(e.startedAt).toBe('2026-10-09T21:00')
  })

  it('startedAt honours a future start, still with nextDue null', async () => {
    const m = await setup()
    m.Act.enrol(['ct1'], 'sq1', { mailboxId: 'mb1', start: '2026-10-20T09:00' })
    expect(m.store.S.enrolments[0]).toMatchObject({ nextDue: null, startedAt: '2026-10-20T09:00' })
  })

  it('nudges the server so the first step is scheduled promptly', async () => {
    const m = await setup()
    m.Act.enrol(['ct1'], 'sq1', { mailboxId: 'mb1' })
    expect(nudgeEngine).toHaveBeenCalledTimes(1)
  })
})

describe('Act.setEnrol', () => {
  const paused = (over = {}) => rec('en1', {
    seqId: 'sq1', contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', mailboxId: 'mb1', status: 'paused', stepIdx: 1, nextDue: null,
    startedAt: '2026-10-09T09:00', threadId: null, history: [], reason: 'Held: missing {{x}}', pauseReason: 'Held: missing {{x}}', resumeAt: null, ...over,
  })

  it('a user resume writes active with nextDue = now (org time), clearing the hold', async () => {
    const m = await setup({ enrolments: [paused()] })
    m.Act.setEnrol('en1', 'active')
    expect(m.store.S.enrolments[0]).toMatchObject({ status: 'active', nextDue: '2026-10-09T21:00', reason: '' })
    expect(m.store.S.enrolments[0].pauseReason).toBeFalsy()
  })

  it('a resume overwrites a stale nextDue rather than keeping it', async () => {
    const m = await setup({ enrolments: [paused({ nextDue: '2026-09-01T09:00' })] })
    m.Act.setEnrol('en1', 'active')
    expect(m.store.S.enrolments[0].nextDue).toBe('2026-10-09T21:00')
  })
})
