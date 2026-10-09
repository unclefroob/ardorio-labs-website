import { refreshRecs } from '../ai/rules'
import { F } from '../data/F'
import { uid } from '../data/ids'
import { advance, notify, schedule, sendMsg, sentToday, threadFor } from '../data/internals'
import { Q } from '../data/Q'
import { idx, S } from '../data/store'
import type { BusinessId, Enrolment, Message, Task } from '../data/types'

/**
 * The simulated sequence engine. Every function is scoped to the businesses whose lease this tab
 * holds, so two tabs (or two users) never both act on the same business.
 */

const MAX_STEPS_PER_RUN = 2000
const APPROVAL = 'approval'

function exec(e: Enrolment): void {
  const seq = idx.sequences.get(e.seqId)
  if (!seq) return
  const step = seq.steps[e.stepIdx]
  const ts = e.nextDue
  const ct = idx.contacts.get(e.contactId)
  if (!step) {
    e.status = 'completed'
    e.nextDue = null
    return
  }
  if (!ts || !ct) return
  const mbId = e.mailboxId || seq.mailboxId
  const tok = Q.tokens(ct, Q.senderOf(idx.mailboxes.get(e.mailboxId)), seq.businessId)

  if (step.type === 'email') {
    if (Q.suppression(ct.id, seq.businessId)) {
      e.status = 'removed'
      e.reason = 'Contact suppressed'
      e.nextDue = null
      return
    }
    if (!ct.email || ct.deliverability === 'Bounced') {
      e.status = 'failed'
      e.reason = 'No valid email address'
      e.nextDue = null
      notify([e.ownerId], { type: 'Sequence failure', title: `Step failed for ${ct.name}`, body: 'No valid email address.', link: { page: 'sequence', id: seq.id } })
      return
    }
    const mb = idx.mailboxes.get(mbId)
    if (!mb || mb.status !== 'connected') {
      e.status = 'failed'
      e.reason = 'Sender mailbox disconnected'
      e.nextDue = null
      notify([e.ownerId], {
        type: 'Sequence failure', title: 'Mailbox disconnected',
        body: `${mb ? mb.address : 'Mailbox'} could not send to ${ct.name}. Reconnect in Integrations.`, link: { page: 'integrations' },
      })
      return
    }
    const sj = Q.render(step.subject, tok)
    const bd = Q.render(step.body, tok)
    if (sj.missing.length || bd.missing.length) {
      e.status = 'paused'
      e.reason = `Held: missing {{${[...sj.missing, ...bd.missing].join('}}, {{')}}}`
      return
    }
    if (sentToday(mb.id, ts.slice(0, 10)) >= (seq.dailyLimit || 50)) {
      e.nextDue = schedule(F.addDays(`${ts.slice(0, 10)}T08:00`, 1), 0, 'days', seq)
      return
    }
    const needsApproval = step.approval === 'inherit' || !step.approval ? seq.mode === APPROVAL : step.approval === APPROVAL
    if (needsApproval) {
      const t = threadFor(e, seq, mb, sj.text)
      if (!t) return
      const m: Message = {
        id: uid('em'), threadId: t.id, dir: 'out', from: mb.address, to: ct.email, cc: '', subject: sj.text, body: bd.text,
        ts, status: 'pending', enrolmentId: e.id, stepId: step.id, mailboxId: mb.id,
      }
      S.messages.push(m)
      idx.messages.set(m.id, m)
      e.status = 'awaiting_approval'
      e.pendingMsgId = m.id
      e.nextDue = null
      notify([e.ownerId], { type: 'Email requiring approval', title: `Approve email to ${ct.name}`, body: `${seq.name} · step ${e.stepIdx + 1}`, link: { page: 'myday' } })
      return
    }
    sendMsg(e, seq, step, ts, sj.text, bd.text)
    return
  }

  if (step.type === 'call' || step.type === 'linkedin' || step.type === 'task') {
    const ty = step.type === 'call' ? 'Call' : step.type === 'linkedin' ? 'LinkedIn Activity' : step.taskType || 'General'
    const t: Task = {
      id: uid('tk'), title: Q.render(step.title || ty, tok).text, type: ty,
      desc: step.type === 'linkedin' ? `${step.action || 'LinkedIn activity'} (manual — no automation).` : step.desc || '',
      script: Q.render(step.script || '', tok).text, businessId: seq.businessId, assigneeId: step.assignee || e.ownerId,
      priority: step.priority || 'Medium', due: ts, status: 'Not Started', companyId: ct.companyId, contactId: ct.id,
      seqId: seq.id, enrolmentId: e.id, stepId: step.id, source: `Sequence: ${seq.name}`, createdAt: ts,
    }
    S.tasks.push(t)
    idx.tasks.set(t.id, t)
    if (step.wait) {
      e.status = 'awaiting_task'
      e.taskId = t.id
      e.nextDue = null
      return
    }
    advance(e, ts)
    return
  }

  if (step.type === 'wait') {
    advance(e, ts)
    return
  }

  if (step.type === 'branch') {
    const replied = S.messages.some(m => m.threadId === e.threadId && m.dir === 'in' && m.status === 'received' && !/mailer-daemon/.test(m.from))
    const clicked = S.activities.some(a => a.contactId === ct.id && a.type === 'link_click' && a.ts >= e.startedAt)
    const meet = S.activities.some(a => a.contactId === ct.id && a.type === 'meeting_booked' && a.ts >= e.startedAt)
    const taskDone = S.tasks.some(x => x.enrolmentId === e.id && x.status === 'Completed')
    const conds: Record<string, boolean> = {
      no_reply: !replied, replied, positive: replied, meeting: meet, bounced: ct.deliverability === 'Bounced',
      unsub: !!Q.suppression(ct.id, seq.businessId), task_done: taskDone, clicked,
    }
    if (step.cond && conds[step.cond]) {
      advance(e, ts)
      return
    }
    if (step.onFalse === 'skip') {
      e.stepIdx++
      advance(e, ts)
      return
    }
    e.status = 'completed'
    e.nextDue = null
    e.reason = 'Exited at branch'
    return
  }
  advance(e, ts)
}

