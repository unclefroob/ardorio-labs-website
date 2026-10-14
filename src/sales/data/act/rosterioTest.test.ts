import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'
import { setRole } from '../../testing/rosterioWorld'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../engineNudge', () => ({ nudgeEngine: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: '', industries: [], roles: [] })

async function setup(role: Parameters<typeof setRole>[1] = 'admin', others: Parameters<typeof setRole>[2] = {}, stored?: Record<string, unknown>) {
  const m = await loadSales()
  const b = salesWorld({ businesses: [ROS], ...(stored ? { settings: [rec('rosterioTest', stored, 3)] } : {}) })
  m.bootstrap.hydrate(b)
  setRole(m, role, others)
  const { Act } = await import('../Act')
  const t = await import('../rosterioTest')
  return { ...m, Act, t }
}

const APPLE = { id: 'acc-apple', name: 'Apple Test Account' }
const settingsOps = (m: Awaited<ReturnType<typeof setup>>) => m.plan.collectPlan().filter(p => p.c === 'settings').map(p => p.op)

describe('Act.markTestAccount / unmarkTestAccount', () => {
  it('a ros admin marks an account: the record holds the entry, and one settings write goes out with the whole list', async () => {
    const m = await setup('admin')
    expect(m.Act.markTestAccount(APPLE, '  App Store review account ')).toEqual({ ok: true })
    expect(m.t.testAccountIds()).toEqual(new Set(['acc-apple']))
    expect(m.t.testAccounts()).toEqual([{ accountId: 'acc-apple', name: 'Apple Test Account', reason: 'App Store review account', markedBy: 'Me Myself', markedAt: '2026-10-09T10:00:00.000Z' }])
    const ops = settingsOps(m)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ op: 'put', collection: 'settings', id: 'rosterioTest' })
    const set = (ops[0] as { set: Record<string, unknown> }).set
    expect(set.accounts).toEqual([{ accountId: 'acc-apple', name: 'Apple Test Account', reason: 'App Store review account', markedBy: 'Me Myself', markedAt: '2026-10-09T10:00:00.000Z' }])
    expect(m.store.S.audit.at(-1)).toMatchObject({ action: 'Rosterio test account marked', target: 'Apple Test Account' })
  })

  it('un-marking removes the entry and writes the shorter list', async () => {
    const stored = { accounts: [{ accountId: 'acc-apple', name: 'Apple Test Account', reason: 'x', markedBy: 'Sam', markedAt: '2026-10-01T00:00:00.000Z' }, { accountId: 'b', name: 'B', reason: '', markedBy: 'Sam', markedAt: '2026-10-01T00:00:00.000Z' }] }
    const m = await setup('super', {}, stored)
    expect(m.t.testAccountIds()).toEqual(new Set(['acc-apple', 'b']))
    expect(m.Act.unmarkTestAccount('acc-apple')).toEqual({ ok: true })
    expect([...m.t.testAccountIds()]).toEqual(['b'])
    const ops = settingsOps(m)
    expect(ops[0]).toMatchObject({ collection: 'settings', id: 'rosterioTest', baseRev: 3, set: { accounts: [stored.accounts[1]] } })
  })

  it('marking an account already marked, or un-marking one that is not, changes nothing', async () => {
    const m = await setup('admin')
    m.Act.markTestAccount(APPLE, 'first')
    m.Act.markTestAccount(APPLE, 'second')
    expect(m.t.testAccounts().map(a => a.reason)).toEqual(['first'])
    const before = m.t.testAccounts()
    expect(m.Act.unmarkTestAccount('nope')).toEqual({ ok: true })
    expect(m.t.testAccounts()).toEqual(before)
  })

  it('an empty reason is fine; one over 300 characters is refused and nothing is written', async () => {
    const m = await setup('admin')
    expect(m.Act.markTestAccount({ id: 'x', name: 'X' }, '')).toEqual({ ok: true })
    expect(m.Act.markTestAccount(APPLE, 'r'.repeat(301))).toEqual({ ok: false, message: 'Keep the reason to 300 characters or fewer' })
    expect(m.Act.markTestAccount({ id: 'y', name: 'Y' }, 'r'.repeat(300)).ok).toBe(true)
    expect([...m.t.testAccountIds()]).toEqual(['x', 'y'])
  })

  it.each([
    ['a ros viewer', 'viewer', {}],
    ['a ros manager', 'manager', {}],
    ['an ard-only admin', null, { ard: 'admin' }],
  ] as const)('%s may not mark or un-mark', async (_label, role, others) => {
    const m = await setup(role, others, { accounts: [{ accountId: 'b', name: 'B', reason: '', markedBy: 'Sam', markedAt: '2026-10-01T00:00:00.000Z' }] })
    expect(m.t.canMarkTest()).toBe(false)
    expect(m.Act.markTestAccount(APPLE, '')).toEqual({ ok: false, message: 'Only a Rosterio admin can change test accounts' })
    expect(m.Act.unmarkTestAccount('b').ok).toBe(false)
    expect([...m.t.testAccountIds()]).toEqual(['b'])
    expect(settingsOps(m)).toEqual([])
  })

  it('a long account name is cut to 200 characters, and the 500-account limit holds', async () => {
    const m = await setup('admin', {}, { accounts: Array.from({ length: 499 }, (_, i) => ({ accountId: `a${i}`, name: 'N', reason: '', markedBy: 'S', markedAt: '2026-10-01T00:00:00.000Z' })) })
    expect(m.Act.markTestAccount({ id: 'long', name: 'n'.repeat(250) }, '').ok).toBe(true)
    expect(m.t.testAccountOf('long')?.name).toHaveLength(200)
    expect(m.Act.markTestAccount(APPLE, '')).toEqual({ ok: false, message: 'At most 500 accounts can be test accounts' })
  })

  it('a record with no list yet (an older server) reads as no test accounts and is not rewritten until someone marks one', async () => {
    const m = await loadSales()
    const b = salesWorld({ businesses: [ROS] })
    delete (b.settingsDefaults as Record<string, unknown>).rosterioTest
    m.bootstrap.hydrate(b)
    setRole(m, 'admin')
    const t = await import('../rosterioTest')
    expect(t.testAccounts()).toEqual([])
    expect(m.plan.collectPlan().filter(p => p.c === 'settings')).toEqual([])
  })
})
