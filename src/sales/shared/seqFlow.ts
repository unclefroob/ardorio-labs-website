import type { SeqStep } from '../data/types'
import { suggestToken, unknownTokens } from '../data/tokens'

/**
 * A sequence's flow: a list of steps, where a Check may hold a Yes path and a No path of its own (one level deep). A position names a step:
 * `{ i }` at the top, `{ i, lane, j }` on a path of the Check at `i`. Every edit returns new arrays; nothing is changed in place.
 */
export type Lane = 'yes' | 'no'
export interface Pos { i: number; lane?: Lane; j?: number }

export const hasPaths = (s: SeqStep | undefined): boolean => !!s && s.type === 'branch' && (Array.isArray(s.yes) || Array.isArray(s.no))
export const pathOf = (s: SeqStep | undefined, lane: Lane): SeqStep[] => (s && Array.isArray(s[lane]) ? (s[lane] as SeqStep[]) : [])
export const samePos = (a: Pos, b: Pos): boolean => a.i === b.i && (a.lane ?? null) === (b.lane ?? null) && (a.j ?? null) === (b.j ?? null)

export function getStep(steps: readonly SeqStep[], p: Pos): SeqStep | undefined {
  const top = steps[p.i]
  return p.lane ? pathOf(top, p.lane)[p.j ?? 0] : top
}

/** Every step, paths included, each with where it is. */
export function walk(steps: readonly SeqStep[]): Array<{ step: SeqStep; pos: Pos }> {
  const out: Array<{ step: SeqStep; pos: Pos }> = []
  steps.forEach((s, i) => {
    out.push({ step: s, pos: { i } })
    if (hasPaths(s)) for (const lane of ['yes', 'no'] as const) pathOf(s, lane).forEach((x, j) => out.push({ step: x, pos: { i, lane, j } }))
  })
  return out
}
export const allSteps = (steps: readonly SeqStep[]): SeqStep[] => walk(steps).map(w => w.step)

function withPath(steps: readonly SeqStep[], i: number, lane: Lane, f: (list: SeqStep[]) => SeqStep[]): SeqStep[] {
  return steps.map((s, k) => (k === i ? { ...s, [lane]: f(pathOf(s, lane).slice()) } : s))
}

/** Insert `step` before position `at` (`j` / `i` equal to the list's length appends). A Check never goes on a path. */
export function insertStep(steps: readonly SeqStep[], at: Pos, step: SeqStep): { steps: SeqStep[]; pos: Pos } {
  if (at.lane) {
    if (step.type === 'branch') return { steps: steps.slice(), pos: at }
    const j = at.j ?? pathOf(steps[at.i], at.lane).length
    return { steps: withPath(steps, at.i, at.lane, l => { l.splice(j, 0, step); return l }), pos: { i: at.i, lane: at.lane, j } }
  }
  const n = steps.slice()
  n.splice(at.i, 0, step)
  return { steps: n, pos: { i: at.i } }
}

export function updateStep(steps: readonly SeqStep[], p: Pos, patch: Partial<SeqStep>): SeqStep[] {
  if (p.lane) return withPath(steps, p.i, p.lane, l => { l[p.j ?? 0] = { ...l[p.j ?? 0], ...patch }; return l })
  return steps.map((s, k) => (k === p.i ? { ...s, ...patch } : s))
}

/** Remove a step; the position to select afterwards is returned too. Removing a Check removes its paths with it. */
export function removeStep(steps: readonly SeqStep[], p: Pos): { steps: SeqStep[]; pos: Pos } {
  if (p.lane) {
    const j = p.j ?? 0
    const n = withPath(steps, p.i, p.lane, l => { l.splice(j, 1); return l })
    const left = pathOf(n[p.i], p.lane).length
    return { steps: n, pos: left ? { i: p.i, lane: p.lane, j: Math.min(j, left - 1) } : { i: p.i } }
  }
  const n = steps.filter((_, k) => k !== p.i)
  return { steps: n, pos: { i: Math.max(0, Math.min(p.i, n.length - 1)) } }
}

/** Move a step up or down within its own list (top level, or its path). */
export function moveStep(steps: readonly SeqStep[], p: Pos, d: -1 | 1): { steps: SeqStep[]; pos: Pos } {
  if (p.lane) {
    const j = p.j ?? 0
    const l = pathOf(steps[p.i], p.lane)
    if (j + d < 0 || j + d >= l.length) return { steps: steps.slice(), pos: p }
    return { steps: withPath(steps, p.i, p.lane, x => { [x[j], x[j + d]] = [x[j + d], x[j]]; return x }), pos: { ...p, j: j + d } }
  }
  if (p.i + d < 0 || p.i + d >= steps.length) return { steps: steps.slice(), pos: p }
  const n = steps.slice()
  ;[n[p.i], n[p.i + d]] = [n[p.i + d], n[p.i]]
  return { steps: n, pos: { i: p.i + d } }
}

