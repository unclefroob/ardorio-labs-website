import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailTask, rec, salesWorld } from '../testing/fixtures'
import { loadSales } from '../testing/load'
import { isSimAct, isSimMsg, realActs, simReplied, simThread } from './simulated'
import type { Activity, Message, Thread } from './types'

vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../api/engine', () => ({ nudge: vi.fn(() => Promise.resolve({ ran: true, businessIds: [], serverNow: '' })) }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

const msg = (o: Partial<Message>): Message => ({ id: 'm', threadId: 't', dir: 'out', from: 'a@x', to: 'b@x', subject: 's', body: '', ts: '2026-10-09T09:00', status: 'sent', ...o })
const act = (o: Partial<Activity>): Activity => ({ id: 'a', type: 'email_out', businessId: 'ros', actorId: 'u-me', ts: '2026-10-09T09:00', visibility: 'business', ...o })
const thread = (o: Partial<Thread> = {}): Thread => ({
  id: 't', businessId: 'ros', mailboxId: 'mb1', subject: 's', dealId: null, visibility: 'shared', ownerId: 'u-me', assigneeId: 'u-me',
  unread: false, archived: false, classification: null, needsReply: false, sharedWith: [], updatedAt: '2026-10-09T09:00', ...o,
})

describe('isSimMsg', () => {
  it('trusts the flag either way', () => {
    expect(isSimMsg(msg({ simulated: true }))).toBe(true)
    expect(isSimMsg(msg({ simulated: false }))).toBe(false)
    expect(isSimMsg(msg({ dir: 'in', status: 'received', simulated: false }))).toBe(false)
  })
  it('treats a hand-sent message as real', () => {
    expect(isSimMsg(msg({ manual: true }))).toBe(false)
  })
  it('identifies legacy simulated sends and replies without the flag', () => {
    expect(isSimMsg(msg({}))).toBe(true)
    expect(isSimMsg(msg({ dir: 'in', status: 'received' }))).toBe(true)
  })
  it('never calls a draft, queued or discarded message simulated', () => {
    for (const status of ['draft', 'pending', 'discarded']) expect(isSimMsg(msg({ status, simulated: true }))).toBe(false)
  })
})

describe('isSimAct', () => {
  it('trusts the flag and the manual flag', () => {
    expect(isSimAct(act({ simulated: true, type: 'meeting_booked' }))).toBe(true)
    expect(isSimAct(act({ manual: true, desc: 'x (simulated)' }))).toBe(false)
    expect(isSimAct(act({ type: 'email_in', simulated: false }))).toBe(false)
  })
  it('identifies legacy simulated activities', () => {
    expect(isSimAct(act({ desc: 'Sent from me@example.com (simulated)' }))).toBe(true)
    expect(isSimAct(act({ type: 'email_in' }))).toBe(true)
    expect(isSimAct(act({ type: 'email_open', subject: 'Email opened (simulated tracking — unreliable signal)' }))).toBe(true)
    expect(isSimAct(act({ type: 'link_click', subject: 'Tracked link clicked (simulated)' }))).toBe(true)
  })
  it('leaves real activity alone', () => {
    expect(isSimAct(act({ desc: 'Sent manually from me@example.com (marked as sent)' }))).toBe(false)
    expect(isSimAct(act({ type: 'call' }))).toBe(false)
    expect(isSimAct(act({ type: 'meeting_booked', subject: 'Meeting booked via scheduling link' }))).toBe(false)
  })
  it('realActs drops only simulated activity', () => {
    const a = [act({ id: '1', simulated: true }), act({ id: '2', manual: true }), act({ id: '3', type: 'call' })]
    expect(realActs(a).map(x => x.id)).toEqual(['2', '3'])
  })
})

describe('simThread and simReplied', () => {
  it('is all, some or null by the messages that were sent or received', () => {
    expect(simThread(thread(), [msg({ simulated: true }), msg({ dir: 'in', status: 'received', simulated: true })])).toBe('all')
    expect(simThread(thread(), [msg({ manual: true }), msg({ dir: 'in', status: 'received', simulated: true })])).toBe('some')
    expect(simThread(thread(), [msg({ manual: true })])).toBe(null)
  })
  it('uses the thread flag only when nothing was sent yet', () => {
    expect(simThread(thread({ simulated: true }), [msg({ status: 'draft' })])).toBe('all')
    expect(simThread(thread(), [msg({ status: 'draft' })])).toBe(null)
    expect(simThread(thread({ simulated: true }), [msg({ manual: true })])).toBe(null)
  })
  it('simReplied looks at the latest inbound message', () => {
    const real = msg({ dir: 'in', status: 'received', simulated: false, ts: '2026-10-09T08:00' })
    const sim = msg({ dir: 'in', status: 'received', simulated: true, ts: '2026-10-09T09:00' })
    expect(simReplied(thread(), [real, sim])).toBe(true)
    expect(simReplied(thread(), [sim, { ...real, ts: '2026-10-09T09:30' }])).toBe(false)
    expect(simReplied(thread(), [msg({ manual: true })])).toBe(false)
  })
})

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ tasks: [rec('tk_en1_0', emailTask())], ...over }))
  const { Act } = await import('./Act')
  const { Q } = await import('./Q')
  return { ...m, Act, Q }
}

describe('simulated paths write the flag', () => {
  it('sendEmail flags the new thread, the message and the activity', async () => {
    const m = await setup()
    const r = m.Act.sendEmail({ mailboxId: 'mb1', businessId: 'ros', to: 'sam@example.com', subject: 'Hi', body: 'Body', contactId: 'ct1' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.thread.simulated).toBe(true)
    expect(r.msg).toMatchObject({ status: 'sent', simulated: true })
    expect(m.store.S.activities.find(a => a.messageId === r.msg.id)).toMatchObject({ type: 'email_out', simulated: true })
  })

  it('a saved draft is not flagged as a simulated send', async () => {
    const m = await setup()
    const r = m.Act.sendEmail({ mailboxId: 'mb1', businessId: 'ros', to: 'sam@example.com', subject: 'Hi', body: 'Body', contactId: 'ct1', draft: true })
    expect(r.ok && r.msg.simulated).toBeFalsy()
  })

  it('simulateReply flags the message and the email_in activity', async () => {
    const m = await setup()
    const t = m.Act.simulateReply({ contactId: 'ct1', text: 'Happy to chat next week', threadId: 'th1' })
    expect(t?.id).toBe('th1')
    const inbound = m.store.S.messages.find(x => x.threadId === 'th1' && x.dir === 'in')
    expect(inbound?.simulated).toBe(true)
    expect(m.store.S.activities.find(a => a.messageId === inbound?.id)).toMatchObject({ type: 'email_in', simulated: true })
  })

  it('markEmailSent stays real', async () => {
    const m = await setup()
    m.Act.markEmailSent('tk_en1_0')
    const a = m.store.S.activities.find(x => x.id === 'ac_ms_tk_en1_0')
    expect(a && isSimAct(a)).toBe(false)
    const ms = m.store.S.messages.find(x => x.id === 'ms_tk_en1_0')
    expect(ms && isSimMsg(ms)).toBe(false)
  })

})
