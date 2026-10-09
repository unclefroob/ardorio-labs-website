import { F } from './F'
import { uid } from './ids'
import { Q } from './Q'
import { idx, reindex, S } from './store'
import type {
  Activity, BusinessId, Contact, ContactRel, Enrolment, Mailbox, Message, NotifLink, Notification, Sequence,
  SeqStep, Thread,
} from './types'

export type ActInput = Partial<Activity> & { type: string; businessId: BusinessId }

const CONTACT_TOUCH = ['email_out', 'call', 'meeting', 'linkedin_msg', 'email_in']

/** Append an activity and roll it into the relationship / deal "last activity" fields. */
export function act(o: ActInput): Activity {
  const a: Activity = { id: uid('ac'), visibility: 'business', ts: F.nowIso(), actorId: S.session.userId, ...o }
  S.activities.push(a)
  if (a.contactId) {
    const r = Q.crel(a.contactId, a.businessId)
    if (r && (!r.lastActivity || a.ts > r.lastActivity)) r.lastActivity = a.ts
  }
  if (a.companyId) {
    const r = Q.rel(a.companyId, a.businessId)
    if (r && CONTACT_TOUCH.includes(a.type) && (!r.lastContacted || a.ts > r.lastContacted)) r.lastContacted = a.ts
  }
  if (a.dealId) {
    const d = idx.deals.get(a.dealId)
    if (d && a.ts > d.lastActivity) d.lastActivity = a.ts
  }
  idx.activities.set(a.id, a)
  return a
}

export function audit(action: string, target: string, actor?: string): void {
  S.audit.push({ id: uid('au'), actorId: actor || S.session.userId, action, target, ts: F.nowIso() })
}

export interface NotifInput { type: string; title: string; body?: string; link?: NotifLink }

export function notify(userIds: Array<string | null | undefined>, o: NotifInput): void {
  const ids = [...new Set(userIds.filter((u): u is string => !!u))]
  for (const userId of ids) {
    const n: Notification = { id: uid('nt'), userId, ts: F.nowIso(), read: false, ...o }
    S.notifications.push(n)
  }
}

export function mgrsOf(b: string): string[] {
  return S.users.filter(u => u.super || u.m[b as BusinessId] === 'admin' || u.m[b as BusinessId] === 'manager').map(u => u.id)
}

/** Make sure the contact's company and the contact itself have a relationship with business `b`. */
export function ensureRels(ctid: string, b: BusinessId, ownerId?: string): ContactRel | undefined {
  const ct = idx.contacts.get(ctid)
  if (!ct) return undefined
  const owner = ownerId || S.session.userId
  if (!Q.rel(ct.companyId, b)) {
    S.companyRels.push({
      id: uid('cr'), companyId: ct.companyId, businessId: b, ownerId: owner, status: 'Prospecting', prospectStatus: 'Open',
      source: 'Manual', priority: 'Medium', tags: [], qualification: '', notes: '', createdAt: F.nowIso(),
    })
  }
  let r = Q.crel(ctid, b)
  if (!r) {
    r = {
      id: uid('xr'), contactId: ctid, businessId: b, ownerId: owner, leadStatus: 'New', qualification: 'Unqualified',
      influence: ct.buyingRole, priority: 'Medium', lastActivity: null, nextFollowUp: null, eligible: true, tags: [], scoreFlag: null,
    }
    S.contactRels.push(r)
  }
  reindex()
  return r
}

/** Next due time for a step, respecting the sequence's sending window and business-day setting. */
export function schedule(from: string, delay: number, unit: string | undefined, seq: Pick<Sequence, 'window' | 'businessDays'>): string {
  const d = F.d(from)
  if (unit === 'hours') d.setTime(d.getTime() + delay * 36e5)
  else if (unit === 'business days') {
    let n = delay
    while (n > 0) {
      d.setDate(d.getDate() + 1)
      if (d.getDay() % 6) n--
    }
  } else d.setDate(d.getDate() + (+delay || 0))
  const [w0, w1] = seq.window || [9, 17]
  if (d.getHours() < w0) d.setHours(w0, 0)
  else if (d.getHours() >= w1) {
    d.setDate(d.getDate() + 1)
    d.setHours(w0, 0)
  }
  if (seq.businessDays) {
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1)
      d.setHours(w0, 0)
    }
  }
  return F.iso(d)
}

