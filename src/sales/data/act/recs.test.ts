import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

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
const STALE = rec('d1', {
  name: 'Acme', title: 'Acme rollout', businessId: 'ros', companyId: 'co1', pipelineId: '', stageId: 'x', ownerId: 'u-me', type: '', value: 1000, mrr: null,
  recurring: false, contractMonths: 0, close: '2027-01-01', probability: 50, forecast: '', source: '', contactIds: ['ct1'], primaryContact: 'ct1', next: '',
  description: '', lostReason: '', status: 'open', createdAt: '2026-08-01T09:00', stageChangedAt: '2026-08-01T09:00', lastActivity: '2026-09-01T09:00',
  closedAt: null, priority: '', fields: {}, stageHistory: [],
})

async function setup() {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [ROS], deals: [STALE] }))
  const { Act } = await import('../Act')
  return { ...m, Act }
}

describe('Act.refreshRecs (client-side, no lease)', () => {
  it('creates recommendations for a stale deal', async () => {
    const m = await setup()
    m.Act.refreshRecs()
    expect(m.store.S.recs.map(r => r.key)).toContain('stale:d1')
  })

  it('is idempotent: a second refresh adds nothing', async () => {
    const m = await setup()
    m.Act.refreshRecs()
    const n = m.store.S.recs.length
    m.Act.refreshRecs()
    expect(m.store.S.recs).toHaveLength(n)
  })

  it('rec ids derive from the natural key so two clients converge on one record', async () => {
    const a = await setup()
    a.Act.refreshRecs()
    const idsA = a.store.S.recs.map(r => [r.key, r.id])
    const b = await setup()
    b.Act.refreshRecs()
    expect(b.store.S.recs.map(r => [r.key, r.id])).toEqual(idsA)
    expect(idsA.length).toBeGreaterThan(0)
    for (const [, id] of idsA) expect(id).toMatch(/^rc_[a-z0-9]{14}$/)
  })

  it('saves what it created', async () => {
    const m = await setup()
    m.Act.refreshRecs()
    const rows = m.store.S.recs.length
    expect(rows).toBeGreaterThan(0)
    expect(m.sync.hasUnsaved()).toBe(true)
  })
})
