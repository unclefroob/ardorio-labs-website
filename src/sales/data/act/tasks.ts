import { F } from '../F'
import { uid } from '../ids'
import { act, audit, notify } from '../internals'
import { applyEnrol } from './seq'
import { nudgeEngine } from '../engineNudge'
import { Q } from '../Q'
import { commit } from '../commit'
import { idx, removeRow, S } from '../store'
import type { Task } from '../types'

export type TaskInput = Pick<Task, 'title' | 'type' | 'businessId' | 'assigneeId' | 'due'> & Partial<Omit<Task, 'title' | 'type' | 'businessId' | 'assigneeId' | 'due'>>

export interface CompleteOpts {
  outcome?: string
  notes?: string
  liKind?: 'linkedin_conn' | 'linkedin_msg' | 'linkedin_reply'
}

function refreshNext(dealId: string): void {
  const d = idx.deals.get(dealId)
  if (!d) return
  const nt = S.tasks.filter(x => x.dealId === d.id && !Q.done(x)).sort((a, b) => a.due.localeCompare(b.due))[0]
  d.next = nt ? nt.title : ''
}

export function createTask(f: TaskInput, silent?: boolean): Task {
  const t: Task = { id: uid('tk'), status: 'Not Started', priority: 'Medium', desc: '', createdAt: F.nowIso(), source: 'Manual', ...f }
  if (t.dealId && !t.companyId) t.companyId = Q.deal(t.dealId)?.companyId
  S.tasks.push(t)
  idx.tasks.set(t.id, t)
  if (t.dealId) refreshNext(t.dealId)
  if (t.assigneeId !== S.session.userId) {
    notify([t.assigneeId], { type: 'New task assigned', title: t.title, body: `Due ${F.dt(t.due)} · from ${Q.me().name}`, link: { page: 'tasks', q: { view: 'mine' } } })
  }
  audit('Task created', t.title)
  if (!silent) commit()
  return t
}

export function updateTask(id: string, p: Partial<Task>): void {
  const t = idx.tasks.get(id)
  if (!t) return
  const prev = t.assigneeId
  // An email task is completed only by a recorded send; a status edit must not mark it done.
  if (t.kind === 'email' && p.status === 'Completed') p = { ...p, status: t.status }
  Object.assign(t, p)
  if (p.assigneeId && p.assigneeId !== prev) {
    audit('Task reassigned', `${t.title} → ${Q.user(p.assigneeId)?.name ?? p.assigneeId}`)
    notify([p.assigneeId], { type: 'New task assigned', title: t.title, body: `Reassigned by ${Q.me().name}`, link: { page: 'tasks', q: { view: 'mine' } } })
  }
  commit()
}

export function completeTask(id: string, o: CompleteOpts = {}): void {
  const t = idx.tasks.get(id)
  if (!t || Q.done(t)) return
  if (t.kind === 'email') {
    // An email task is done only by a recorded send (Act.markEmailSent) or an explicit skip; a bare completion
    // would let the server advance the sequence with no message behind it.
    console.warn('completeTask refused an email task; use markEmailSent or skipEmailTask', id)
    return
  }
  const now = F.nowIso()
  t.status = 'Completed'
  t.completedAt = now
  t.outcome = o.outcome || t.outcome
  t.notes = o.notes || ''
  const ty = t.type === 'Call' ? 'call' : t.type === 'LinkedIn Activity' ? (o.liKind || 'linkedin_conn') : 'task_done'
  act({
    type: ty, businessId: t.businessId, actorId: S.session.userId, companyId: t.companyId, contactId: t.contactId, dealId: t.dealId,
    taskId: t.id, seqId: t.seqId, subject: ty === 'call' ? `Call: ${t.title.replace(/^Call\s*[—-]?\s*/, '')}` : `Completed: ${t.title}`,
    desc: o.notes || '', outcome: o.outcome || '',
  })
  if (o.outcome === 'Meeting Booked') {
    act({ type: 'meeting_booked', businessId: t.businessId, companyId: t.companyId, contactId: t.contactId, dealId: t.dealId, subject: 'Meeting booked from call' })
  }
  if (t.contactId && o.outcome && ['Interested', 'Meeting Booked', 'Connected'].includes(o.outcome)) {
    const r = Q.crel(t.contactId, t.businessId)
    if (r && ['New', 'Contacted'].includes(r.leadStatus)) r.leadStatus = 'Engaged'
  }
  if (o.outcome === 'Wrong Number' && t.contactId) {
    const c = idx.contacts.get(t.contactId)
    if (c) c.phone = ''
  }
  if (t.enrolmentId && o.outcome === 'Meeting Booked') {
    // The server advances the enrolment when the task completes; only the meeting exit is decided here.
    const e = idx.enrolments.get(t.enrolmentId)
    if (e && ['active', 'awaiting_task', 'awaiting_approval'].includes(e.status)) {
      e.status = 'completed'
      e.reason = 'Meeting booked'
      e.nextDue = null
    }
  }
  if (t.enrolmentId) nudgeEngine()
  if (t.dealId) refreshNext(t.dealId)
  if (t.recId) {
    const r = idx.recs.get(t.recId)
    if (r) r.status = 'Completed'
  }
  commit()
}

export function snoozeTask(id: string, hours: number): void {
  const t = idx.tasks.get(id)
  if (!t) return
  t.status = 'Snoozed'
  t.snoozeUntil = F.addHours(F.nowIso(), hours)
  commit()
}

export function cancelTask(id: string): void {
  const t = idx.tasks.get(id)
  if (!t) return
  t.status = 'Cancelled'
  commit()
}

export function deleteTask(id: string): void {
  removeRow('tasks', id)
  audit('Record deleted', 'Task')
  commit()
}

export type EmailTaskResult = { ok: true } | { ok: false; reason: 'no_task' }

const openEmailTask = (id: string) => {
  const t = idx.tasks.get(id)
  return t && t.kind === 'email' && !Q.done(t) ? t : undefined
}

/** Skip one email step. The enrolment is left alone: the server sees the Cancelled task and moves on. */
export function skipEmailTask(id: string): EmailTaskResult {
  const t = openEmailTask(id)
  if (!t) return { ok: false, reason: 'no_task' }
  const now = F.nowIso()
  t.status = 'Cancelled'
  t.outcome = 'Skipped'
  t.completedAt = now
  act({
    id: `ac_sk_${t.id}`, type: 'seq_paused', businessId: t.businessId, actorId: S.session.userId, companyId: t.companyId, contactId: t.contactId,
    seqId: t.seqId, taskId: t.id, enrolmentId: t.enrolmentId, subject: 'Email step skipped', ts: now,
  })
  audit('Email step skipped', t.title)
  nudgeEngine()
  commit()
  return { ok: true }
}

/** The rep decides not to email this contact: remove the enrolment and cancel the task, no suppression. */
export function stopEmailing(id: string): EmailTaskResult {
  const t = openEmailTask(id)
  if (!t) return { ok: false, reason: 'no_task' }
  if (t.enrolmentId) applyEnrol(t.enrolmentId, 'removed', 'Rep chose not to send')
  t.status = 'Cancelled'
  t.outcome = 'Enrolment removed'
  t.completedAt = F.nowIso()
  nudgeEngine()
  commit()
  return { ok: true }
}
