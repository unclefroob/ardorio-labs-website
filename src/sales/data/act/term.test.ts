import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'
import { appliedResult, rec } from '../../testing/fixtures'
import { ardDeal, invoicingWorld, PLAN_DATA, setArdRole } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'
import { termSchedule } from '../../shared/termSchedule'
import type { TermInput } from '../../shared/term'

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

const TERM: TermInput = {
  startDate: '2026-10-01', termMonths: 60, annualCents: 2400000, frequency: 'annual', timing: 'advance',
  escalation: 'cpi', escalationBp: 300, exit: 'break', breakNoticeDays: 90, autoDraft: true,
}
// CPI assumed 3%: 2,400,000 + 2,472,000 + 2,546,160 + 2,622,545 + 2,701,221.
const C = { baselineCents: 12741926, contractedOn: '2026-10-01', estimateAtWonCents: 6000000 }
const BUILD = [{ id: 'bf1', label: 'Build fee', amountCents: 4000000, plannedDate: '2026-10-15' }]
const plansIn = (req: BatchRequest) => req.ops.filter(o => o.collection === 'billingPlans')

/** A won deal whose term was stored by the server: the plan as it comes back. */
function storedPlan(term: Partial<TermInput> = {}) {
  const t = { ...TERM, ...term }
  const schedule = termSchedule(t)
  return rec('bp_dl1', {
    dealId: 'dl1', businessId: 'ard', milestones: [...BUILD, ...schedule],
    contract: { baselineCents: 4000000 + schedule.reduce((a, x) => a + x.amountCents, 0), engagementType: 'term-agreement', contractedOn: '2026-10-01', contractedBy: 'Someone', estimateAtWonCents: 6000000 },
    term: { ...t, draftFrom: '2026-10-01' }, variations: [],
  }, 3)
}

describe('Act.setTermAgreement', () => {
  it('without a build fee: freezes the contract, stores the term and the schedule, in one write', async () => {
    const m = await setup()
    // The contract is dated by the close date and the fixture clock is 9 Oct 2026.
    expect(m.Act.termBaseline('dl1', TERM)).toBe(12741926)
    expect(m.Act.setTermAgreement('dl1', C, TERM)).toEqual({ ok: true })
    const p = m.Q.billingPlan('dl1')
    expect(p?.contract).toEqual({ ...C, engagementType: 'term-agreement', contractedBy: 'Me Myself' })
    expect(p?.term).toEqual({ ...TERM, draftFrom: '2026-10-09' })
    expect(p?.milestones).toEqual(termSchedule(TERM))
    await vi.advanceTimersByTimeAsync(300)
    const [op] = plansIn(m.post.mock.calls[0][0])
    expect(op.op === 'put' ? Object.keys(op.set ?? {}).sort() : []).toEqual(expect.arrayContaining(['contract', 'milestones', 'term']))
    m.stop()
  })

  it('accepts a term agreement over $1,000,000 ex GST (5 years at $250,000), and a variation over $1,000,000 on it, as the API does', async () => {
    const m = await setup()
    const big: TermInput = { ...TERM, annualCents: 25_000_000, escalation: 'none', escalationBp: 0 }
    expect(m.Act.termBaseline('dl1', big)).toBe(125_000_000)
    expect(m.Act.setTermAgreement('dl1', { ...C, baselineCents: 125_000_000 }, big)).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')?.contract?.baselineCents).toBe(125_000_000)
    const r = m.Act.addVariation('dl1', { label: 'VO-1 Extra module', amountCents: 150_000_000, reason: 'Second product line' }, true)
    expect(r.ok).toBe(true)
    m.stop()
  })

  it('with a build fee: the one-off milestones come first and count in the baseline', async () => {
    const m = await setup()
    expect(m.Act.termBaseline('dl1', TERM, BUILD)).toBe(16741926)
    expect(m.Act.setTermAgreement('dl1', { ...C, baselineCents: 16741926 }, TERM, BUILD)).toEqual({ ok: true })
    const p = m.Q.billingPlan('dl1')
    expect(p?.milestones.map(x => x.id)).toEqual(['bf1', 'inst_1_1', 'inst_2_1', 'inst_3_1', 'inst_4_1', 'inst_5_1'])
    expect(p?.milestones[0]).toEqual(BUILD[0])
    m.stop()
  })

  it('on a deal already won with milestones planned and no contract: keeps them and counts them', async () => {
    const m = await setup('admin', { billingPlans: [rec('bp_dl1', { ...PLAN_DATA, milestones: PLAN_DATA.milestones.slice(0, 1) }, 2)] })
    expect(m.Act.termBaseline('dl1', TERM, BUILD)).toBe(1800000 + 4000000 + 12741926)
    expect(m.Act.setTermAgreement('dl1', C, TERM, BUILD)).toEqual({ ok: false, error: 'The contract must be the one-off milestones plus the schedule: $185,419.26 ex GST' })
    expect(m.Q.billingPlan('dl1')?.contract).toBeUndefined()
    expect(m.Act.setTermAgreement('dl1', { ...C, baselineCents: 18541926 }, TERM, BUILD)).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')?.milestones.map(x => x.id).slice(0, 3)).toEqual(['m1', 'bf1', 'inst_1_1'])
    m.stop()
  })

  it('follows the setContract rules: won deals only, once, admins of Ardorio only, no future date', async () => {
    const open = await setup('admin', { deals: [rec('dl1', ardDeal('dl1', { status: 'open' }).data)] })
    expect(open.Act.setTermAgreement('dl1', C, TERM)).toEqual({ ok: false, error: 'A contract is set when the deal is won' })
    open.stop()
    const rep = await setup('manager')
    expect(rep.Act.setTermAgreement('dl1', C, TERM)).toEqual({ ok: false, error: 'Only admins of Ardorio can change a billing schedule' })
    rep.stop()
    const m = await setup('admin', { billingPlans: [storedPlan()] })
    expect(m.Act.setTermAgreement('dl1', C, TERM)).toEqual({ ok: false, error: 'This deal already has a contract. Change it with a variation.' })
    m.stop()
    const f = await setup()
    expect(f.Act.setTermAgreement('dl1', { ...C, contractedOn: '2026-10-10' }, TERM)).toEqual({ ok: false, error: 'The contract date cannot be in the future. It is the day the deal was won.' })
    f.stop()
  })

  it('refuses a term the API refuses, and setContract refuses a term agreement without its term', async () => {
    const m = await setup()
    expect(m.Act.setTermAgreement('dl1', C, { ...TERM, termMonths: 121 })).toMatchObject({ ok: false })
    expect(m.Act.setContract('dl1', { ...C, engagementType: 'term-agreement' })).toEqual({ ok: false, error: 'A term agreement is set together with its term and schedule' })
    expect(m.store.S.billingPlans).toHaveLength(0)
    m.stop()
  })
})

