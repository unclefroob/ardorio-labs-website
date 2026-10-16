import { Q } from '../data/Q'
import { S } from '../data/store'
import { parseTokens, renderTokens, tokenDef, TOKEN_KEYS } from '../data/tokens'
import type { Enrolment, SeqStep } from '../data/types'
import type { ChipInfo } from '../kit/tokenChips'
import { emailBefore, walk, type Pos } from './seqFlow'

// Whether a sequence's variables can be filled for the people in it: per step, how many enrolled contacts have no value for each
// variable (with no fallback to cover it). The builder colours those chips amber and badges the step, so a hold is seen before it happens.

/** Enrolments still going through the sequence (held ones included: they are the ones this is about). */
const INSIDE = ['active', 'awaiting_approval', 'awaiting_task', 'paused']
export const enrolledIn = (seqId: string): Enrolment[] => S.enrolments.filter(e => e.seqId === seqId && INSIDE.includes(e.status))

/** All the text of a step that variables can appear in. A follow-up's subject is the first email's. */
export function stepText(x: SeqStep, steps: readonly SeqStep[], pos: Pos): string {
  const subject = x.type === 'email' && x.reply === true ? emailBefore(steps, pos)?.subject ?? '' : x.subject ?? ''
  return [subject, x.body, x.title, x.script, x.desc].filter(v => typeof v === 'string').join('\n')
}

export interface StepGaps { total: number; byKey: Map<string, number> }

/** For one step: of the contacts enrolled, how many lack each variable it uses. */
export function stepGaps(x: SeqStep, steps: readonly SeqStep[], pos: Pos, seq: { id: string; businessId: string; mailboxId?: string }): StepGaps {
  const text = stepText(x, steps, pos)
  const byKey = new Map<string, number>()
  const ens = enrolledIn(seq.id)
  if (!parseTokens(text).length) return { total: ens.length, byKey }
  for (const e of ens) {
    const ct = Q.contact(e.contactId)
    const r = renderTokens(text, Q.tokens(ct, Q.senderOf(Q.mailbox(e.mailboxId || seq.mailboxId)), seq.businessId))
    for (const k of r.missing) if (TOKEN_KEYS.includes(k)) byKey.set(k, (byKey.get(k) ?? 0) + 1)
  }
  return { total: ens.length, byKey }
}

/** Chip colours for a step: amber, with a count, where enrolled contacts lack the value; unknown variables stay red (the default). */
export function gapInfo(g: StepGaps): ChipInfo {
  return key => {
    const n = g.byKey.get(key)
    if (!n) return undefined
    return { tone: 'warn', note: `${n} of ${g.total} enrolled ${g.total === 1 ? 'contact has' : 'contacts have'} no ${tokenDef(key)?.label.toLowerCase() ?? key}: add a fallback ({{${key}|…}}) or fill it in, or their email is held` }
  }
}

/** Every email step's gaps across the whole sequence, for the enrolment list's summary. */
export function sequenceGaps(seq: { id: string; businessId: string; mailboxId?: string; steps: readonly SeqStep[] }): Array<{ pos: Pos; gaps: StepGaps }> {
  return walk(seq.steps).filter(w => w.step.type === 'email').map(w => ({ pos: w.pos, gaps: stepGaps(w.step, seq.steps, w.pos, seq) })).filter(x => x.gaps.byKey.size > 0)
}
