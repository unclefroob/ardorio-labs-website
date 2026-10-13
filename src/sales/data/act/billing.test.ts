import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'
import { appliedResult, bootstrap, change, changes, rec } from '../../testing/fixtures'
import { ardDeal, invoicingWorld, PLAN_DATA, setArdRole } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const M = (id: string, cents = 100) => ({ id, label: `Milestone ${id}`, amountCents: cents })

async function setup(role: Parameters<typeof setArdRole>[1] = 'admin', over: Parameters<typeof invoicingWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], ...over }))
  setArdRole(m, role)
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  const stop = m.sync.startSync()
  const post = vi.mocked(m.records.postBatch)
  const poll = vi.mocked(m.records.getChanges)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  post.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({
    serverNow: '2026-10-09T10:00:00.000Z',
    results: req.ops.map((op, i): OpResult => (op.op === 'delete'
      ? { index: i, collection: op.collection, id: op.id, status: 'applied', rev: 9, record: null }
      : appliedResult(i, op.collection, op.id, 5 + i, { ...(op.set ?? {}) }))),
  }))
  return { ...m, Act, Q, stop, post, poll }
}

const plansIn = (req: BatchRequest) => req.ops.filter(o => o.collection === 'billingPlans')

describe('Act.saveMilestones', () => {
  it('creates the plan bp_<dealId> for an Ardorio deal', async () => {
    const m = await setup()
    expect(m.Act.saveMilestones('dl1', [M('a', 1800000), M('b', 600000)])).toEqual({ ok: true })
    expect(m.store.S.billingPlans).toHaveLength(1)
    expect(m.store.S.billingPlans[0]).toMatchObject({ id: 'bp_dl1', dealId: 'dl1', businessId: 'ard' })
    expect(m.Q.billingPlan('dl1')?.milestones.map(x => x.amountCents)).toEqual([1800000, 600000])
    m.stop()
  })
  it('replaces the milestone list but leaves the retainer alone', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, retainer: { amountCents: 450000, interval: 'monthly' } })] })
    m.Act.saveMilestones('dl1', [M('z')])
    expect(m.Q.billingPlan('dl1')?.milestones.map(x => x.id)).toEqual(['z'])
    expect(m.Q.billingPlan('dl1')?.retainer).toEqual({ amountCents: 450000, interval: 'monthly' })
    m.stop()
  })
  it('refuses what the API would refuse, and changes nothing', async () => {
    const m = await setup()
    const bad = (list: Array<ReturnType<typeof M>>) => m.Act.saveMilestones('dl1', list)
    expect(bad([{ ...M('a'), amountCents: 0 }])).toMatchObject({ ok: false })
    expect(bad([{ ...M('a'), amountCents: 100_000_001 }])).toMatchObject({ ok: false })
    expect(bad([{ ...M('a'), amountCents: 10.5 }])).toMatchObject({ ok: false })
    expect(bad([{ ...M('a'), label: '' }])).toMatchObject({ ok: false })
    expect(bad([{ ...M('a'), label: 'x'.repeat(121) }])).toMatchObject({ ok: false })
    expect(bad(Array.from({ length: 41 }, (_, i) => M(`m${i}`)))).toMatchObject({ ok: false })
    expect(m.store.S.billingPlans).toHaveLength(0)
    expect(bad(Array.from({ length: 40 }, (_, i) => M(`m${i}`)))).toEqual({ ok: true })
    m.stop()
  })
  it('is for Ardorio admins only: sales, manager and viewer roles are refused, super is allowed', async () => {
    for (const role of ['sales', 'manager', 'viewer', null] as const) {
      const m = await setup(role)
      expect(m.Act.saveMilestones('dl1', [M('a')])).toMatchObject({ ok: false })
      expect(m.store.S.billingPlans).toHaveLength(0)
      m.stop()
    }
    const sup = await setup('super')
    expect(sup.Act.saveMilestones('dl1', [M('a')])).toEqual({ ok: true })
    sup.stop()
  })
  it('refuses a deal in another business or one that does not exist', async () => {
    const m = await setup('admin', { deals: [rec('dl1', ardDeal('dl1').data), rec('dl2', ardDeal('dl2', { businessId: 'ros' }).data)] })
    expect(m.Act.saveMilestones('dl2', [M('a')])).toMatchObject({ ok: false })
    expect(m.Act.saveMilestones('nope', [M('a')])).toMatchObject({ ok: false })
    expect(m.store.S.billingPlans).toHaveLength(0)
    m.stop()
  })
})

