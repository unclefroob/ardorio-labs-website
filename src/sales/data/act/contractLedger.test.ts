import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'
import { appliedResult, rec } from '../../testing/fixtures'
import { ardDeal, invoicingWorld, PLAN_DATA, setArdRole } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

async function setup(role: Parameters<typeof setArdRole>[1] = 'admin', over: Parameters<typeof invoicingWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], ...over }))
  setArdRole(m, role)
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  const stop = m.sync.startSync()
  const post = vi.mocked(m.records.postBatch)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  post.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({
    serverNow: '2026-10-09T10:00:00.000Z',
    results: req.ops.map((op, i): OpResult => appliedResult(i, op.collection, op.id, 5 + i, { ...(op.op === 'delete' ? {} : op.set ?? {}) })),
  }))
  return { ...m, Act, Q, stop, post }
}

const C = { baselineCents: 4800000, engagementType: 'fixed-price' as const, contractedOn: '2026-09-03', estimateAtWonCents: 6000000 }
const CONTRACT = { ...C, contractedBy: 'u-other' }
const plansIn = (req: BatchRequest) => req.ops.filter(o => o.collection === 'billingPlans')

describe('Act.setContract', () => {
  it('freezes the contract on a won deal, adds the agreed milestones after the planned ones, and sends both in one write', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, milestones: PLAN_DATA.milestones.slice(0, 1) }, 2)] })
    expect(m.Act.setContract('dl1', C, [{ id: 'n1', label: ' Build ', amountCents: 2400000, plannedDate: '2026-12-01' }])).toEqual({ ok: true })
    const p = m.Q.billingPlan('dl1')
    expect(p?.contract).toEqual({ ...C, contractedBy: m.Q.me().id })
    expect(p?.milestones.map(x => x.id)).toEqual(['m1', 'n1'])
    expect(p?.milestones[1]).toEqual({ id: 'n1', label: 'Build', amountCents: 2400000, plannedDate: '2026-12-01' })
    await vi.advanceTimersByTimeAsync(300)
    const [op] = plansIn(m.post.mock.calls[0][0])
    expect(op).toMatchObject({ op: 'put', id: 'bp_dl1', baseRev: 2, set: { contract: { ...C, contractedBy: m.Q.me().id } } })
    expect(op.op === 'put' ? Object.keys(op.set ?? {}).sort() : []).toEqual(['contract', 'milestones'])
    m.stop()
  })
  it('creates the plan when there is none, and leaves milestones alone when none are given', async () => {
    const m = await setup()
    expect(m.Act.setContract('dl1', C)).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')).toMatchObject({ id: 'bp_dl1', businessId: 'ard', milestones: [], contract: { baselineCents: 4800000 } })
    m.stop()
  })
  it('is written once: a second contract is refused and the first is kept', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, contract: CONTRACT })] })
    expect(m.Act.setContract('dl1', { ...C, baselineCents: 1 })).toEqual({ ok: false, error: 'This deal already has a contract. Change it with a variation.' })
    expect(m.Q.billingPlan('dl1')?.contract).toEqual(CONTRACT)
    m.stop()
  })
  it('refuses a deal that is not won, a bad amount or type, too many milestones, and anyone but an Ardorio admin', async () => {
    const open = await setup('admin', { deals: [rec('dl1', ardDeal('dl1', { status: 'open' }).data)] })
    expect(open.Act.setContract('dl1', C)).toEqual({ ok: false, error: 'A contract is set when the deal is won' })
    open.stop()
    const m = await setup()
    expect(m.Act.setContract('dl1', { ...C, baselineCents: 0 })).toMatchObject({ ok: false })
    expect(m.Act.setContract('dl1', { ...C, engagementType: 'monthly' as never })).toMatchObject({ ok: false })
    expect(m.Act.setContract('dl1', C, [{ id: 'x', label: '', amountCents: 1 }])).toMatchObject({ ok: false })
    expect(m.store.S.billingPlans).toHaveLength(0)
    m.stop()
    for (const role of ['sales', 'manager', 'viewer'] as const) {
      const r = await setup(role)
      expect(r.Act.setContract('dl1', C)).toMatchObject({ ok: false })
      expect(r.store.S.billingPlans).toHaveLength(0)
      r.stop()
    }
    const sup = await setup('super')
    expect(sup.Act.setContract('dl1', C)).toEqual({ ok: true })
    sup.stop()
  })
})