describe('Act on a stored term', () => {
  it('confirmCpi appends only the confirmation; the server re-prices', async () => {
    const m = await setup('admin', { billingPlans: [storedPlan()] })
    const before = m.Q.billingPlan('dl1')!.milestones
    expect(m.Act.confirmCpi('dl1', 2, 350)).toEqual({ ok: true })
    const p = m.Q.billingPlan('dl1')!
    expect(p.term?.cpiConfirmed).toEqual([{ year: 2, bp: 350, confirmedOn: '2026-10-09', confirmedBy: 'Me Myself' }])
    expect(p.milestones).toEqual(before)
    expect(m.Act.confirmCpi('dl1', 2, 400)).toEqual({ ok: false, error: 'CPI for year 2 is already confirmed' })
    await vi.advanceTimersByTimeAsync(300)
    const [op] = plansIn(m.post.mock.calls[0][0])
    expect(op.op === 'put' ? Object.keys(op.set ?? {}) : []).toEqual(['term'])
    m.stop()
  })

  it('endTermEarly writes the end once; it cannot be ended twice, and auto-draft still toggles (what remains is drafted)', async () => {
    const m = await setup('admin', { billingPlans: [storedPlan()] })
    expect(m.Act.endTermEarly('dl1', '2027-01-01', '  ')).toMatchObject({ ok: false })
    expect(m.Act.endTermEarly('dl1', '2028-03-15', ' Client sold the business ')).toEqual({ ok: true })
    const t = m.Q.billingPlan('dl1')!.term!
    expect(t.ended).toMatchObject({ endedOn: '2028-03-15', reason: 'Client sold the business', endedBy: 'Me Myself' })
    expect(m.Act.endTermEarly('dl1', '2028-04-15', 'again')).toEqual({ ok: false, error: 'This agreement has already ended' })
    expect(m.Act.setTermAutoDraft('dl1', true)).toEqual({ ok: true })
    expect(m.Act.setTermAutoDraft('dl1', false)).toEqual({ ok: true })
    expect(m.Act.setTermAutoDraft('dl1', true)).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')!.term).toMatchObject({ autoDraft: true, ended: { endedOn: '2028-03-15' } })
    m.stop()
  })

  it('a deal that is no longer won cannot have its term changed, as the server refuses it', async () => {
    const m = await setup('admin', { deals: [rec('dl1', ardDeal('dl1', { status: 'open' }).data)], billingPlans: [storedPlan()] })
    const error = 'This deal is not won: win it again before changing its term agreement'
    expect(m.Act.confirmCpi('dl1', 2, 300)).toEqual({ ok: false, error })
    expect(m.Act.endTermEarly('dl1', '2027-01-01', 'x')).toEqual({ ok: false, error })
    expect(m.Act.setTermAutoDraft('dl1', false)).toEqual({ ok: false, error })
    m.stop()
  })

  it('setTermAutoDraft toggles only autoDraft', async () => {
    const m = await setup('admin', { billingPlans: [storedPlan()] })
    expect(m.Act.setTermAutoDraft('dl1', false)).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')!.term).toEqual({ ...TERM, autoDraft: false, draftFrom: '2026-10-01' })
    m.stop()
  })

  it('saveMilestones keeps instalments as they are and refuses a change to one', async () => {
    const m = await setup('admin', { billingPlans: [storedPlan()] })
    const list = m.Q.billingPlan('dl1')!.milestones
    const extra = { id: 'ms9', label: 'Training', amountCents: 50000 }
    expect(m.Act.saveMilestones('dl1', [...list, extra])).toEqual({ ok: true })
    expect(m.Q.billingPlan('dl1')!.milestones.filter(x => x.kind === 'instalment')).toEqual(termSchedule(TERM))
    const repriced = list.map(x => (x.id === 'inst_2_1' ? { ...x, amountCents: 1 } : x))
    expect(m.Act.saveMilestones('dl1', repriced)).toEqual({ ok: false, error: 'The instalments of a term agreement follow its schedule and cannot be added, removed or changed here' })
    expect(m.Act.saveMilestones('dl1', list.filter(x => x.id !== 'inst_5_1'))).toMatchObject({ ok: false })
    expect(m.Act.markDelivered('dl1', 'inst_1_1', '2026-10-09')).toEqual({ ok: false, error: 'An instalment is earned when it is invoiced, so it is never marked delivered' })
    m.stop()
  })

  it('a manager of Ardorio cannot confirm CPI, end early or toggle auto-draft', async () => {
    const m = await setup('manager', { billingPlans: [storedPlan()] })
    expect(m.Act.confirmCpi('dl1', 2, 300)).toMatchObject({ ok: false })
    expect(m.Act.endTermEarly('dl1', '2027-01-01', 'x')).toMatchObject({ ok: false })
    expect(m.Act.setTermAutoDraft('dl1', false)).toMatchObject({ ok: false })
    m.stop()
  })
})