describe('Act.saveRetainer', () => {
  it('sets, validates and clears the retainer, leaving milestones alone', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', PLAN_DATA)] })
    expect(m.Act.saveRetainer('dl1', { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-11-01' })).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')?.retainer).toEqual({ amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-11-01' })
    expect(m.Q.billingPlan('dl1')?.milestones).toHaveLength(4)
    expect(m.Act.saveRetainer('dl1', { amountCents: 0, interval: 'monthly' })).toMatchObject({ ok: false })
    expect(m.Act.saveRetainer('dl1', { amountCents: 100, interval: 'monthly', nextInvoiceDate: '31/12' })).toMatchObject({ ok: false })
    expect(m.Q.billingPlan('dl1')?.retainer?.amountCents).toBe(450000)
    expect(m.Act.saveRetainer('dl1', null)).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')?.retainer).toBeUndefined()
    m.stop()
  })
  it('refuses a new date on or before the last drafted period, and keeps the server-owned fields on an edit', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, retainer: { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-11-30', lastDraftedFor: '2026-10-31', anchorDay: 31 } })] })
    expect(m.Act.saveRetainer('dl1', { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-10-31' })).toMatchObject({ ok: false, error: expect.stringMatching(/after October 2026/) })
    expect(m.Q.billingPlan('dl1')?.retainer?.nextInvoiceDate).toBe('2026-11-30')
    expect(m.Act.saveRetainer('dl1', { amountCents: 500000, interval: 'monthly', nextInvoiceDate: '2026-11-30' })).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')?.retainer).toEqual({ amountCents: 500000, interval: 'monthly', nextInvoiceDate: '2026-11-30', lastDraftedFor: '2026-10-31', anchorDay: 31 })
    m.stop()
  })
  it('claimRetainerPeriod moves a due period on a month, keeping the anchor day the server stored, and refuses any other period', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, retainer: { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2027-01-31', lastDraftedFor: '2026-12-31', anchorDay: 31 } })] })
    expect(m.Act.claimRetainerPeriod('dl1', '2026-12-31')).toMatchObject({ ok: false })
    expect(m.Act.claimRetainerPeriod('dl1', '2027-01-31')).toEqual({ ok: true, next: '2027-02-28' })
    expect(m.Q.billingPlan('dl1')?.retainer).toEqual({ amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2027-02-28', lastDraftedFor: '2026-12-31', anchorDay: 31 })
    expect(m.Act.claimRetainerPeriod('dl1', '2027-01-31')).toMatchObject({ ok: false })
    expect(m.Act.claimRetainerPeriod('dl1', '2027-02-28')).toEqual({ ok: true, next: '2027-03-31' })
    m.stop()
  })
  it('claimRetainerPeriod never sends an anchorDay: the server drops it, so a claim into a short month says later dates move', async () => {
    // Never drafted by the server, so no anchor is stored. The API would drop one sent now, and then carry on from 28 Feb.
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, retainer: { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2027-01-31' } }, 3)] })
    expect(m.Act.claimRetainerPeriod('dl1', '2027-01-31')).toEqual({ ok: true, next: '2027-02-28', laterDay: 28 })
    expect(m.Q.billingPlan('dl1')?.retainer).toEqual({ amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2027-02-28' })
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).toHaveBeenCalledTimes(1)
    const [op] = plansIn(m.post.mock.calls[0][0])
    expect(op).toMatchObject({ op: 'put', collection: 'billingPlans', id: 'bp_dl1', baseRev: 3, set: { retainer: { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2027-02-28' } } })
    expect(op.op === 'put' ? (op.set?.retainer as Record<string, unknown>) : {}).not.toHaveProperty('anchorDay')
    // What the server then does with 28 Feb and no anchor, which the client now agrees with.
    const { claimedRetainerDate, nextRetainerDate } = await import('../../shared/billing')
    expect(nextRetainerDate('2027-02-28').next).toBe('2027-03-28')
    expect(claimedRetainerDate('2027-02-28')).toEqual({ next: '2027-03-28' })
    m.stop()
  })
  it('claimRetainerPeriod on a day every month has says nothing about later dates', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, retainer: { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2027-01-15' } })] })
    expect(m.Act.claimRetainerPeriod('dl1', '2027-01-15')).toEqual({ ok: true, next: '2027-02-15' })
    m.stop()
  })
  it('claimRetainerPeriod refuses a deal the scheduler skips: not won, or archived', async () => {
    const retainer = { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-10-01' }
    for (const over of [{ status: 'open' }, { status: 'lost' }, { archived: true }]) {
      const m = await setup('admin', { deals: [rec('dl1', { ...ardDeal('dl1').data, ...over })], billingPlans: [rec('bp_dl1', { ...PLAN_DATA, retainer })] })
      expect(m.Act.claimRetainerPeriod('dl1', '2026-10-01')).toMatchObject({ ok: false, error: expect.stringMatching(/not won|archived/) })
      expect(m.Q.billingPlan('dl1')?.retainer?.nextInvoiceDate).toBe('2026-10-01')
      m.stop()
    }
  })
  it('claimRetainerPeriod leaves a period the server already claimed alone', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, retainer: { amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-10-01', lastDraftedFor: '2026-10-01' } })] })
    expect(m.Act.claimRetainerPeriod('dl1', '2026-10-01')).toMatchObject({ ok: false, error: expect.stringMatching(/already being drafted/) })
    expect(m.Q.billingPlan('dl1')?.retainer?.nextInvoiceDate).toBe('2026-10-01')
    m.stop()
  })
  it('clearing a retainer that is not there creates no plan', async () => {
    const m = await setup()
    expect(m.Act.saveRetainer('dl1', null)).toEqual({ ok: true })
    expect(m.store.S.billingPlans).toHaveLength(0)
    m.stop()
  })
  it('a non-admin cannot set one', async () => {
    const m = await setup('manager')
    expect(m.Act.saveRetainer('dl1', { amountCents: 100, interval: 'monthly' })).toMatchObject({ ok: false })
    m.stop()
  })
})

describe('the billingPlans collection in bootstrap and sync', () => {
  it('hydrates plans, and a server that does not send the key yet leaves an empty list', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ billingPlans: [rec('bp_dl1', PLAN_DATA, 3)] }))
    expect(m.store.S.billingPlans.map(p => p.id)).toEqual(['bp_dl1'])
    expect(m.store.metaMap('billingPlans').get('bp_dl1')?.rev).toBe(3)
    const old = invoicingWorld()
    delete (old.collections as Partial<typeof old.collections>).billingPlans
    m.bootstrap.hydrate(old)
    expect(m.store.S.billingPlans).toEqual([])
  })
  it('a plan row from the server without milestones still has an array', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ billingPlans: [rec('bp_dl1', { dealId: 'dl1', businessId: 'ard' })] }))
    expect(m.store.S.billingPlans[0].milestones).toEqual([])
  })
  it('a first save is sent as a create with baseRev null; a later one is an update on the acknowledged rev', async () => {
    const m = await setup()
    m.Act.saveMilestones('dl1', [M('a', 1800000)])
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).toHaveBeenCalledTimes(1)
    expect(plansIn(m.post.mock.calls[0][0])).toMatchObject([
      { op: 'put', collection: 'billingPlans', id: 'bp_dl1', baseRev: null, set: { dealId: 'dl1', businessId: 'ard', milestones: [{ id: 'a', label: 'Milestone a', amountCents: 1800000 }] } },
    ])
    expect(m.store.metaMap('billingPlans').get('bp_dl1')?.rev).toBe(5)
    m.Act.saveMilestones('dl1', [M('a', 1800000), M('b', 600000)])
    await vi.advanceTimersByTimeAsync(300)
    expect(m.post).toHaveBeenCalledTimes(2)
    expect(plansIn(m.post.mock.calls[1][0])[0]).toMatchObject({ op: 'put', collection: 'billingPlans', id: 'bp_dl1', baseRev: 5 })
    m.stop()
  })
  it('when the server refuses with 403 the local plan is rolled back', async () => {
    const m = await setup()
    m.post.mockRejectedValue(new m.http.SalesHttpError(403, { error: 'no', code: 'ROLE_REQUIRED' }, 'no'))
    m.Act.saveMilestones('dl1', [M('a')])
    await vi.advanceTimersByTimeAsync(300)
    expect(m.store.S.billingPlans).toEqual([])
    m.stop()
  })
  it('a plan changed by someone else arrives on the next poll', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', PLAN_DATA, 3)] })
    m.poll.mockResolvedValueOnce(changes([change('billingPlans', 'bp_dl1', 4, { ...PLAN_DATA, milestones: [M('only', 500)] })]))
    await m.sync.pollOnce()
    expect(m.Q.billingPlan('dl1')?.milestones.map(x => x.id)).toEqual(['only'])
    m.stop()
  })
})

describe('Q.milestoneStatus and Q.canBill', () => {
  it('derives the status from the invoices loaded for the deal', async () => {
    const m = await setup()
    const inv = (id: string, status: 'draft' | 'sent' | 'paid') => ({ milestoneId: id, status })
    expect(m.Q.milestoneStatus('m1', [])).toBe('Planned')
    expect(m.Q.milestoneStatus('m1', [inv('m1', 'draft')])).toBe('Draft invoice')
    expect(m.Q.milestoneStatus('m1', [inv('m1', 'sent'), inv('m2', 'paid')])).toBe('Invoiced')
    expect(m.Q.milestoneStatus('m1', [inv('m1', 'paid')])).toBe('Paid')
    m.stop()
  })
  it('only admins of Ardorio (and super) can bill', async () => {
    const res: Record<string, boolean> = {}
    for (const role of ['admin', 'super', 'manager', 'sales', 'viewer', null] as const) {
      const m = await setup(role)
      res[String(role)] = m.Q.canBill()
      m.stop()
    }
    expect(res).toEqual({ admin: true, super: true, manager: false, sales: false, viewer: false, null: false })
  })
  it('admin of a different business does not count', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(bootstrap({}))
    setArdRole(m, null, { ros: 'admin' })
    const { Q } = await import('../Q')
    expect(Q.canBill()).toBe(false)
  })
})
