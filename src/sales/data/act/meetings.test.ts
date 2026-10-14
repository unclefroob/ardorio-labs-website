import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'
import { appliedResult, rec, salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../engineNudge', () => ({ nudgeEngine: vi.fn() }))

// 2026-10-09T10:00Z is 21:00 on 9 Oct in Melbourne (the org timezone), so the org clock reads 2026-10-09T21:00.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })

function meeting(id: string, over: Record<string, unknown> = {}) {
  return rec(id, {
    title: `Meeting ${id}`, businessId: 'ros', companyId: 'co1', dealId: null, ownerId: 'u-me', participants: ['ct1'], start: '2026-10-12T10:00',
    duration: 30, type: 'Discovery', status: 'upcoming', sections: {}, summary: '', nextSteps: '', createdBy: 'u-me', ...over,
  })
}
const activity = (id: string, type: string, over: Record<string, unknown> = {}) =>
  rec(id, { type, businessId: 'ros', actorId: 'u-me', ts: '2026-10-09T08:00', visibility: 'business', contactId: 'ct1', companyId: 'co1', subject: type, ...over })

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [ROS], ...over }))
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  const meetings = await import('../meetings')
  const archive = await import('../archive')
  return { ...m, Act, Q, meetings, archive }
}

/** Send what is pending and return the ops the browser put on the wire. */
async function sent(m: Awaited<ReturnType<typeof setup>>): Promise<BatchRequest['ops']> {
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

describe('Meeting lifecycle: upcoming means still ahead', () => {
  it('isAhead is upcoming with a future start; isOverdue is upcoming with a start that has passed', async () => {
    const { meetings: M } = await setup()
    const clock = '2026-10-09T21:00'
    expect(M.isAhead({ status: 'upcoming', start: '2026-10-09T21:30' }, clock)).toBe(true)
    expect(M.isAhead({ status: 'upcoming', start: '2026-10-09T21:00:00' }, clock)).toBe(false)
    expect(M.isOverdue({ status: 'upcoming', start: '2026-10-09T09:00' }, clock)).toBe(true)
    for (const status of ['completed', 'cancelled', 'no-show']) {
      expect(M.isAhead({ status, start: '2026-10-12T10:00' }, clock)).toBe(false)
      expect(M.isOverdue({ status, start: '2026-10-01T10:00' }, clock)).toBe(false)
    }
  })

  it('the form offers upcoming and completed for a new meeting, all four for an upcoming one, and nothing but cancelled once cancelled', async () => {
    const { meetings: M } = await setup()
    expect(M.statusOptions(undefined)).toEqual(['upcoming', 'completed'])
    expect(M.statusOptions({ status: 'upcoming' })).toEqual(['upcoming', 'completed', 'cancelled', 'no-show'])
    expect(M.statusOptions({ status: 'cancelled' })).toEqual(['cancelled'])
  })

  it('a completed meeting stays completed; a no-show can be rebooked or recorded as held, never cancelled', async () => {
    const { meetings: M } = await setup()
    expect(M.statusOptions({ status: 'completed' })).toEqual(['completed'])
    expect(M.statusOptions({ status: 'no-show' })).toEqual(['no-show', 'upcoming', 'completed'])
    for (const to of ['upcoming', 'cancelled', 'no-show']) expect(M.canMoveStatus('completed', to)).toBe(false)
    expect(M.canMoveStatus('no-show', 'cancelled')).toBe(false)
    expect(M.canMoveStatus('cancelled', 'upcoming')).toBe(false)
    for (const to of ['completed', 'cancelled', 'no-show']) expect(M.canMoveStatus('upcoming', to)).toBe(true)
  })
})

describe('Act.cancelMeeting', () => {
  it('needs a reason of 1..300 characters and writes nothing without one', async () => {
    const m = await setup({ meetings: [meeting('mt1')] })
    expect(m.Act.cancelMeeting('mt1', '   ')).toEqual({ ok: false, reason: 'reason_required' })
    expect(m.Act.cancelMeeting('mt1', 'x'.repeat(301))).toEqual({ ok: false, reason: 'reason_too_long' })
    expect(m.Q.meeting('mt1')?.status).toBe('upcoming')
    expect(m.Act.cancelMeeting('nope', 'Because')).toEqual({ ok: false, reason: 'missing' })
  })

  it('sets status, cancelledAt and cancelReason, and never writes the server-set cancelledBy', async () => {
    const m = await setup({ meetings: [meeting('mt1')] })
    expect(m.Act.cancelMeeting('mt1', '  Client is on leave  ')).toEqual({ ok: true })
    const mt = m.Q.meeting('mt1')
    expect(mt).toMatchObject({ status: 'cancelled', cancelledAt: '2026-10-09T21:00', cancelReason: 'Client is on leave' })
    const op = (await sent(m)).find(o => o.collection === 'meetings')
    expect(op?.op).toBe('put')
    const set = (op as { set: Record<string, unknown> }).set
    expect(set).toMatchObject({ status: 'cancelled', cancelledAt: '2026-10-09T21:00', cancelReason: 'Client is on leave' })
    expect(set).not.toHaveProperty('cancelledBy')
    expect(m.Act.cancelMeeting('mt1', 'Again')).toEqual({ ok: false, reason: 'not_upcoming' })
  })

  it('refuses a completed or no-show meeting: only an upcoming meeting is cancelled', async () => {
    const m = await setup({ meetings: [meeting('held', { status: 'completed' }), meeting('missed', { status: 'no-show' })] })
    expect(m.Act.cancelMeeting('held', 'Wrongly recorded')).toEqual({ ok: false, reason: 'not_upcoming' })
    expect(m.Act.cancelMeeting('missed', 'They never came')).toEqual({ ok: false, reason: 'not_upcoming' })
    expect(m.Q.meeting('held')).toMatchObject({ status: 'completed' })
    expect(m.Q.meeting('held')?.cancelReason).toBeUndefined()
    expect(m.Q.meeting('missed')?.status).toBe('no-show')
  })

  it('cancelling through the meeting form (saveMeeting) stamps cancelledAt too', async () => {
    const m = await setup({ meetings: [meeting('mt1')] })
    m.Act.saveMeeting({ id: 'mt1', title: 'Meeting mt1', businessId: 'ros', start: '2026-10-12T10:00', status: 'cancelled', cancelReason: 'Moved to email' })
    expect(m.Q.meeting('mt1')).toMatchObject({ status: 'cancelled', cancelledAt: '2026-10-09T21:00', cancelReason: 'Moved to email' })
  })
})

describe('Act.markMeetingNoShow and Act.rescheduleMeeting', () => {
  it('marks an upcoming meeting no-show, and refuses any other', async () => {
    const m = await setup({ meetings: [meeting('mt1', { start: '2026-10-09T09:00' }), meeting('mt2', { status: 'completed' })] })
    expect(m.Act.markMeetingNoShow('mt1')).toEqual({ ok: true })
    expect(m.Q.meeting('mt1')?.status).toBe('no-show')
    expect(m.Act.markMeetingNoShow('mt2')).toEqual({ ok: false, reason: 'not_upcoming' })
    expect(m.Q.meeting('mt2')?.status).toBe('completed')
  })

  it('moves the start, keeps it upcoming and appends each old start to rescheduledFrom', async () => {
    const m = await setup({ meetings: [meeting('mt1', { start: '2026-10-09T09:00' })] })
    expect(m.Act.rescheduleMeeting('mt1', '2026-10-15T14:00')).toEqual({ ok: true })
    expect(m.Act.rescheduleMeeting('mt1', '2026-10-16T09:30')).toEqual({ ok: true })
    expect(m.Q.meeting('mt1')).toMatchObject({ status: 'upcoming', start: '2026-10-16T09:30', rescheduledFrom: ['2026-10-09T09:00', '2026-10-15T14:00'] })
    expect(m.Act.rescheduleMeeting('mt1', '2026-10-16T09:30')).toEqual({ ok: false, reason: 'same_start' })
    expect(m.Act.rescheduleMeeting('mt1', '16/10/2026')).toEqual({ ok: false, reason: 'bad_start' })
  })

  it('moving an upcoming meeting from the meeting form (saveMeeting) keeps the old start, like Reschedule', async () => {
    const m = await setup({ meetings: [meeting('mt1', { start: '2026-10-09T09:00' })] })
    const before = m.store.S.activities.length
    m.Act.saveMeeting({ id: 'mt1', title: 'Meeting mt1', businessId: 'ros', start: '2026-10-15T14:00', status: 'upcoming' })
    expect(m.Q.meeting('mt1')).toMatchObject({ status: 'upcoming', start: '2026-10-15T14:00', rescheduledFrom: ['2026-10-09T09:00'] })
    expect(m.store.S.audit.at(-1)).toMatchObject({ action: 'Meeting rescheduled' })
    // Saving again at the same start is not a move, and the form cannot overwrite the history.
    m.Act.saveMeeting({ id: 'mt1', title: 'Meeting mt1', businessId: 'ros', start: '2026-10-15T14:00', status: 'upcoming', rescheduledFrom: [] })
    expect(m.Q.meeting('mt1')?.rescheduledFrom).toEqual(['2026-10-09T09:00'])
    expect(m.store.S.activities).toHaveLength(before)
    const op = (await sent(m)).find(o => o.collection === 'meetings')
    expect((op as { set: Record<string, unknown> }).set).toMatchObject({ start: '2026-10-15T14:00', rescheduledFrom: ['2026-10-09T09:00'] })
  })

  it('recording an overdue meeting as held on a corrected date keeps the booked start in its history', async () => {
    const m = await setup({ meetings: [meeting('mt1', { start: '2026-10-08T09:00' })] })
    m.Act.saveMeeting({ id: 'mt1', title: 'Meeting mt1', businessId: 'ros', start: '2026-10-09T11:00', status: 'completed' })
    expect(m.Q.meeting('mt1')).toMatchObject({ status: 'completed', start: '2026-10-09T11:00', rescheduledFrom: ['2026-10-08T09:00'] })
  })

  it('editing a completed meeting without moving it adds no history', async () => {
    const m = await setup({ meetings: [meeting('mt1', { status: 'completed', start: '2026-10-08T09:00' })] })
    m.Act.saveMeeting({ id: 'mt1', title: 'Renamed', businessId: 'ros', start: '2026-10-08T09:00', status: 'completed' })
    expect(m.Q.meeting('mt1')?.rescheduledFrom).toBeUndefined()
    expect(m.store.S.audit.at(-1)).toMatchObject({ action: 'Meeting updated', target: 'Renamed' })
  })

  it('does not write a new booking when a meeting is rescheduled', async () => {
    const m = await setup({ meetings: [meeting('mt1')] })
    const before = m.store.S.activities.length
    m.Act.rescheduleMeeting('mt1', '2026-10-20T10:00')
    expect(m.store.S.activities).toHaveLength(before)
  })
})

describe('Act.deleteMeeting', () => {
  it('removes the meeting and sends a delete op; its activities stay', async () => {
    const m = await setup({ meetings: [meeting('mt1')], activities: [activity('a1', 'meeting_booked', { meetingId: 'mt1' })] })
    expect(m.Act.deleteMeeting('mt1')).toEqual({ ok: true })
    expect(m.Q.meeting('mt1')).toBeUndefined()
    expect(m.store.S.activities.map(a => a.id)).toEqual(['a1'])
    const ops = await sent(m)
    expect(ops.find(o => o.collection === 'meetings')).toMatchObject({ op: 'delete', id: 'mt1' })
  })
})

describe('Counting: booked vs held', () => {
  const world = () => ({
    meetings: [meeting('held'), meeting('missed'), meeting('called-off')],
    activities: [
      activity('b1', 'meeting_booked', { meetingId: 'held' }), activity('b2', 'meeting_booked', { meetingId: 'missed' }), activity('b3', 'meeting_booked', { meetingId: 'called-off' }),
      activity('h1', 'meeting', { meetingId: 'held' }), activity('h2', 'meeting', { meetingId: 'missed' }), activity('h3', 'meeting', { meetingId: 'called-off' }),
      activity('h4', 'meeting'),
    ],
  })

  it('meetings_held counts only meetings still completed; meetings (booked) keeps a later-cancelled booking', async () => {
    const w = world()
    w.meetings = [meeting('held', { status: 'completed' }), meeting('missed', { status: 'no-show' }), meeting('called-off', { status: 'cancelled' })]
    const m = await setup(w)
    const range: [string, string] = ['2026-10-01T00:00', '2026-10-31T23:59']
    // held + the older activity with no meetingId; the no-show and cancelled meetings' held activities drop out.
    expect(m.Q.metric(['u-me'], 'meetings_held', ...range)).toBe(2)
    // Every booking still counts: the meeting was booked even if it was later cancelled or missed.
    expect(m.Q.metric(['u-me'], 'meetings', ...range)).toBe(3)
  })

  it('countableActs (dashboard and reports) leaves out a held activity whose meeting is now cancelled or no-show', async () => {
    const w = world()
    w.meetings = [meeting('held', { status: 'completed' }), meeting('missed', { status: 'no-show' }), meeting('called-off', { status: 'cancelled' })]
    const m = await setup(w)
    const ids = m.archive.countableActs(m.store.S.activities).map(a => a.id)
    expect(ids).toEqual(['b1', 'b2', 'b3', 'h1', 'h4'])
  })

  it('a completed meeting cannot be changed to no-show, cancelled or upcoming from the form, so it keeps counting as held', async () => {
    const m = await setup({ meetings: [], activities: [] })
    const mt = m.Act.saveMeeting({ title: 'Kick-off', businessId: 'ros', start: '2026-10-09T09:00', status: 'completed', companyId: 'co1', participants: ['ct1'] })
    const range: [string, string] = ['2026-10-01T00:00', '2026-10-31T23:59']
    expect(m.Q.metric(['u-me'], 'meetings_held', ...range)).toBe(1)
    for (const status of ['no-show', 'cancelled', 'upcoming']) {
      m.Act.saveMeeting({ id: mt.id, title: 'Kick-off', businessId: 'ros', start: '2026-10-09T09:00', status, cancelReason: 'x' })
      expect(m.Q.meeting(mt.id)?.status).toBe('completed')
      expect(m.Q.metric(['u-me'], 'meetings_held', ...range)).toBe(1)
    }
    expect(m.Q.meeting(mt.id)?.cancelledAt).toBeUndefined()
    expect(m.store.S.audit.map(a => a.action)).not.toContain('Meeting marked no-show')
  })

  it('a meeting wrongly recorded as held is corrected by voiding its activity', async () => {
    const m = await setup({ meetings: [], activities: [] })
    const mt = m.Act.saveMeeting({ title: 'Kick-off', businessId: 'ros', start: '2026-10-09T09:00', status: 'completed', companyId: 'co1', participants: ['ct1'] })
    const range: [string, string] = ['2026-10-01T00:00', '2026-10-31T23:59']
    const held = m.store.S.activities.find(a => a.type === 'meeting' && a.meetingId === mt.id)
    expect(held).toBeDefined()
    expect(m.Act.voidActivity(held!.id, 'Never happened')).toMatchObject({ ok: true })
    expect(m.Q.metric(['u-me'], 'meetings_held', ...range)).toBe(0)
  })

  it('marking an upcoming meeting no-show from the form gets its own audit entry', async () => {
    const m = await setup({ meetings: [meeting('mt1', { start: '2026-10-09T09:00' })] })
    m.Act.saveMeeting({ id: 'mt1', title: 'Meeting mt1', businessId: 'ros', start: '2026-10-09T09:00', status: 'no-show' })
    expect(m.Q.meeting('mt1')?.status).toBe('no-show')
    expect(m.store.S.audit.at(-1)).toMatchObject({ action: 'Meeting marked no-show', target: 'Meeting mt1' })
  })
})

describe("Call outcome 'Meeting Booked' creates a dated meeting", () => {
  it('Act.logCall with a meeting: one upcoming Meeting and exactly one booking that points at it', async () => {
    const m = await setup({ meetings: [], activities: [] })
    m.Act.logCall({ businessId: 'ros', contactId: 'ct1', companyId: null, dealId: null, outcome: 'Meeting Booked', notes: '', meeting: { start: '2026-10-14T11:00', duration: 45 } })
    const S = m.store.S
    expect(S.meetings).toHaveLength(1)
    const mt = S.meetings[0]
    expect(mt).toMatchObject({ status: 'upcoming', start: '2026-10-14T11:00', duration: 45, companyId: 'co1', participants: ['ct1'], ownerId: 'u-me', title: 'Meeting with Sam Buyer' })
    const booked = S.activities.filter(a => a.type === 'meeting_booked')
    expect(booked).toHaveLength(1)
    expect(booked[0].meetingId).toBe(mt.id)
    expect(S.activities.filter(a => a.type === 'call')).toHaveLength(1)
    expect(m.meetings.isAhead(mt, '2026-10-09T21:00')).toBe(true)
  })

  it('Act.logCall without a meeting keeps the old single booking activity (no Meeting record)', async () => {
    const m = await setup({ meetings: [], activities: [] })
    m.Act.logCall({ businessId: 'ros', contactId: 'ct1', companyId: 'co1', dealId: null, outcome: 'Meeting Booked', notes: '' })
    expect(m.store.S.meetings).toHaveLength(0)
    expect(m.store.S.activities.filter(a => a.type === 'meeting_booked')).toHaveLength(1)
  })

  it('Act.completeTask on a call task with a meeting books it with the task contact, company and deal', async () => {
    const m = await setup({
      meetings: [], activities: [],
      tasks: [rec('tk1', { title: 'Call Sam', type: 'Call', status: 'Not Started', priority: 'Normal', assigneeId: 'u-me', due: '2026-10-09T09:00', createdAt: '2026-10-09T08:00', source: 'Manual', businessId: 'ros', companyId: 'co1', contactId: 'ct1', dealId: null })],
    })
    m.Act.completeTask('tk1', { outcome: 'Meeting Booked', notes: '', meeting: { start: '2026-10-13T15:30' } })
    const S = m.store.S
    expect(S.meetings).toHaveLength(1)
    expect(S.meetings[0]).toMatchObject({ status: 'upcoming', start: '2026-10-13T15:30', duration: 30, companyId: 'co1', participants: ['ct1'] })
    const booked = S.activities.filter(a => a.type === 'meeting_booked')
    expect(booked).toHaveLength(1)
    expect(booked[0].meetingId).toBe(S.meetings[0].id)
  })
})