describe('Act.waiveInstalment', () => {
  it('appends only the waiver, trimmed and stamped; the server removes the instalment and records the variation', async () => {
    const m = await setup('admin', { billingPlans: [storedPlan()] })
    const before = m.Q.billingPlan('dl1')!.milestones
    expect(m.Act.waiveInstalment('dl1', 'inst_2_1', ' Client paused for a year ')).toEqual({ ok: true })
    const p = m.Q.billingPlan('dl1')!
    expect(p.term?.waived).toEqual([{ milestoneId: 'inst_2_1', reason: 'Client paused for a year', waivedOn: '2026-10-09', waivedBy: 'Me Myself' }])
    expect(p.milestones).toEqual(before)
    await vi.advanceTimersByTimeAsync(300)
    const [op] = plansIn(m.post.mock.calls[0][0])
    expect(op.op === 'put' ? Object.keys(op.set ?? {}) : []).toEqual(['term'])
    m.stop()
  })

  it('refuses what the API refuses: twice, an instalment not on the plan, a one-off milestone, a bad reason, a manager', async () => {
    const m = await setup('admin', { billingPlans: [storedPlan()] })
    expect(m.Act.waiveInstalment('dl1', 'inst_2_1', '')).toEqual({ ok: false, error: 'Say why it is waived, in 1 to 300 characters' })
    expect(m.Act.waiveInstalment('dl1', 'inst_9_1', 'x')).toEqual({ ok: false, error: 'That instalment is no longer on this agreement' })
    expect(m.Act.waiveInstalment('dl1', 'bf1', 'x')).toEqual({ ok: false, error: 'That instalment is no longer on this agreement' })
    expect(m.Act.waiveInstalment('dl1', 'inst_2_1', 'x')).toEqual({ ok: true })
    expect(m.Act.waiveInstalment('dl1', 'inst_2_1', 'again')).toEqual({ ok: false, error: 'This instalment is already waived' })
    m.stop()
    const mgr = await setup('manager', { billingPlans: [storedPlan()] })
    expect(mgr.Act.waiveInstalment('dl1', 'inst_2_1', 'x')).toMatchObject({ ok: false })
    mgr.stop()
  })

  it('works on an ended agreement, as the API allows', async () => {
    const m = await setup('admin', { billingPlans: [storedPlan()] })
    expect(m.Act.endTermEarly('dl1', '2029-03-15', 'Client sold the business')).toEqual({ ok: true })
    expect(m.Act.waiveInstalment('dl1', 'inst_2_1', 'Never billed')).toEqual({ ok: true })
    m.stop()
  })
})
