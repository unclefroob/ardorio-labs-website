import { F } from './F'
import { uid } from './ids'
import { Q } from './Q'
import { idx, reindex, S } from './store'
import type {
  Activity, BusinessId, Contact, ContactRel, Enrolment, Mailbox, NotifLink, Notification, Sequence,
  Thread,
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

export interface SuppressOpts {
  /** Suppression reason, e.g. 'Unsubscribe' or 'Invalid address'. */
  reason: string
  scope: 'global' | 'business'
  /** The business the trigger happened in (the suppression is stored against it only for business scope). */
  businessId: BusinessId
  source: string
  by: string
  ts: string
  /** Status written to the contact's live enrolments. */
  enrolStatus: 'unsubscribed' | 'bounced'
  enrolReason: string
  /** Also mark the relationship Do Not Contact / ineligible (unsubscribe, not bounce). */
  doNotContact: boolean
  /** Activity subject for the `suppressed` timeline entry. */
  subject: string
  auditAction: string
  actorId?: string
}

const STOPPABLE = ['active', 'awaiting_approval', 'awaiting_task', 'scheduled', 'paused']

/**
 * The one suppression path (bounce and unsubscribe, from a reply or a manual correction): record the suppression
 * once, stop the contact's live enrolments (every business when global), and leave an activity + audit entry.
 * The server cancels the matching open email tasks when it sees the enrolment status change.
 */
export function suppressContact(ct: Contact, o: SuppressOpts): void {
  const bid = o.scope === 'global' ? null : o.businessId
  const exists = S.suppressions.some(s => !s.removed && s.contactId === ct.id && s.reason === o.reason && s.scope === o.scope && s.businessId === bid)
  if (!exists) {
    S.suppressions.push({ id: uid('sp'), contactId: ct.id, email: ct.email, scope: o.scope, businessId: bid, reason: o.reason, source: o.source, date: o.ts, by: o.by })
  }
  for (const x of S.enrolments) {
    if (x.contactId !== ct.id || !STOPPABLE.includes(x.status)) continue
    if (o.scope === 'business' && x.businessId !== o.businessId) continue
    x.status = o.enrolStatus
    x.nextDue = null
    x.reason = o.enrolReason
  }
  if (o.doNotContact) {
    for (const r of S.contactRels) {
      if (r.contactId === ct.id && (o.scope === 'global' || r.businessId === o.businessId)) {
        r.eligible = false
        r.leadStatus = 'Do Not Contact'
      }
    }
  }
  act({ type: 'suppressed', businessId: o.businessId, actorId: o.actorId, contactId: ct.id, companyId: ct.companyId, subject: o.subject, ts: o.ts })
  audit(o.auditAction, `${ct.name} — ${o.reason.toLowerCase()} (${o.scope})`, o.by)
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