/** Can a follow-up go here: is there an email (the one that starts the conversation) before it? */
export function emailBefore(steps: readonly SeqStep[], at: Pos): SeqStep | undefined {
  const before = steps.slice(0, at.i + (at.lane ? 1 : 0))
  return before.find(s => s.type === 'email' && s.reply !== true)
}

const daysOf = (s: SeqStep): number => (s.unit === 'hours' ? 0 : Number(s.delay) || 0)

/** The day each step lands on, counting the first as day 1. After a Check, the next step counts from the longer of its two paths. */
export function dayPlan(steps: readonly SeqStep[]): Map<string, number> {
  const out = new Map<string, number>()
  let day = 1
  steps.forEach((s, i) => {
    day += i === 0 ? 0 : daysOf(s)
    out.set(key({ i }), day)
    if (hasPaths(s)) {
      let longest = day
      for (const lane of ['yes', 'no'] as const) {
        let d = day
        pathOf(s, lane).forEach((x, j) => { d += daysOf(x); out.set(key({ i, lane, j }), d) })
        longest = Math.max(longest, d)
      }
      day = longest
    }
  })
  return out
}
export const key = (p: Pos): string => (p.lane ? `${p.i}.${p.lane}.${p.j ?? 0}` : String(p.i))

export interface FlowIssue { pos: Pos | null; text: string; blocks: boolean }

/** What stops a sequence from starting (blocks), and what is worth a look. */
export function flowIssues(steps: readonly SeqStep[], o: { tracking?: { opens?: boolean; clicks?: boolean } } = {}): FlowIssue[] {
  const out: FlowIssue[] = []
  if (!steps.length) out.push({ pos: null, text: 'Add at least one step', blocks: true })
  const label = (p: Pos): string => (p.lane ? `Step ${p.i + 1}, ${p.lane === 'yes' ? 'Yes' : 'No'} path, step ${(p.j ?? 0) + 1}` : `Step ${p.i + 1}`)
  for (const { step, pos } of walk(steps)) {
    if (step.type === 'email') {
      if (step.reply === true && !emailBefore(steps, pos)) out.push({ pos, text: `${label(pos)} is a follow-up, but no email comes before it`, blocks: true })
      if (step.reply !== true && !String(step.subject ?? '').trim()) out.push({ pos, text: `${label(pos)} has no subject`, blocks: true })
      if (!String(step.body ?? '').replace(/<[^>]*>/g, '').trim()) out.push({ pos, text: `${label(pos)} has no message`, blocks: true })
    }
    const typos = unknownTokens([step.subject, step.body, step.title, step.script, step.desc].filter(v => typeof v === 'string').join('\n'))
    if (typos.length) {
      const hint = typos.map(k => { const s = suggestToken(k); return `{{${k}}}${s ? ` (did you mean ${s.label}?)` : ''}` }).join(', ')
      out.push({ pos, text: `${label(pos)} uses ${typos.length === 1 ? 'a variable that does not exist' : 'variables that do not exist'}: ${hint}`, blocks: true })
    }
    if (step.type === 'branch') {
      if (pos.lane) out.push({ pos, text: `${label(pos)} is a Check inside a path, which is not allowed`, blocks: true })
      if (!step.cond) out.push({ pos, text: `${label(pos)} has no question`, blocks: true })
      if (step.cond === 'opened' && !o.tracking?.opens) out.push({ pos, text: `${label(pos)} asks whether they opened an email, but open tracking is off, so the answer is always No`, blocks: false })
      if (step.cond === 'clicked' && !o.tracking?.clicks) out.push({ pos, text: `${label(pos)} asks about clicks, but click tracking is off, so the answer is always No`, blocks: false })
    }
  }
  return out
}

/** New ids for every step, paths included (duplicating a sequence). The "opened" question follows its step to the new id. */
export function regenIds(steps: readonly SeqStep[], uid: () => string): SeqStep[] {
  const map = new Map<string, string>()
  const fresh = (s: SeqStep): SeqStep => { const id = uid(); map.set(s.id, id); return { ...s, id } }
  const out = steps.map(s => {
    const n = fresh(s)
    if (hasPaths(s)) { n.yes = pathOf(s, 'yes').map(fresh); n.no = pathOf(s, 'no').map(fresh) }
    return n
  })
  return out.map(s => (s.condStepId && map.has(s.condStepId) ? { ...s, condStepId: map.get(s.condStepId) } : s))
}

/** Where an enrolment is, in words: "Step 3", or "Step 2 · No 1" on a path. */
export function enrolPosLabel(e: { stepIdx: number; lane?: Lane; laneIdx?: number }): string {
  return e.lane ? `Step ${e.stepIdx + 1} · ${e.lane === 'yes' ? 'Yes' : 'No'} ${(e.laneIdx ?? 0) + 1}` : `Step ${e.stepIdx + 1}`
}