const inScope = (scope: readonly BusinessId[], b: string): boolean => (scope as readonly string[]).includes(b)

/** Run every due enrolment in the given businesses, oldest first. */
export function runEngine(scope: readonly BusinessId[]): void {
  const clock = F.nowIso()
  for (let g = 0; g < MAX_STEPS_PER_RUN; g++) {
    let due: Enrolment | undefined
    for (const e of S.enrolments) {
      if (e.status !== 'active' || !e.nextDue || e.nextDue > clock || !inScope(scope, e.businessId)) continue
      if (idx.sequences.get(e.seqId)?.status !== 'active') continue
      if (!due || (due.nextDue ?? '') > e.nextDue) due = e
    }
    if (!due) break
    exec(due)
  }
}

/** One engine heartbeat: wake snoozed tasks, raise reminders, resume holds, run the engine, refresh recommendations. */
export function tick(scope: readonly BusinessId[]): void {
  const clock = F.nowIso()
  for (const t of S.tasks) {
    if (!inScope(scope, t.businessId)) continue
    if (t.status === 'Snoozed' && t.snoozeUntil && t.snoozeUntil <= clock) {
      t.status = 'Not Started'
      t.due = t.snoozeUntil
    }
    if (Q.overdue(t) && !t._od) {
      t._od = 1
      if (t.priority === 'High') {
        notify([t.assigneeId], { type: 'Task overdue', title: `Overdue: ${t.title}`, body: `Was due ${F.dt(t.due)}`, link: { page: 'tasks', q: { view: 'overdue' } } })
      }
    }
  }
  const nowMs = F.now().getTime()
  for (const m of S.meetings) {
    if (!inScope(scope, m.businessId)) continue
    if (m.status === 'upcoming' && !m._nt && m.start > clock && F.d(m.start).getTime() - nowMs <= 864e5) {
      m._nt = 1
      notify([m.ownerId], { type: 'Meeting approaching', title: m.title, body: F.dt(m.start), link: { page: 'deal', id: m.dealId } })
    }
  }
  for (const e of S.enrolments) {
    if (!inScope(scope, e.businessId)) continue
    if (e.status === 'paused' && e.resumeAt && e.resumeAt <= clock) {
      e.status = 'active'
      e.nextDue = clock
      e.resumeAt = null
      e.reason = ''
    }
  }
  runEngine(scope)
  refreshRecs(scope)
}
