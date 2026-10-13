import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'
import { appliedResult, rec } from '../../testing/fixtures'
import { ardDeal, invoicingWorld, PLAN_DATA, setArdRole } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'
import { addDays } from '../../shared/invoices'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T01:00:00.000Z')) })
afterEach(() => { vi.useRealTimers() })

async function setup(role: Parameters<typeof setArdRole>[1] = 'admin', milestones = PLAN_DATA.milestones as Array<Record<string, unknown>>) {
  const m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', { ...PLAN_DATA, milestones }, 2)] }))
  setArdRole(m, role)
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  const { F } = await import('../F')
  const stop = m.sync.startSync()
  const post = vi.mocked(m.records.postBatch)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  post.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({
    serverNow: '2026-10-14T01:00:00.000Z',
    results: req.ops.map((op, i): OpResult => appliedResult(i, op.collection, op.id, 5 + i, { ...(op.op === 'delete' ? {} : op.set ?? {}) })),
  }))
  return { ...m, Act, Q, F, stop, post }
}

describe('Act.markDelivered', () => {
  it('stores the delivered day on that milestone only, with a placeholder deliveredBy, and sends the milestones', async () => {
    const m = await setup()
    const day = m.F.today()
    expect(m.Act.markDelivered('dl1', 'm2', day)).toEqual({ ok: true })
    const ms = m.Q.billingPlan('dl1')!.milestones
    expect(ms[1]).toEqual({ ...PLAN_DATA.milestones[1], deliveredOn: day, deliveredBy: m.Q.me().name })
    expect(ms.filter(x => x.deliveredOn)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(300)
    const op = m.post.mock.calls[0][0].ops.find(o => o.collection === 'billingPlans')
    expect(op).toMatchObject({ op: 'put', id: 'bp_dl1', set: { milestones: expect.arrayContaining([expect.objectContaining({ id: 'm2', deliveredOn: day })]) } })
    m.stop()
  })

  it('takes a past day, refuses a future one or a non-date, and changes nothing then', async () => {
    const m = await setup()
    expect(m.Act.markDelivered('dl1', 'm1', '2026-08-20')).toEqual({ ok: true })
    const before = JSON.stringify(m.Q.billingPlan('dl1'))
    const tomorrow = addDays(m.F.today(), 1)
    expect(m.Act.markDelivered('dl1', 'm2', tomorrow)).toEqual({ ok: false, error: 'The delivered date cannot be in the future' })
    expect(m.Act.markDelivered('dl1', 'm2', 'soon')).toEqual({ ok: false, error: 'Pick the day it was delivered' })
    expect(JSON.stringify(m.Q.billingPlan('dl1'))).toBe(before)
    m.stop()
  })

  it('undo sends an explicit null deliveredOn (the API keeps a missing one), drops deliveredBy and keeps the rest', async () => {
    const m = await setup('admin', [{ ...PLAN_DATA.milestones[0], deliveredOn: '2026-09-01', deliveredBy: 'Ryan' }, ...PLAN_DATA.milestones.slice(1)])
    expect(m.Act.markDelivered('dl1', 'm1', null)).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')!.milestones[0]).toEqual({ ...PLAN_DATA.milestones[0], deliveredOn: null })
    // Undoing one that is not delivered is a no-op, not an error.
    expect(m.Act.markDelivered('dl1', 'm2', null)).toEqual({ ok: true })
    m.stop()
  })

  it('re-saving the same day keeps who delivered it', async () => {
    const m = await setup('admin', [{ ...PLAN_DATA.milestones[0], deliveredOn: '2026-09-01', deliveredBy: 'Ryan' }])
    expect(m.Act.markDelivered('dl1', 'm1', '2026-09-01')).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')!.milestones[0].deliveredBy).toBe('Ryan')
    m.stop()
  })

  it('refuses anyone but an Ardorio admin, and a milestone that is not on the deal', async () => {
    for (const role of ['sales', 'manager', 'viewer'] as const) {
      const m = await setup(role)
      expect(m.Act.markDelivered('dl1', 'm1', '2026-10-01')).toEqual({ ok: false, error: 'Only admins of Ardorio can change a billing schedule' })
      expect(m.Q.billingPlan('dl1')!.milestones[0].deliveredOn).toBeUndefined()
      m.stop()
    }
    const m = await setup()
    expect(m.Act.markDelivered('dl1', 'gone', '2026-10-01')).toEqual({ ok: false, error: 'That milestone is no longer on this deal' })
    m.stop()
  })

  it('editing a delivered milestone through saveMilestones keeps the delivered state', async () => {
    const m = await setup('admin', [{ ...PLAN_DATA.milestones[0], deliveredOn: '2026-09-01', deliveredBy: 'Ryan' }])
    const cur = m.Q.billingPlan('dl1')!.milestones[0]
    expect(m.Act.saveMilestones('dl1', [{ ...cur, label: 'Renamed' }])).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')!.milestones[0]).toMatchObject({ label: 'Renamed', deliveredOn: '2026-09-01', deliveredBy: 'Ryan' })
    m.stop()
  })
})
