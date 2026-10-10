import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailTask, rec, salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../api/engine', () => ({ nudge: vi.fn(() => Promise.resolve({ ran: true, businessIds: [], serverNow: '' })) }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

const callTask = (over: Record<string, unknown> = {}) => ({
  title: 'Call Sam', type: 'Call', desc: '', businessId: 'ros', assigneeId: 'u-me', priority: 'Medium', due: '2026-10-09T09:00', status: 'Not Started',
  contactId: 'ct1', companyId: 'co1', seqId: 'sq1', enrolmentId: 'en1', stepId: 'st2', source: 'Sequence: Cold', createdAt: '2026-10-09T09:00', ...over,
})

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ tasks: [rec('tk_en1_0', emailTask())], ...over }))
  const { Act } = await import('../Act')
  return { ...m, Act }
}

describe('Act.completeTask', () => {
  it('refuses an email task: nothing is written', async () => {
    const m = await setup()
    const S = m.store.S
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    m.Act.completeTask('tk_en1_0', { outcome: 'Done' })
    expect(S.tasks[0].status).toBe('Not Started')
    expect(S.activities).toHaveLength(0)
    expect(S.enrolments[0].status).toBe('awaiting_task')
    warn.mockRestore()
  })

  it('no longer advances an awaiting_task enrolment (the server does)', async () => {
    const m = await setup({
      tasks: [rec('tk_en1_1', callTask())],
      enrolments: [rec('en1', { seqId: 'sq1', contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', mailboxId: 'mb1', status: 'awaiting_task', stepIdx: 1, nextDue: null, startedAt: '2026-10-09T09:00', threadId: null, history: [], reason: '', taskId: 'tk_en1_1' })],
    })
    m.Act.completeTask('tk_en1_1', { outcome: 'Connected' })
    expect(m.store.S.tasks[0].status).toBe('Completed')
    expect(m.store.S.enrolments[0]).toMatchObject({ status: 'awaiting_task', stepIdx: 1, nextDue: null })
  })

  it('keeps the Meeting Booked exit for an awaiting_task enrolment', async () => {
    const m = await setup({
      tasks: [rec('tk_en1_1', callTask())],
      enrolments: [rec('en1', { seqId: 'sq1', contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', mailboxId: 'mb1', status: 'awaiting_task', stepIdx: 1, nextDue: null, startedAt: '2026-10-09T09:00', threadId: null, history: [], reason: '', taskId: 'tk_en1_1' })],
    })
    m.Act.completeTask('tk_en1_1', { outcome: 'Meeting Booked' })
    expect(m.store.S.enrolments[0]).toMatchObject({ status: 'completed', reason: 'Meeting booked', nextDue: null })
  })
})

describe('Act.skipEmailTask', () => {
  it('cancels with outcome Skipped, writes ac_sk_<taskId>, leaves the enrolment alone', async () => {
    const m = await setup()
    const S = m.store.S
    expect(m.Act.skipEmailTask('tk_en1_0')).toEqual({ ok: true })
    expect(S.tasks[0]).toMatchObject({ status: 'Cancelled', outcome: 'Skipped' })
    expect(S.tasks[0].completedAt).toBeTruthy()
    expect(S.activities.find(a => a.id === 'ac_sk_tk_en1_0')).toMatchObject({ type: 'seq_paused', subject: 'Email step skipped', taskId: 'tk_en1_0', contactId: 'ct1' })
    expect(S.enrolments[0]).toMatchObject({ status: 'awaiting_task', stepIdx: 0 })
    expect(S.messages).toHaveLength(0)
  })

  it('is idempotent and ignores non-email tasks', async () => {
    const m = await setup({ tasks: [rec('tk_en1_0', emailTask()), rec('tk9', callTask())] })
    m.Act.skipEmailTask('tk_en1_0')
    const n = m.store.S.activities.length
    expect(m.Act.skipEmailTask('tk_en1_0')).toEqual({ ok: false, reason: 'no_task' })
    expect(m.Act.skipEmailTask('tk9')).toEqual({ ok: false, reason: 'no_task' })
    expect(m.store.S.activities).toHaveLength(n)
  })
})

describe('Act.stopEmailing', () => {
  it('removes the enrolment and cancels the task, with no suppression', async () => {
    const m = await setup()
    const S = m.store.S
    expect(m.Act.stopEmailing('tk_en1_0')).toEqual({ ok: true })
    expect(S.enrolments[0]).toMatchObject({ status: 'removed', reason: 'Rep chose not to send', nextDue: null })
    expect(S.tasks[0]).toMatchObject({ status: 'Cancelled', outcome: 'Enrolment removed' })
    expect(S.suppressions).toHaveLength(0)
  })

  it('ignores non-email tasks', async () => {
    const m = await setup({ tasks: [rec('tk9', callTask())] })
    expect(m.Act.stopEmailing('tk9')).toEqual({ ok: false, reason: 'no_task' })
    expect(m.store.S.enrolments[0].status).toBe('awaiting_task')
  })
})

describe('Act.updateTask', () => {
  it('a status edit cannot mark an email task Completed', async () => {
    const m = await setup()
    m.Act.updateTask('tk_en1_0', { status: 'Completed', title: 'Renamed' })
    expect(m.store.S.tasks[0]).toMatchObject({ status: 'Not Started', title: 'Renamed' })
  })
})