describe('Act.addVariation and decideVariation', () => {
  const withContract = () => setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, contract: CONTRACT }, 4)] })

  it('appends a proposed variation, never touching the contract or milestones', async () => {
    const m = await withContract()
    const r = m.Act.addVariation('dl1', { label: ' VO-1 SSO ', amountCents: 240000, reason: ' Client asked ' }, false)
    expect(r).toMatchObject({ ok: true, variation: { label: 'VO-1 SSO', amountCents: 240000, reason: 'Client asked', status: 'proposed', createdBy: m.Q.me().id } })
    const v = m.Q.billingPlan('dl1')?.variations ?? []
    expect(v).toHaveLength(1)
    expect(v[0]).not.toHaveProperty('decidedAt')
    expect(m.Q.billingPlan('dl1')?.contract).toEqual(CONTRACT)
    await vi.advanceTimersByTimeAsync(300)
    const [op] = plansIn(m.post.mock.calls[0][0])
    expect(op.op === 'put' ? Object.keys(op.set ?? {}) : []).toEqual(['variations'])
    m.stop()
  })
  it('Approve now records the decision with the entry; a negative amount is kept signed', async () => {
    const m = await withContract()
    const r = m.Act.addVariation('dl1', { label: 'VO-1 descoped', amountCents: -100000, reason: 'Dropped reports' }, true)
    expect(r).toMatchObject({ ok: true, variation: { status: 'approved', amountCents: -100000, decidedBy: m.Q.me().id } })
    expect(r.ok && r.variation.decidedAt).toBeTruthy()
    m.stop()
  })
  it('refuses without a contract, an invalid entry, or a non-admin', async () => {
    const none = await setup()
    expect(none.Act.addVariation('dl1', { label: 'x', amountCents: 1, reason: 'y' }, true)).toEqual({ ok: false, error: 'Set the contract before adding a variation' })
    none.stop()
    const m = await withContract()
    expect(m.Act.addVariation('dl1', { label: 'x', amountCents: 0, reason: 'y' }, true)).toMatchObject({ ok: false })
    expect(m.Act.addVariation('dl1', { label: 'x', amountCents: 1, reason: '' }, true)).toMatchObject({ ok: false })
    expect(m.Q.billingPlan('dl1')?.variations).toBeUndefined()
    m.stop()
    const mgr = await setup('manager', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, contract: CONTRACT })] })
    expect(mgr.Act.addVariation('dl1', { label: 'x', amountCents: 1, reason: 'y' }, true)).toMatchObject({ ok: false })
    mgr.stop()
  })
  it('approves or rejects a proposed variation once; other entries are left exactly as they were', async () => {
    const decided = { id: 'v0', label: 'VO-1', amountCents: 600000, reason: 'r', status: 'approved', createdAt: '2026-09-20T00:00:00Z', createdBy: 'u-other', decidedAt: '2026-09-24T00:00:00Z', decidedBy: 'u-other' }
    const proposed = { id: 'v1', label: 'VO-2', amountCents: 240000, reason: 'r', status: 'proposed', createdAt: '2026-10-02T00:00:00Z', createdBy: 'u-other' }
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, contract: CONTRACT, variations: [decided, proposed, { ...proposed, id: 'v2' }] })] })
    expect(m.Act.decideVariation('dl1', 'v1', 'approved')).toMatchObject({ ok: true, variation: { id: 'v1', status: 'approved', createdBy: 'u-other', decidedBy: m.Q.me().id } })
    expect(m.Act.decideVariation('dl1', 'v1', 'rejected')).toEqual({ ok: false, error: 'That variation was already approved' })
    expect(m.Act.decideVariation('dl1', 'v2', 'rejected')).toMatchObject({ ok: true, variation: { status: 'rejected' } })
    expect(m.Act.decideVariation('dl1', 'v0', 'rejected')).toMatchObject({ ok: false })
    expect(m.Act.decideVariation('dl1', 'nope', 'approved')).toMatchObject({ ok: false })
    const v = m.Q.billingPlan('dl1')?.variations ?? []
    expect(v[0]).toEqual(decided)
    expect(v.map(x => x.status)).toEqual(['approved', 'approved', 'rejected'])
    m.stop()
  })
})
