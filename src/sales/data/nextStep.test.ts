import { describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../testing/fixtures'
import { loadSales } from '../testing/load'
import { rosterioWorld, setRole } from '../testing/rosterioWorld'

// A deal's next step is its earliest open task or upcoming meeting: a booked meeting is a next step, so the deal is not flagged.

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const later = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 16)
const meeting = (id: string, start: string, o: Record<string, unknown> = {}) => rec(id, { title: 'Ozdare — discovery meeting', businessId: 'ros', companyId: 'co1', dealId: 'dl1', ownerId: 'u-me', participants: [], start, duration: 30, type: 'Discovery', status: 'upcoming', sections: {}, summary: '', ...o })
const task = (id: string, due: string) => rec(id, { businessId: 'ros', companyId: 'co1', dealId: 'dl1', title: 'Send proposal', type: 'To-do', status: 'Not Started', priority: 'Medium', assigneeId: 'u-me', due })

async function world(o: { meetings?: ReturnType<typeof rec>[]; tasks?: ReturnType<typeof rec>[] }) {
  const m = await loadSales()
  const w = rosterioWorld()
  w.collections.meetings = o.meetings ?? []
  w.collections.tasks = o.tasks ?? []
  m.bootstrap.hydrate(w)
  setRole(m, 'sales')
  const { Q } = await import('./Q')
  const d = m.store.S.deals.find(x => x.id === 'dl1')!
  return { Q, d }
}

describe('a deal\'s next step', () => {
  it('an upcoming meeting counts: no "No next step scheduled"', async () => {
    const { Q, d } = await world({ meetings: [meeting('mt1', later(4))] })
    expect(Q.nextStep(d)).toMatchObject({ kind: 'meeting', meeting: { id: 'mt1' } })
    expect(Q.risk(d)?.reasons ?? []).not.toContain('No next step scheduled')
  })

  it('whichever comes first of a task and a meeting', async () => {
    const soonTask = await world({ meetings: [meeting('mt1', later(4))], tasks: [task('tk1', later(2))] })
    expect(soonTask.Q.nextStep(soonTask.d)?.kind).toBe('task')
    const soonMeeting = await world({ meetings: [meeting('mt1', later(1))], tasks: [task('tk1', later(5))] })
    expect(soonMeeting.Q.nextStep(soonMeeting.d)?.kind).toBe('meeting')
  })

  it('a meeting in the past (waiting for its outcome) or a cancelled one is not a next step', async () => {
    const past = await world({ meetings: [meeting('mt1', later(-2))] })
    expect(past.Q.nextStep(past.d)).toBeUndefined()
    expect(past.Q.risk(past.d)?.reasons).toContain('No next step scheduled')
    const cancelled = await world({ meetings: [meeting('mt1', later(3), { status: 'cancelled' })] })
    expect(cancelled.Q.nextStep(cancelled.d)).toBeUndefined()
  })
})
