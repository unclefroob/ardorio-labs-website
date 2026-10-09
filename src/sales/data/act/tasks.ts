import { requestEngineTick } from '../../engine/lease'
import { F } from '../F'
import { uid } from '../ids'
import { act, advance, audit, notify } from '../internals'
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
  if (t.enrolmentId) {
    const e = idx.enrolments.get(t.enrolmentId)
    if (e && e.status === 'awaiting_task' && e.taskId === t.id) {
      e.status = 'active'
      advance(e, now)
      requestEngineTick()
    }
    if (e && o.outcome === 'Meeting Booked' && ['active', 'awaiting_task', 'awaiting_approval'].includes(e.status)) {
      e.status = 'completed'
      e.reason = 'Meeting booked'
      e.nextDue = null
    }
  }
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
