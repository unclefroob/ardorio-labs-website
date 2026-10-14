// Activity void (contract: "an existing activity may change ONLY by gaining { voided, voidedAt, voidedBy (server-set),
// voidReason (1..300) }, written by its actor or a manager+ of its business; voided activities are excluded from every
// count, metric, goal, report and timeline total").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'
import { appliedResult, rec, salesWorld, user } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../engineNudge', () => ({ nudgeEngine: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })
const PIPE = rec('pl1', { businessId: 'ros', name: 'Sales', recurring: true, lostReasons: [], forecast: [], card: [], fields: [], stages: [{ id: 's1', name: 'Lead', prob: 10, required: [], won: false, lost: false }] })
const DEAL = rec('dl1', {
  name: 'dl1', title: 'Acme rollout', businessId: 'ros', companyId: 'co1', pipelineId: 'pl1', stageId: 's1', ownerId: 'u-me', type: 'New', value: 1000, mrr: null,
  recurring: true, contractMonths: 12, close: '2026-12-01', probability: 10, forecast: 'Pipeline', source: 'Outbound', contactIds: ['ct1'], primaryContact: 'ct1',
  next: '', description: '', lostReason: '', status: 'open', createdAt: '2026-10-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-09T08:00',
  closedAt: null, priority: 'Medium', fields: {}, stageHistory: [], notes: [],
})
const activity = (id: string, type: string, over: Record<string, unknown> = {}) =>
  rec(id, { type, businessId: 'ros', actorId: 'u-me', ts: '2026-10-09T08:00', visibility: 'business', contactId: 'ct1', companyId: 'co1', subject: `${type} ${id}`, ...over })

const ACTS = [
  activity('call1', 'call', { outcome: 'Connected', dealId: 'dl1', ts: '2026-10-09T08:00' }),
  activity('call0', 'call', { outcome: 'Connected', dealId: 'dl1', ts: '2026-10-08T08:00' }),
  activity('book1', 'meeting_booked', { ts: '2026-10-09T09:30' }),
  activity('other', 'call', { actorId: 'u-other', ts: '2026-10-09T07:00' }),
]

async function setup() {
  const m = await loadSales()
  const w = salesWorld({
    businesses: [ROS], pipelines: [PIPE], deals: [DEAL], activities: ACTS,
    companyRels: [rec('cr1', { companyId: 'co1', businessId: 'ros', ownerId: 'u-me', status: 'Active opportunity', priority: 'Medium', tags: [], lastContacted: '2026-10-09T08:00' })],
  })
  w.users.push(user('u-other', 'Olive Other'))
  m.bootstrap.hydrate(w)
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  const archive = await import('../archive')
  const seq = await import('../../shared/seqStats')
  const { setRole } = await import('../../testing/rosterioWorld')
  return { ...m, Act, Q, archive, seq, setRole }
}
type M = Awaited<ReturnType<typeof setup>>

async function sent(m: M): Promise<BatchRequest['ops']> {
  let ops: BatchRequest['ops'] = []
  vi.mocked(m.records.postBatch).mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => {
    ops = (JSON.parse(JSON.stringify(req)) as BatchRequest).ops
    return {
      serverNow: '2026-10-09T10:00:00.000Z',
      results: ops.map((op, i): OpResult => appliedResult(i, op.collection, op.id, 2, { ...m.plan.localData(op.collection, op.id), ...(op.op === 'delete' ? {} : op.set) })),
    }
  })
  await m.sync.flushAll()
  return ops
}
const a = (m: M, id: string) => m.store.S.activities.find(x => x.id === id)
const RANGE = ['2026-10-01T00:00', '2026-10-31T23:59'] as const

