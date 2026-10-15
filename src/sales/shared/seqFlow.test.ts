import { describe, expect, it } from 'vitest'
import type { SeqStep } from '../data/types'
import { dayPlan, emailBefore, enrolPosLabel, flowIssues, getStep, insertStep, moveStep, regenIds, removeStep, updateStep, walk } from './seqFlow'

const email = (id: string, o: Partial<SeqStep> = {}): SeqStep => ({ id, type: 'email', delay: 0, unit: 'days', subject: 'Hi', body: 'Body', ...o })
const call = (id: string, o: Partial<SeqStep> = {}): SeqStep => ({ id, type: 'call', delay: 0, unit: 'days', title: 'Call', ...o })
const check = (o: Partial<SeqStep> = {}): SeqStep => ({ id: 'c', type: 'branch', cond: 'has_mobile', delay: 3, unit: 'days', yes: [call('y0')], no: [email('n0', { reply: true, subject: '' }), call('n1', { delay: 2 })], afterYes: 'join', afterNo: 'join', ...o })
const FLOW: SeqStep[] = [email('e0'), check(), email('e2', { reply: true, subject: '', delay: 4 })]

describe('walking and editing a flow', () => {
  it('walks every step, paths included, with where it is', () => {
    expect(walk(FLOW).map(w => [w.step.id, w.pos])).toEqual([
      ['e0', { i: 0 }], ['c', { i: 1 }], ['y0', { i: 1, lane: 'yes', j: 0 }], ['n0', { i: 1, lane: 'no', j: 0 }], ['n1', { i: 1, lane: 'no', j: 1 }], ['e2', { i: 2 }],
    ])
    expect(getStep(FLOW, { i: 1, lane: 'no', j: 1 })?.id).toBe('n1')
  })

  it('inserts at the top and on a path, without changing the original', () => {
    const a = insertStep(FLOW, { i: 1 }, call('new'))
    expect(a.steps.map(s => s.id)).toEqual(['e0', 'new', 'c', 'e2'])
    const b = insertStep(FLOW, { i: 1, lane: 'yes', j: 1 }, call('new'))
    expect(walk(b.steps).filter(w => w.pos.lane === 'yes').map(w => w.step.id)).toEqual(['y0', 'new'])
    expect(b.pos).toEqual({ i: 1, lane: 'yes', j: 1 })
    expect(FLOW[1].yes).toHaveLength(1)
  })

  it('never puts a Check on a path', () => {
    const r = insertStep(FLOW, { i: 1, lane: 'yes', j: 0 }, check({ id: 'c2' }))
    expect(walk(r.steps).filter(w => w.step.type === 'branch')).toHaveLength(1)
  })

  it('updates, moves and removes within the right list, and says what to select next', () => {
    expect(getStep(updateStep(FLOW, { i: 1, lane: 'no', j: 0 }, { body: 'X' }), { i: 1, lane: 'no', j: 0 })?.body).toBe('X')
    const m = moveStep(FLOW, { i: 1, lane: 'no', j: 0 }, 1)
    expect(walk(m.steps).filter(w => w.pos.lane === 'no').map(w => w.step.id)).toEqual(['n1', 'n0'])
    expect(m.pos).toEqual({ i: 1, lane: 'no', j: 1 })
    expect(moveStep(FLOW, { i: 0 }, -1).pos).toEqual({ i: 0 }) // can't go past the top
    const r = removeStep(FLOW, { i: 1, lane: 'yes', j: 0 })
    expect(r.pos).toEqual({ i: 1 }) // the path is empty: select its Check
    expect(removeStep(FLOW, { i: 1 }).steps.map(s => s.id)).toEqual(['e0', 'e2']) // a Check goes with its paths
  })
})

describe('days', () => {
  it('counts days down the flow, and after a Check from the longer path', () => {
    const d = dayPlan(FLOW)
    expect(d.get('0')).toBe(1)
    expect(d.get('1')).toBe(4)
    expect(d.get('1.yes.0')).toBe(4)
    expect(d.get('1.no.1')).toBe(6)
    expect(d.get('2')).toBe(10) // 6 (longest path) + 4
  })
})

describe('what stops a sequence from starting', () => {
  it('a sound flow has nothing blocking', () => {
    expect(flowIssues(FLOW).filter(i => i.blocks)).toEqual([])
  })

  it('names the step and the problem', () => {
    const bad = [email('e0', { subject: '' }), check({ cond: '', no: [email('n0', { body: '' })] })]
    expect(flowIssues(bad).map(i => i.text)).toEqual([
      'Step 1 has no subject', 'Step 2 has no question', 'Step 2, No path, step 1 has no message',
    ])
  })

  it('a follow-up needs an email before it; an empty sequence cannot start', () => {
    expect(flowIssues([email('e0', { reply: true, subject: '' })])[0].text).toBe('Step 1 is a follow-up, but no email comes before it')
    expect(flowIssues([])[0]).toMatchObject({ blocks: true })
    expect(emailBefore(FLOW, { i: 2 })?.id).toBe('e0')
  })

  it('a question about opens or clicks with tracking off is worth a look, not a block', () => {
    const f = [email('e0'), check({ cond: 'opened' })]
    expect(flowIssues(f)).toEqual([expect.objectContaining({ blocks: false, text: expect.stringContaining('open tracking is off') })])
    expect(flowIssues(f, { tracking: { opens: true } })).toEqual([])
  })
})

describe('duplicating and naming positions', () => {
  it('gives every step a new id, paths included, and moves the "opened" question to the new id', () => {
    let n = 0
    const out = regenIds([email('e0'), check({ cond: 'opened', condStepId: 'e0' })], () => 'x' + n++)
    const ids = walk(out).map(w => w.step.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.some(id => ['e0', 'c', 'y0', 'n0', 'n1'].includes(id))).toBe(false)
    expect(out[1].condStepId).toBe(out[0].id)
  })

  it('says where an enrolment is', () => {
    expect(enrolPosLabel({ stepIdx: 2 })).toBe('Step 3')
    expect(enrolPosLabel({ stepIdx: 1, lane: 'no', laneIdx: 0 })).toBe('Step 2 · No 1')
  })
})
