import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld, suppression } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup(sup: Array<Record<string, unknown>> = [], over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ suppressions: sup.map((s, i) => rec(`sp${i}`, suppression(s))), ...over }))
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  return { ...m, Act, Q }
}

const form = (over: Record<string, unknown> = {}) => ({
  mailboxId: 'mb1', businessId: 'ros' as const, to: 'someone@else.com', subject: 'Hi', body: 'Body', contactId: 'ct1', ...over,
})

function counts(m: Awaited<ReturnType<typeof setup>>) {
  const S = m.store.S
  return [S.messages.length, S.threads.length, S.activities.length, S.audit.length]
}

describe('Act.sendEmail suppression (bug 2)', () => {
  it('refuses when the contact is suppressed by contactId, and writes nothing', async () => {
    const m = await setup([{ contactId: 'ct1', email: undefined }])
    const before = counts(m)
    const r = m.Act.sendEmail(form())
    expect(r).toMatchObject({ ok: false, reason: 'suppressed' })
    expect(counts(m)).toEqual(before)
  })

  it('refuses a typed address that matches a suppression email, case-insensitively', async () => {
    const m = await setup([{ contactId: 'zz', email: 'someone@else.com' }])
    expect(m.Act.sendEmail(form({ to: 'Someone@Else.com', contactId: undefined }))).toMatchObject({ ok: false, reason: 'suppressed' })
  })

  it('refuses the contact email2 (suppression recorded against the primary email)', async () => {
    const m = await setup([{ contactId: 'ct1', email: 'sam@example.com' }])
    const r = m.Act.sendEmail(form({ to: 'sam.alt@example.com', contactId: undefined }))
    expect(r).toMatchObject({ ok: false, reason: 'suppressed' })
  })

  it('refuses a cc that is suppressed', async () => {
    const m = await setup([{ contactId: 'zz', email: 'boss@else.com' }])
    const r = m.Act.sendEmail(form({ to: 'fine@else.com', cc: 'ok@else.com, Boss@Else.com', contactId: undefined }))
    expect(r).toMatchObject({ ok: false, reason: 'suppressed' })
    expect((r as { detail?: string }).detail).toContain('boss@else.com')
  })

  it('refuses a reply on a thread whose contact is suppressed', async () => {
    const m = await setup([{ contactId: 'ct1', email: undefined }])
    expect(m.Act.sendEmail(form({ threadId: 'th1', contactId: undefined, to: 'typed@else.com' }))).toMatchObject({ ok: false, reason: 'suppressed' })
  })

  it('only the matching business scope blocks', async () => {
    const m = await setup([{ contactId: 'ct1', scope: 'business', businessId: 'adv' }])
    expect(m.Act.sendEmail(form())).toMatchObject({ ok: true })
  })

  it('a removed suppression does not block', async () => {
    const m = await setup([{ contactId: 'ct1', removed: '2026-10-02T09:00' }])
    expect(m.Act.sendEmail(form())).toMatchObject({ ok: true })
  })

  it('drafts are exempt', async () => {
    const m = await setup([{ contactId: 'ct1' }])
    const r = m.Act.sendEmail(form({ draft: true }))
    expect(r).toMatchObject({ ok: true })
    expect(m.store.S.messages.at(-1)?.status).toBe('draft')
  })

  it('still sends to an unsuppressed address', async () => {
    const m = await setup()
    const r = m.Act.sendEmail(form())
    expect(r).toMatchObject({ ok: true })
    expect(m.store.S.messages.at(-1)).toMatchObject({ status: 'sent', to: 'someone@else.com' })
  })

  it('returns no_mailbox when the mailbox is unknown', async () => {
    const m = await setup()
    expect(m.Act.sendEmail(form({ mailboxId: 'nope' }))).toEqual({ ok: false, reason: 'no_mailbox' })
  })
})

const DELIVERY = { cat: 'Delivery Failure', secondary: null, conf: 0.99, reason: 'bounced', nextAction: 'Fix address', taskTitle: 'Fix', followUpDays: 1, deal: false, returnDate: null }
const UNSUB = { cat: 'Unsubscribe', secondary: null, conf: 0.99, reason: 'stop', nextAction: 'None', taskTitle: 'None', followUpDays: 0, deal: false, returnDate: null }