describe('Act.voidActivity', () => {
  it('marks it voided with the reason and the time; nothing else on it changes', async () => {
    const m = await setup()
    expect(m.Act.voidActivity('call1', '  Logged against the wrong contact  ')).toEqual({ ok: true })
    expect(a(m, 'call1')).toMatchObject({ voided: true, voidReason: 'Logged against the wrong contact', voidedAt: '2026-10-09T21:00', type: 'call', subject: 'call call1', outcome: 'Connected' })
    expect(m.store.S.audit.at(-1)).toMatchObject({ action: 'Activity voided', target: 'call call1: Logged against the wrong contact' })
  })

  it('sends only the void fields, never voidedBy (the server writes the name)', async () => {
    const m = await setup()
    m.Act.voidActivity('call1', 'Duplicate')
    const ops = await sent(m)
    const put = ops.find(o => o.collection === 'activities')
    expect(put).toMatchObject({ op: 'put', id: 'call1' })
    expect(put && 'set' in put ? Object.keys(put.set ?? {}).sort() : []).toEqual(['voidReason', 'voided', 'voidedAt'])
    expect(put && 'unset' in put ? put.unset : undefined).toBeUndefined()
  })

  it('refuses an empty or too long reason, a second void, and someone else’s activity for a sales rep', async () => {
    const m = await setup()
    expect(m.Act.voidActivity('call1', '   ')).toEqual({ ok: false, reason: 'reason_required' })
    expect(m.Act.voidActivity('call1', 'x'.repeat(301))).toEqual({ ok: false, reason: 'reason_too_long' })
    expect(m.Act.voidActivity('call1', 'x'.repeat(300))).toEqual({ ok: true })
    expect(m.Act.voidActivity('call1', 'again')).toEqual({ ok: false, reason: 'already_voided' })
    expect(a(m, 'call1')?.voidReason).toBe('x'.repeat(300))
    m.setRole(m, 'sales')
    expect(m.Act.voidActivity('other', 'Not mine')).toEqual({ ok: false, reason: 'not_allowed' })
    expect(a(m, 'other')?.voided).toBeUndefined()
    expect(m.Act.voidActivity('nope', 'x')).toEqual({ ok: false, reason: 'missing' })
  })

  it('a manager may void anyone’s activity in the business; a viewer may not void even their own', async () => {
    const m = await setup()
    m.setRole(m, 'manager')
    expect(m.Act.voidActivity('other', 'Wrong company')).toEqual({ ok: true })
    m.setRole(m, 'viewer')
    expect(m.Act.voidActivity('call0', 'Mine')).toEqual({ ok: false, reason: 'not_allowed' })
  })
})

describe('a voided activity counts nowhere', () => {
  it('goals (Q.metric), the dashboard and reports (countableActs) and the engagement score', async () => {
    const m = await setup()
    expect(m.Q.metric(['u-me'], 'calls', ...RANGE)).toBe(2)
    expect(m.Q.metric(['u-me'], 'meetings', ...RANGE)).toBe(1)
    expect(m.archive.countableActs(m.store.S.activities).map(x => x.id)).toContain('book1')
    m.Act.voidActivity('call1', 'Duplicate')
    m.Act.voidActivity('book1', 'Never booked')
    expect(m.Q.metric(['u-me'], 'calls', ...RANGE)).toBe(1)
    expect(m.Q.metric(['u-me'], 'meetings', ...RANGE)).toBe(0)
    expect(m.archive.countableActs(m.store.S.activities).map(x => x.id).sort()).toEqual(['call0', 'other'])
  })

  it('sequence stats leave out a voided meeting booking', async () => {
    const m = await setup()
    const sq = m.store.S.sequences[0]
    const before = m.seq.seqStats(sq).meetings
    expect(before).toBe(1)
    m.Act.voidActivity('book1', 'Never booked')
    expect(m.seq.seqStats(sq).meetings).toBe(0)
  })

  it('the deal’s and company’s last activity fall back to the latest standing activity', async () => {
    const m = await setup()
    m.Act.voidActivity('call1', 'Duplicate')
    expect(m.store.S.deals[0].lastActivity).toBe('2026-10-08T08:00')
    expect(m.Q.rel('co1', 'ros')?.lastContacted).toBe('2026-10-09T07:00')
  })

  it('a last-activity date set by something else is left alone', async () => {
    const m = await setup()
    m.store.S.deals[0].lastActivity = '2026-10-09T09:59'
    m.Act.voidActivity('call1', 'Duplicate')
    expect(m.store.S.deals[0].lastActivity).toBe('2026-10-09T09:59')
  })
})
