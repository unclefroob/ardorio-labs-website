import { F } from '../F'
import { uid } from '../ids'
import { nudgeEngine } from '../engineNudge'
import { act, audit, ensureRels } from '../internals'
import { Q } from '../Q'
import { commit } from '../commit'
import { idx, S } from '../store'
import type { Enrolment, Sequence } from '../types'

export type SequenceInput = Partial<Sequence> & Pick<Sequence, 'name' | 'businessId'>

export function saveSequence(seq: SequenceInput): Sequence {
  const now = F.nowIso()
  let s = seq.id ? idx.sequences.get(seq.id) : undefined
  if (!s) {
    s = {
      id: uid('sq'), createdBy: S.session.userId, ownerId: S.session.userId, createdAt: now, updatedAt: now, status: 'draft', steps: [], description: '',
      mailboxId: '', exits: ['Human reply', 'Meeting booked', 'Unsubscribe', 'Invalid email', 'Manually removed'], window: [9, 17],
      businessDays: true, dailyLimit: 50, shared: true, ...seq,
    }
    S.sequences.push(s)
    idx.sequences.set(s.id, s)
    audit('Sequence created', s.name)
  } else {
    Object.assign(s, seq)
    audit('Sequence edited', s.name)
  }
  s.updatedAt = now
  commit()
  return s
}

export function setSeqStatus(id: string, st: string): void {
  const s = idx.sequences.get(id)
  if (!s) return
  s.status = st
  audit(`Sequence ${st}`, s.name)
  if (st === 'active') nudgeEngine()
  commit()
}

export function dupSequence(id: string): Sequence | undefined {
  const s = idx.sequences.get(id)
  if (!s) return undefined
  const now = F.nowIso()
  const c: Sequence = JSON.parse(JSON.stringify(s)) as Sequence
  c.id = uid('sq')
  c.name = `${s.name} (copy)`
  c.status = 'draft'
  c.createdBy = S.session.userId
  c.ownerId = S.session.userId
  c.createdAt = now
  c.updatedAt = now
  for (const x of c.steps) x.id = uid('st')
  S.sequences.push(c)
  idx.sequences.set(c.id, c)
  commit()
  return c
}

export interface EnrolOpts {
  mailboxId?: string
  ownerId?: string
  start?: string
}
export interface EnrolResult {
  ok: string[]
  skipped: Array<{ id: string; why: string }>
}

export function enrol(ctids: string[], seqId: string, o: EnrolOpts = {}): EnrolResult {
  const res: EnrolResult = { ok: [], skipped: [] }
  const seq = idx.sequences.get(seqId)
  if (!seq) return res
  const now = F.nowIso()
  for (const cid of ctids) {
    const el = Q.eligibility(cid, seqId, o.mailboxId)
    if (el.blocks.length) {
      res.skipped.push({ id: cid, why: el.blocks[0] })
      continue
    }
    const rel = ensureRels(cid, seq.businessId, o.ownerId)
    const ct = Q.contact(cid)
    const start = o.start && o.start > now ? o.start : now
    const e: Enrolment = {
      id: uid('en'), seqId, contactId: cid, businessId: seq.businessId, ownerId: o.ownerId || seq.ownerId, mailboxId: o.mailboxId || seq.mailboxId,
      status: 'active', stepIdx: 0, nextDue: null, startedAt: start, threadId: null, history: [], reason: '',
    }
    S.enrolments.push(e)
    idx.enrolments.set(e.id, e)
    if (rel && rel.leadStatus === 'New') rel.leadStatus = 'Contacted'
    act({ type: 'seq_enrolled', businessId: seq.businessId, contactId: cid, companyId: ct?.companyId, seqId, subject: `Enrolled in “${seq.name}”` })
    audit('Sequence enrolled', `${ct?.name ?? cid} → ${seq.name}`)
    res.ok.push(cid)
  }
  if (res.ok.length) nudgeEngine()
  commit()
  return res
}

const ENROL_LABEL: Record<string, string> = { paused: 'Sequence paused', removed: 'Removed from sequence', active: 'Sequence resumed' }

/** Change an enrolment's status without committing, so callers can fold it into a larger batch. */
export function applyEnrol(id: string, st: string, reason?: string): Enrolment | undefined {
  const e = idx.enrolments.get(id)
  if (!e) return undefined
  e.status = st
  e.reason = reason || ''
  if (st === 'active') {
    // A user resume: the server executes the step on its next pass, from "now" in org time.
    e.nextDue = F.nowIso()
    e.resumeAt = null
    e.pauseReason = null
  } else if (st === 'removed' || st === 'paused') {
    for (const m of S.messages) if (m.enrolmentId === id && m.status === 'pending') m.status = 'discarded'
  }
  act({
    type: 'seq_paused', businessId: e.businessId, contactId: e.contactId, companyId: Q.contact(e.contactId)?.companyId, seqId: e.seqId,
    subject: `${ENROL_LABEL[st] ?? `Sequence ${st}`} — ${Q.seq(e.seqId)?.name ?? ''}`,
  })
  audit(`Sequence ${st}`, Q.contact(e.contactId)?.name ?? e.contactId)
  return e
}

export function setEnrol(id: string, st: string, reason?: string): void {
  if (!applyEnrol(id, st, reason)) return
  if (st === 'active') nudgeEngine()
  commit()
}
