// Deal reopen (contract: "Deal reopen writes reopenedAt, reopenedBy and clears won/lost fields; stage returns to the
// stage before close from stageHistory, fallback the pipeline's last open stage"), and moves of a closed deal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'
import { appliedResult, rec, salesWorld } from '../../testing/fixtures'
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

const biz = (id: string, name: string) => rec(id, { name, short: id.toUpperCase(), accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl_' + id, industries: [], roles: [] })
const pipe = (b: string) => rec('pl_' + b, {
  businessId: b, name: 'Sales', recurring: b !== 'ard', lostReasons: ['Price'], forecast: [], card: [], fields: [],
  stages: [
    { id: b + '_lead', name: 'Lead', prob: 10, required: [], won: false, lost: false },
    { id: b + '_prop', name: 'Proposal', prob: 50, required: [], won: false, lost: false },
    { id: b + '_neg', name: 'Negotiation', prob: 75, required: ['close'], won: false, lost: false },
    { id: b + '_won', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
    { id: b + '_lost', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
  ],
})
function deal(id: string, over: Record<string, unknown> = {}) {
  const b = (over.businessId as string) ?? 'ros'
  return rec(id, {
    name: id, title: `Deal ${id}`, businessId: b, companyId: 'co1', pipelineId: 'pl_' + b, stageId: b + '_won', ownerId: 'u-me', type: 'New', value: 1000, mrr: null,
    recurring: false, contractMonths: 12, close: '2026-10-01', probability: 100, forecast: 'Closed', source: 'Outbound', contactIds: ['ct1'], primaryContact: 'ct1',
    next: '', description: '', lostReason: '', status: 'won', createdAt: '2026-09-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-01T09:00',
    closedAt: '2026-10-01T09:00', priority: 'Medium', fields: {}, notes: [], wonNotes: 'Signed on the day',
    stageHistory: [{ stageId: b + '_lead', ts: '2026-09-01T09:00' }, { stageId: b + '_prop', ts: '2026-09-10T09:00' }, { stageId: b + '_won', ts: '2026-10-01T09:00' }],
    ...over,
  })
}
const rel = (b: string, status: string) => rec('cr_' + b, { companyId: 'co1', businessId: b, ownerId: 'u-me', status, priority: 'Medium', tags: [] })

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [biz('ros', 'Rosterio'), biz('ard', 'Ardorio Labs')], pipelines: [pipe('ros'), pipe('ard')], ...over }))
  m.ui.bindNavigate(vi.fn())
  const { Act } = await import('../Act')
  const { Q } = await import('../Q')
  const deals = await import('./deals')
  const reopen = await import('../../shared/reopen')
  const moves = await import('../../shared/moves')
  return { ...m, Act, Q, deals, reopen, moves }
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

const d = (m: M, id = 'd1') => m.store.S.deals.find(x => x.id === id)
const modal = (m: M) => m.ui.UI.get().modals[0]

describe('reopenTarget', () => {
  it('is the last open stage in the history before it closed', async () => {
    const m = await setup({ deals: [deal('d1')] })
    expect(m.deals.reopenTarget(d(m)!)).toMatchObject({ stage: { id: 'ros_prop' }, from: 'history' })
  })
  it('skips a stage that has since been removed from the pipeline', async () => {
    const m = await setup({ deals: [deal('d1', { stageHistory: [{ stageId: 'ros_lead', ts: '2026-09-01T09:00' }, { stageId: 'gone', ts: '2026-09-10T09:00' }, { stageId: 'ros_won', ts: '2026-10-01T09:00' }] })] })
    expect(m.deals.reopenTarget(d(m)!)).toMatchObject({ stage: { id: 'ros_lead' }, from: 'history' })
  })
  it('falls back to the pipeline’s last open stage when the history says nothing', async () => {
    const m = await setup({ deals: [deal('d1', { stageHistory: [] })] })
    expect(m.deals.reopenTarget(d(m)!)).toMatchObject({ stage: { id: 'ros_neg' }, from: 'fallback' })
  })
})

describe('Act.reopenDeal', () => {
  it('a won deal returns to its pre-close stage with its won fields cleared, an activity and an audit entry', async () => {
    const m = await setup({ deals: [deal('d1')], companyRels: [rel('ros', 'Customer')] })
    const st = m.Act.reopenDeal('d1')
    expect(st?.id).toBe('ros_prop')
    expect(d(m)).toMatchObject({ status: 'open', stageId: 'ros_prop', probability: 50, forecast: 'Best case', closedAt: null, lostReason: '' })
    expect(d(m)).not.toHaveProperty('wonNotes')
    expect(d(m)?.stageHistory.at(-1)?.stageId).toBe('ros_prop')
    const a = m.store.S.activities.at(-1)
    expect(a).toMatchObject({ type: 'stage', subject: 'Deal reopened', desc: 'Closed Won → Proposal', dealId: 'd1' })
    expect(m.store.S.audit.at(-1)).toMatchObject({ action: 'Deal reopened', target: 'd1: Closed Won → Proposal' })
    expect(m.Q.rel('co1', 'ros')?.status).toBe('Active opportunity')
  })

  it('the company stays a customer when another won deal in that business keeps it one', async () => {
    const m = await setup({ deals: [deal('d1'), deal('d2')], companyRels: [rel('ros', 'Customer')] })
    m.Act.reopenDeal('d1')
    expect(m.Q.rel('co1', 'ros')?.status).toBe('Customer')
  })

  it('an archived won deal does not keep the company a customer', async () => {
    const m = await setup({ deals: [deal('d1'), deal('d2', { archived: true })], companyRels: [rel('ros', 'Customer')] })
    m.Act.reopenDeal('d1')
    expect(m.Q.rel('co1', 'ros')?.status).toBe('Active opportunity')
  })

  it('a lost deal: lost reason cleared, relationship untouched, falls back to the last open stage without history', async () => {
    const m = await setup({ deals: [deal('d1', { status: 'lost', stageId: 'ros_lost', lostReason: 'Price', wonNotes: undefined, stageHistory: [] })], companyRels: [rel('ros', 'Lead')] })
    expect(m.Act.reopenDeal('d1')?.id).toBe('ros_neg')
    expect(d(m)).toMatchObject({ status: 'open', stageId: 'ros_neg', lostReason: '', closedAt: null })
    expect(m.Q.rel('co1', 'ros')?.status).toBe('Lead')
  })

  it('does nothing to an open deal', async () => {
    const m = await setup({ deals: [deal('d1', { status: 'open', stageId: 'ros_lead', closedAt: null })] })
    expect(m.Act.reopenDeal('d1')).toBeUndefined()
    expect(m.store.S.activities).toHaveLength(0)
  })

  it('on the wire: status, stage and cleared fields; reopenedBy is never sent (the server stamps it)', async () => {
    const m = await setup({ deals: [deal('d1')] })
    m.Act.reopenDeal('d1')
    const ops = await sent(m)
    const put = ops.find(o => o.collection === 'deals' && o.id === 'd1')
    expect(put).toMatchObject({ op: 'put', set: { status: 'open', stageId: 'ros_prop', closedAt: null } })
    expect(put && 'unset' in put ? put.unset : []).toContain('wonNotes')
    expect(JSON.stringify(put)).not.toContain('reopenedBy')
  })

  it('Ardorio: the billing plan is not touched (its contract stays frozen)', async () => {
    const plan = rec('bp_d1', { dealId: 'd1', businessId: 'ard', milestones: [], retainer: { amountCents: 50000, interval: 'monthly', nextInvoiceDate: '2026-11-01' }, contract: { baselineCents: 4800000, engagementType: 'fixed-price', frozenAt: '2026-10-01T09:00', frozenBy: 'Me' }, variations: [] })
    const m = await setup({ deals: [deal('d1', { businessId: 'ard' })], billingPlans: [plan] })
    m.Act.reopenDeal('d1')
    const ops = await sent(m)
    expect(ops.some(o => o.collection === 'billingPlans')).toBe(false)
    expect(m.Q.billingPlan('d1')?.contract?.baselineCents).toBe(4800000)
  })
})

describe('the reopen confirmation', () => {
  it('names the stage, the cleared fields and the customer change', async () => {
    const m = await setup({ deals: [deal('d1')], companyRels: [rel('ros', 'Customer')] })
    const fx = m.reopen.reopenEffects(d(m)!)
    expect(fx?.body).toBe('This deal is won. Reopening it makes it an open deal again.')
    expect(fx?.points).toEqual([
      'It goes back to Proposal (50%), the stage it was in before it closed.',
      'Its won date and won notes are cleared.',
      'Acme is no longer a Rosterio customer; it shows as an active opportunity.',
      'The reopen is recorded in the activity log and the audit log.',
    ])
  })

  it('Ardorio admin: the frozen contract, kept milestones and the paused retainer', async () => {
    const plan = rec('bp_d1', { dealId: 'd1', businessId: 'ard', milestones: [{ id: 'ms1', label: 'Discovery', amountCents: 1000000, dueDate: '2026-11-01' }], retainer: { amountCents: 50000, interval: 'monthly' }, contract: { baselineCents: 4800000, engagementType: 'fixed-price', frozenAt: '2026-10-01T09:00', frozenBy: 'Me' }, variations: [{ id: 'v1', amountCents: 200000, reason: 'Extra', status: 'approved' }] })
    const m = await setup({ deals: [deal('d1', { businessId: 'ard' })], billingPlans: [plan] })
    const pts = m.reopen.reopenEffects(d(m)!)?.points ?? []
    expect(pts.find(p => p.startsWith('The contract'))).toMatch(/^The contract \(\$50,000\.00 contracted, ex GST\) stays frozen\./)
    expect(pts).toContain('Milestones and invoices already raised are kept as they are.')
    expect(pts).toContain('Its support retainer drafts no invoices while the deal is not won, and picks up again only once it is won.')
  })

  it('Ardorio without billing access: no money, only what happens', async () => {
    const m = await setup({ deals: [deal('d1', { businessId: 'ard' })] })
    const { setRole } = await import('../../testing/rosterioWorld')
    setRole(m, 'sales', { ard: 'sales' })
    const pts = m.reopen.reopenEffects(d(m)!)?.points ?? []
    expect(pts).toContain('Any billing plan is kept as it is. A support retainer drafts no invoices while the deal is not won.')
    expect(pts.join(' ')).not.toMatch(/\$/)
  })
})

describe('moving a closed deal goes through the confirmation and then tryMove', () => {
  it('asks first: nothing changes until Reopen is confirmed', async () => {
    const m = await setup({ deals: [deal('d1')] })
    m.moves.tryMove('d1', 'ros_lead')
    expect(modal(m)).toMatchObject({ name: 'confirm', props: { title: 'Reopen deal?', confirm: 'Reopen' } })
    expect(d(m)?.status).toBe('won')
    expect((modal(m)?.props as { points: string[] }).points).toContain('Then it moves to Lead, with that stage’s usual checks.')
  })

  it('confirming reopens to the pre-close stage, then moves on when nothing is missing', async () => {
    const m = await setup({ deals: [deal('d1')] })
    m.moves.tryMove('d1', 'ros_lead')
    ;(modal(m)?.props as { onConfirm: () => void }).onConfirm()
    expect(d(m)).toMatchObject({ status: 'open', stageId: 'ros_lead' })
    expect(d(m)?.stageHistory.map(h => h.stageId).slice(-2)).toEqual(['ros_prop', 'ros_lead'])
  })

  it('a stage with missing required fields opens the stage check after reopening', async () => {
    const m = await setup({ deals: [deal('d1', { close: '' })] })
    m.moves.tryMove('d1', 'ros_neg')
    const props = modal(m)?.props as { onConfirm: () => void }
    m.ui.UI.close()
    props.onConfirm()
    expect(d(m)?.status).toBe('open')
    expect(d(m)?.stageId).toBe('ros_prop')
    expect(modal(m)).toMatchObject({ name: 'stageCheck', props: { id: 'd1', stageId: 'ros_neg' } })
  })

  it('a lost deal dragged to Closed Won reopens and then opens the Won dialog', async () => {
    const m = await setup({ deals: [deal('d1', { status: 'lost', stageId: 'ros_lost', lostReason: 'Price' })] })
    m.moves.tryMove('d1', 'ros_won')
    expect((modal(m)?.props as { points: string[] }).points).toContain('Then you are asked to mark it won again.')
    const props = modal(m)?.props as { onConfirm: () => void }
    m.ui.UI.close()
    props.onConfirm()
    expect(d(m)?.status).toBe('open')
    expect(modal(m)).toMatchObject({ name: 'won', props: { id: 'd1' } })
  })

  it('a won deal dragged to Closed Lost reopens and then opens the Lost dialog', async () => {
    const m = await setup({ deals: [deal('d1')] })
    m.moves.tryMove('d1', 'ros_lost')
    const props = modal(m)?.props as { onConfirm: () => void }
    m.ui.UI.close()
    props.onConfirm()
    expect(modal(m)).toMatchObject({ name: 'lost', props: { id: 'd1' } })
  })
})
