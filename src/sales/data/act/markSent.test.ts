import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailTask, rec, salesWorld, suppression } from '../../testing/fixtures'
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

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ tasks: [rec('tk_en1_0', emailTask())], ...over }))
  const { Act } = await import('../Act')
  return { ...m, Act }
}

describe('Act.markEmailSent', () => {
  it('creates the thread, the manual message, the activity, and completes the task', async () => {
    const m = await setup()
    const S = m.store.S
    const r = m.Act.markEmailSent('tk_en1_0')
    expect(r).toEqual({ ok: true })
    expect(S.threads).toHaveLength(2)
    const th = S.threads.find(t => t.id !== 'th1')!
    expect(th).toMatchObject({ contactId: 'ct1', enrolmentId: 'en1', visibility: 'private', mailboxId: 'mb1', businessId: 'ros' })
    const msg = S.messages.find(x => x.id === 'ms_tk_en1_0')!
    expect(msg).toMatchObject({
      threadId: th.id, dir: 'out', status: 'sent', manual: true, enrolmentId: 'en1', stepId: 'st1', mailboxId: 'mb1',
      from: 'me@example.com', to: 'sam@example.com', subject: 'Quick question about Acme', body: 'Hi Sam,\nGot a minute?', sentAt: '2026-10-09T10:00:00.000Z',
    })
    expect(S.activities.find(a => a.id === 'ac_ms_tk_en1_0')).toMatchObject({ type: 'email_out', manual: true, taskId: 'tk_en1_0', messageId: 'ms_tk_en1_0', contactId: 'ct1' })
    expect(S.tasks[0]).toMatchObject({ status: 'Completed', outcome: 'Sent (manual)' })
    expect(S.tasks[0].completedAt).toBeTruthy()
    expect(S.enrolments[0].threadId).toBe(th.id)
  })

  it('does not advance the enrolment (the server does)', async () => {
    const m = await setup()
    m.Act.markEmailSent('tk_en1_0')
    expect(m.store.S.enrolments[0]).toMatchObject({ status: 'awaiting_task', stepIdx: 0, taskId: 'tk_en1_0' })
  })

  it('reuses the enrolment thread when it has one', async () => {
    const m = await setup({
      enrolments: [rec('en1', { seqId: 'sq1', contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', mailboxId: 'mb1', status: 'awaiting_task', stepIdx: 0, nextDue: null, startedAt: '2026-10-09T09:00', threadId: 'th1', history: [], reason: '', taskId: 'tk_en1_0' })],
    })
    m.Act.markEmailSent('tk_en1_0')
    expect(m.store.S.threads).toHaveLength(1)
    expect(m.store.S.messages.find(x => x.id === 'ms_tk_en1_0')?.threadId).toBe('th1')
  })

  it('is idempotent: a second call writes nothing and reports duplicate', async () => {
    const m = await setup()
    m.Act.markEmailSent('tk_en1_0')
    const S = m.store.S
    const counts = [S.messages.length, S.activities.length, S.threads.length, S.audit.length]
    expect(m.Act.markEmailSent('tk_en1_0')).toEqual({ ok: false, reason: 'duplicate' })
    expect([S.messages.length, S.activities.length, S.threads.length, S.audit.length]).toEqual(counts)
  })

  it('is blocked, writing nothing, when the contact is suppressed', async () => {
    const m = await setup({ suppressions: [rec('sp1', suppression({ contactId: 'ct1' }))] })
    const S = m.store.S
    const r = m.Act.markEmailSent('tk_en1_0')
    expect(r).toEqual({ ok: false, reason: 'suppressed' })
    expect(S.messages).toHaveLength(0)
    expect(S.threads).toHaveLength(1)
    expect(S.tasks[0].status).toBe('Not Started')
  })

  it('is blocked when a cc address is suppressed', async () => {
    const t = emailTask({ draft: { from: 'me@example.com', to: 'sam@example.com', cc: 'boss@example.com', subject: 'S', body: 'B' } })
    const m = await setup({ tasks: [rec('tk_en1_0', t)], suppressions: [rec('sp1', suppression({ contactId: 'zz', email: 'Boss@Example.com' }))] })
    expect(m.Act.markEmailSent('tk_en1_0')).toEqual({ ok: false, reason: 'suppressed' })
  })

  it('reports no_task for an unknown, non-email or already-cancelled task', async () => {
    const m = await setup({ tasks: [rec('tk_en1_0', emailTask({ status: 'Cancelled' })), rec('tk9', emailTask({ kind: undefined }))] })
    expect(m.Act.markEmailSent('nope')).toEqual({ ok: false, reason: 'no_task' })
    expect(m.Act.markEmailSent('tk9')).toEqual({ ok: false, reason: 'no_task' })
    expect(m.Act.markEmailSent('tk_en1_0')).toEqual({ ok: false, reason: 'no_task' })
  })

  it('a shared mailbox creates a shared thread', async () => {
    const m = await setup({
      mailboxes: [rec('mb1', { address: 'team@example.com', name: 'Team', type: 'shared', businessIds: ['ros'], ownerId: null, authorised: ['u-me'], status: 'connected', canSend: true })],
    })
    m.Act.markEmailSent('tk_en1_0')
    expect(m.store.S.threads.find(t => t.id !== 'th1')?.visibility).toBe('shared')
  })

  it('applies the Re: rule when the enrolment thread has a different subject', async () => {
    const m = await setup({
      enrolments: [rec('en1', { seqId: 'sq1', contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', mailboxId: 'mb1', status: 'awaiting_task', stepIdx: 1, nextDue: null, startedAt: '2026-10-09T09:00', threadId: 'th1', history: [], reason: '', taskId: 'tk_en1_1' })],
      tasks: [rec('tk_en1_1', emailTask({ stepIdx: 1, draft: { from: 'me@example.com', to: 'sam@example.com', cc: '', subject: 'Following up', body: 'x' } }))],
    })
    m.Act.markEmailSent('tk_en1_1')
    expect(m.store.S.messages.find(x => x.id === 'ms_tk_en1_1')?.subject).toBe('Re: Hello')
  })
})