describe('one suppression path for bounce and unsubscribe (bug 3)', () => {
  it('a Delivery Failure reply creates a suppression and bounces live enrolments', async () => {
    const m = await setup([], { enrolments: [rec('en1', { seqId: 'sq1', contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', mailboxId: 'mb1', status: 'active', stepIdx: 0, nextDue: '2026-10-09T09:00', startedAt: '2026-10-09T09:00', threadId: 'th1', history: [], reason: '' })] })
    expect(m.store.S.suppressions).toHaveLength(0)
    m.Act.simulateReply({ contactId: 'ct1', text: 'Delivery Status Notification (Failure)', threadId: 'th1', classification: DELIVERY })
    const S = m.store.S
    expect(S.suppressions).toHaveLength(1)
    expect(S.suppressions[0]).toMatchObject({ contactId: 'ct1', email: 'sam@example.com', reason: 'Invalid address', scope: 'global' })
    expect(S.enrolments[0]).toMatchObject({ status: 'bounced', nextDue: null })
    expect(S.contacts[0]).toMatchObject({ deliverability: 'Bounced', verification: 'Invalid' })
    expect(m.Q.suppressed(S.contacts[0], 'adv')).toBeTruthy()
    expect(S.activities.some(a => a.type === 'bounce')).toBe(true)
  })

  it('the unsubscribe reply and correctClass produce the same record set', async () => {
    const live = { seqId: 'sq1', contactId: 'ct1', businessId: 'ros', ownerId: 'u-me', mailboxId: 'mb1', status: 'active', stepIdx: 0, nextDue: '2026-10-09T09:00', startedAt: '2026-10-09T09:00', threadId: 'th1', history: [], reason: '' }
    const a = await setup([], { enrolments: [rec('en1', live)] })
    a.Act.simulateReply({ contactId: 'ct1', text: 'stop emailing me', threadId: 'th1', classification: UNSUB })
    const b = await setup([], { enrolments: [rec('en1', live)] })
    b.Act.correctClass('th1', 'Unsubscribe')
    const shape = (m: typeof a) => {
      const S = m.store.S
      return {
        suppressions: S.suppressions.map(s => ({ contactId: s.contactId, email: s.email, scope: s.scope, businessId: s.businessId, reason: s.reason })),
        enrolment: { status: S.enrolments[0].status, nextDue: S.enrolments[0].nextDue },
        rel: { eligible: S.contactRels[0].eligible, leadStatus: S.contactRels[0].leadStatus },
        suppressedActivity: S.activities.filter(x => x.type === 'suppressed').length,
        audit: S.audit.filter(x => /suppression/i.test(x.action)).length,
        notified: S.notifications.length,
      }
    }
    expect(shape(b)).toEqual(shape(a))
    expect(shape(a).suppressions).toHaveLength(1)
    expect(shape(a)).toMatchObject({ enrolment: { status: 'unsubscribed', nextDue: null }, rel: { eligible: false, leadStatus: 'Do Not Contact' }, suppressedActivity: 1 })
  })

  it('suppressing twice does not duplicate the record', async () => {
    const m = await setup()
    m.Act.correctClass('th1', 'Unsubscribe')
    m.Act.correctClass('th1', 'Unsubscribe')
    expect(m.store.S.suppressions).toHaveLength(1)
  })

  it('a global unsubscribe also stops enrolments in other businesses', async () => {
    const other = { seqId: 'sq9', contactId: 'ct1', businessId: 'adv', ownerId: 'u-me', mailboxId: 'mb1', status: 'active', stepIdx: 0, nextDue: '2026-10-09T09:00', startedAt: '2026-10-09T09:00', threadId: null, history: [], reason: '' }
    const m = await setup([], { enrolments: [rec('en1', { ...other, businessId: 'ros', seqId: 'sq1' }), rec('en2', other)] })
    m.Act.simulateReply({ contactId: 'ct1', text: 'remove me everywhere', threadId: 'th1', global: true, classification: UNSUB })
    expect(m.store.S.suppressions[0]).toMatchObject({ scope: 'global', businessId: null })
    expect(m.store.S.enrolments.map(e => e.status)).toEqual(['unsubscribed', 'unsubscribed'])
  })
})

const SOURCES = import.meta.glob<string>(['../types.ts', '../internals.ts', '../../pages/admin/Demo.tsx'], { query: '?raw', import: 'default', eager: true })

describe('the orphaned _bounce hook is gone', () => {
  it('no contact property or reader remains', () => {
    expect(Object.keys(SOURCES)).toHaveLength(3)
    for (const [file, src] of Object.entries(SOURCES)) expect(src, file).not.toContain('_bounce')
  })
})