export function threadFor(e: Enrolment, seq: Sequence, mb: Mailbox, subject: string): Thread | undefined {
  const existing = e.threadId ? idx.threads.get(e.threadId) : undefined
  if (existing) return existing
  const ct = idx.contacts.get(e.contactId)
  if (!ct) return undefined
  const deal = S.deals.find(d => d.businessId === seq.businessId && d.contactIds.includes(ct.id) && d.status === 'open')
  const t: Thread = {
    id: uid('th'), businessId: seq.businessId, mailboxId: mb.id, subject, contactId: ct.id, companyId: ct.companyId,
    dealId: deal?.id ?? null, seqId: seq.id, enrolmentId: e.id, visibility: mb.type === 'personal' ? 'private' : 'shared',
    ownerId: e.ownerId, assigneeId: e.ownerId, unread: false, archived: false, classification: null, needsReply: false,
    sharedWith: [], updatedAt: F.nowIso(),
  }
  S.threads.push(t)
  idx.threads.set(t.id, t)
  e.threadId = t.id
  return t
}

/** Step on to the next sequence step, or finish the enrolment. */
export function advance(e: Enrolment, from: string): void {
  const seq = idx.sequences.get(e.seqId)
  if (!seq) return
  e.stepIdx++
  const nx: SeqStep | undefined = seq.steps[e.stepIdx]
  if (!nx) {
    e.status = 'completed'
    e.nextDue = null
    e.completedAt = from
    act({
      type: 'seq_done', businessId: e.businessId, actorId: e.ownerId, contactId: e.contactId,
      companyId: idx.contacts.get(e.contactId)?.companyId, seqId: seq.id, subject: `Completed sequence “${seq.name}”`, ts: from,
    })
    return
  }
  e.status = 'active'
  e.nextDue = schedule(from, nx.delay || 0, nx.unit, seq)
}

export function sentToday(mbId: string, day: string): number {
  return S.messages.filter(m => m.status === 'sent' && m.mailboxId === mbId && m.ts.slice(0, 10) === day).length
}

function bounce(e: Enrolment, seq: Sequence, ct: Contact, mb: Mailbox, t: Thread, m: Message, ts: string): void {
  m.status = 'bounced'
  S.messages.push(m)
  S.messages.push({
    id: uid('em'), threadId: t.id, dir: 'in', from: `mailer-daemon@${mb.address.split('@')[1]}`, to: mb.address,
    subject: 'Delivery Status Notification (Failure)',
    body: `Your message to ${ct.email} could not be delivered. The address was not found or is unable to receive mail.`,
    ts: F.addHours(ts, 0.1), status: 'received',
  })
  t.classification = { cat: 'Delivery Failure', conf: 0.99, reason: 'Mail server reported the recipient address does not exist.' }
  t.updatedAt = ts
  e.status = 'bounced'
  e.nextDue = null
  e.reason = 'Hard bounce'
  ct.deliverability = 'Bounced'
  ct.verification = 'Invalid'
  S.suppressions.push({
    id: uid('sp'), contactId: ct.id, email: ct.email, scope: 'global', businessId: null, reason: 'Invalid address',
    source: `Hard bounce from sequence “${seq.name}”`, date: ts, by: 'system',
  })
  act({ type: 'bounce', businessId: seq.businessId, actorId: e.ownerId, contactId: ct.id, companyId: ct.companyId, seqId: seq.id, subject: `Email bounced — ${ct.email}`, ts })
  audit('Suppression added (bounce)', ct.name, 'system')
  notify([e.ownerId], { type: 'Sequence failure', title: `Email to ${ct.name} bounced`, body: `Removed from “${seq.name}” and suppressed.`, link: { page: 'contact', id: ct.id } })
}

/** Record one sequence email as sent (simulated), then advance. */
export function sendMsg(e: Enrolment, seq: Sequence, step: SeqStep, ts: string, subject: string, body: string): void {
  const mb = idx.mailboxes.get(e.mailboxId || seq.mailboxId)
  const ct = idx.contacts.get(e.contactId)
  if (!mb || !ct) return
  const t = threadFor(e, seq, mb, subject)
  if (!t) return
  if (S.messages.some(m => m.enrolmentId === e.id && m.stepId === step.id && m.status === 'sent')) {
    advance(e, ts)
    return
  }
  const m: Message = {
    id: uid('em'), threadId: t.id, dir: 'out', from: mb.address, to: ct.email, cc: '',
    subject: t.subject === subject ? subject : `Re: ${t.subject.replace(/^Re: /, '')}`,
    body, ts, status: 'sent', enrolmentId: e.id, stepId: step.id, mailboxId: mb.id,
  }
  if (ct._bounce) {
    bounce(e, seq, ct, mb, t, m, ts)
    return
  }
  S.messages.push(m)
  idx.messages.set(m.id, m)
  t.updatedAt = ts
  act({
    type: 'email_out', businessId: seq.businessId, actorId: e.ownerId, contactId: ct.id, companyId: ct.companyId, dealId: t.dealId,
    seqId: seq.id, messageId: m.id, subject: m.subject, desc: `Sequence step ${e.stepIdx + 1} · ${seq.name}`, ts,
    visibility: t.visibility === 'private' ? 'private' : 'business', ownerId: t.ownerId,
  })
  advance(e, ts)
}
