import { classify, type Classification } from '../../ai/local'
import { now as clockNow } from '../clock'
import { nudgeEngine } from '../engineNudge'
import { F } from '../F'
import { detId, uid } from '../ids'
import { act, audit, notify, suppressContact, threadFor } from '../internals'
import { Q } from '../Q'
import { commit } from '../commit'
import { idx, reindex, S } from '../store'
import type { BusinessId, Meeting, Message, Thread } from '../types'

// ── calls & meetings ────────────────────────────────────────────────────────────────────────
export interface CallForm {
  businessId: BusinessId
  companyId?: string | null
  contactId?: string | null
  dealId?: string | null
  notes: string
  outcome: string
}

export function logCall(f: CallForm): void {
  act({
    type: 'call', businessId: f.businessId, companyId: f.companyId, contactId: f.contactId, dealId: f.dealId,
    subject: `Call with ${Q.contact(f.contactId)?.name || 'contact'}`, desc: f.notes, outcome: f.outcome,
  })
  if (f.outcome === 'Meeting Booked') {
    act({ type: 'meeting_booked', businessId: f.businessId, companyId: f.companyId, contactId: f.contactId, dealId: f.dealId, subject: 'Meeting booked from call' })
  }
  commit()
}

export type MeetingInput = Partial<Meeting> & Pick<Meeting, 'title' | 'businessId' | 'start' | 'status'>

export function saveMeeting(f: MeetingInput): Meeting {
  let m = f.id ? idx.meetings.get(f.id) : undefined
  const isNew = !m
  if (!m) {
    m = {
      id: uid('mt'), createdBy: S.session.userId, ownerId: S.session.userId, participants: [], duration: 30, type: 'Discovery', sections: {},
      summary: '', nextSteps: '', ...f,
    }
    S.meetings.push(m)
    idx.meetings.set(m.id, m)
  } else Object.assign(m, f, { id: m.id })
  const now = F.nowIso()
  if (isNew && m.status === 'upcoming') {
    act({ type: 'meeting_booked', businessId: m.businessId, companyId: m.companyId, contactId: m.participants[0], dealId: m.dealId, subject: `Meeting booked: ${m.title}`, meetingId: m.id })
  }
  if (m.status === 'completed' && !m._logged) {
    m._logged = 1
    act({
      type: 'meeting', businessId: m.businessId, companyId: m.companyId, contactId: m.participants[0], dealId: m.dealId, subject: m.title,
      desc: m.summary, outcome: m.outcome || 'Completed', ts: m.start <= now ? m.start : now, meetingId: m.id,
    })
  }
  if (m.dealId && m.status === 'completed') {
    const d = idx.deals.get(m.dealId)
    if (d && d.status === 'open') {
      for (const c of m.participants || []) if (!d.contactIds.includes(c)) d.contactIds.push(c)
    }
  }
  audit(isNew ? 'Meeting logged' : 'Meeting updated', m.title)
  commit()
  return m
}

// ── email ───────────────────────────────────────────────────────────────────────────────────
export interface SendEmailForm {
  mailboxId: string
  businessId: BusinessId
  to: string
  cc?: string
  subject: string
  body: string
  contactId?: string
  companyId?: string
  dealId?: string | null
  threadId?: string
  draftId?: string
  draft?: boolean
}

export type SendResult =
  | { ok: true; thread: Thread; msg: Message }
  | { ok: false; reason: 'no_mailbox' }
  | { ok: false; reason: 'suppressed'; detail: string }

const splitAddrs = (v: string | undefined): string[] => (v || '').split(/[,;\s]+/).map(a => a.trim().toLowerCase()).filter(a => a.includes('@'))

/** Every recipient that is suppressed for business `b`, as the lower-case address (or the contact's own address). */
function suppressedRecipients(f: SendEmailForm, thread: Thread | undefined): string[] {
  const hit = new Set<string>()
  const ctIds = [f.contactId, thread?.contactId].filter((x): x is string => !!x)
  for (const id of ctIds) {
    const ct = idx.contacts.get(id)
    if (ct && Q.suppressed(ct, f.businessId)) hit.add((ct.email || ct.name).toLowerCase())
  }
  for (const a of [...splitAddrs(f.to), ...splitAddrs(f.cc)]) if (Q.suppressedAddr(a, f.businessId)) hit.add(a)
  return [...hit]
}

export function sendEmail(f: SendEmailForm): SendResult {
  const mb = idx.mailboxes.get(f.mailboxId)
  if (!mb) return { ok: false, reason: 'no_mailbox' }
  const existing = f.threadId ? idx.threads.get(f.threadId) : undefined
  if (!f.draft) {
    // The server refuses to mark a message sent to a suppressed address (SUPPRESSED); refuse here first so nothing is written.
    const blocked = suppressedRecipients(f, existing)
    if (blocked.length) return { ok: false, reason: 'suppressed', detail: `Suppressed: ${blocked.join(', ')}` }
  }
  const ct = f.contactId ? idx.contacts.get(f.contactId) : undefined
  const now = F.nowIso()
  let t = existing
  if (!t) {
    t = {
      id: uid('th'), businessId: f.businessId, mailboxId: mb.id, subject: f.subject, contactId: f.contactId, companyId: f.companyId || ct?.companyId,
      dealId: f.dealId || null, visibility: mb.type === 'personal' ? 'private' : 'shared', ownerId: S.session.userId, assigneeId: S.session.userId,
      unread: false, archived: false, classification: null, needsReply: false, sharedWith: [], updatedAt: now,
    }
    S.threads.push(t)
    idx.threads.set(t.id, t)
  }
  let m = f.draftId ? S.messages.find(x => x.id === f.draftId) : undefined
  if (!m) {
    m = { id: uid('em'), threadId: t.id, dir: 'out', from: mb.address, to: f.to, subject: f.subject, body: f.body, ts: now, status: 'sent' }
    S.messages.push(m)
  }
  Object.assign(m, { dir: 'out', from: mb.address, to: f.to, cc: f.cc || '', subject: f.subject, body: f.body, ts: now, status: f.draft ? 'draft' : 'sent', mailboxId: mb.id })
  t.updatedAt = now
  if (!f.draft) {
    t.needsReply = false
    t.unread = false
    act({
      type: 'email_out', businessId: f.businessId, companyId: t.companyId, contactId: t.contactId, dealId: t.dealId, messageId: m.id, subject: f.subject,
      desc: `Sent from ${mb.address} (simulated)`, visibility: t.visibility === 'private' ? 'private' : 'business', ownerId: t.ownerId,
    })
    audit('Email simulated as sent', `${f.subject} → ${f.to}`)
  }
  commit()
  return { ok: true, thread: t, msg: m }
}

export type MarkSentResult = { ok: true } | { ok: false; reason: 'suppressed' | 'no_task' | 'duplicate' }

/**
 * The rep sent an engine-drafted email from their own mail client and says so. Records the message, the
 * activity and the completed task in one batch; the server advances the enrolment (never done here).
 * Ids are deterministic from the task id, so a retry or a second tab collapses into one record.
 */
export function markEmailSent(taskId: string): MarkSentResult {
  const t = idx.tasks.get(taskId)
  if (!t || t.kind !== 'email' || !t.draft || t.status === 'Cancelled') return { ok: false, reason: 'no_task' }
  const msgId = detId(`ms_${t.id}`)
  if (t.status === 'Completed' || idx.messages.has(msgId) || S.messages.some(m => m.id === msgId)) return { ok: false, reason: 'duplicate' }
  const e = t.enrolmentId ? idx.enrolments.get(t.enrolmentId) : undefined
  const ct = t.contactId ? idx.contacts.get(t.contactId) : undefined
  const d = t.draft
  const blocked = (ct && Q.suppressed(ct, t.businessId)) || [d.to, d.cc].flatMap(splitAddrs).some(a => Q.suppressedAddr(a, t.businessId))
  if (blocked) return { ok: false, reason: 'suppressed' }
  const seq = e ? idx.sequences.get(e.seqId) : undefined
  const mb = idx.mailboxes.get(t.mailboxId || e?.mailboxId || seq?.mailboxId || '')
  const subject = d.subject
  let th = e?.threadId ? idx.threads.get(e.threadId) : undefined
  if (!th && e && seq && mb) th = threadFor(e, seq, mb, subject)
  if (!th) return { ok: false, reason: 'no_task' }
  const now = F.nowIso()
  const m: Message = {
    id: msgId, threadId: th.id, dir: 'out', from: d.from || mb?.address || '', to: d.to, cc: d.cc || '',
    subject: th.subject === subject ? subject : `Re: ${th.subject.replace(/^Re: /, '')}`, body: d.body, ts: now, status: 'sent',
    enrolmentId: t.enrolmentId, stepId: t.stepId, mailboxId: mb?.id ?? t.mailboxId, manual: true, sentAt: new Date(clockNow()).toISOString(),
  }
  S.messages.push(m)
  idx.messages.set(m.id, m)
  th.updatedAt = now
  th.needsReply = false
  act({
    id: detId(`ac_ms_${t.id}`), type: 'email_out', businessId: t.businessId, actorId: S.session.userId, companyId: t.companyId ?? ct?.companyId, contactId: t.contactId,
    dealId: th.dealId, seqId: t.seqId, enrolmentId: t.enrolmentId, taskId: t.id, messageId: m.id, subject: m.subject, manual: true,
    desc: `Sent manually from ${m.from} (marked as sent)`, ts: now, visibility: th.visibility === 'private' ? 'private' : 'business', ownerId: th.ownerId,
  })
  t.status = 'Completed'
  t.completedAt = now
  t.outcome = 'Sent (manual)'
  audit('Email marked as sent', `${subject} → ${d.to}`)
  nudgeEngine()
  commit()
  return { ok: true }
}

export function markThread(id: string, p: Partial<Thread>): void {
  const t = idx.threads.get(id)
  if (!t) return
  Object.assign(t, p)
  commit()
}

export function shareThread(id: string, uids: string[]): void {
  const t = idx.threads.get(id)
  if (!t) return
  t.sharedWith = uids
  audit('Email thread shared', t.subject)
  commit()
}

// ── replies ─────────────────────────────────────────────────────────────────────────────────
export interface SimulateReplyOpts {
  contactId: string
  text: string
  ts?: string
  enrolmentId?: string
  threadId?: string
  businessId?: BusinessId
  global?: boolean
  silent?: boolean
  /** From the async classifier; when absent the deterministic local one is used. */
  classification?: Classification
}

const LIVE = ['active', 'awaiting_approval', 'awaiting_task', 'scheduled', 'paused']

export function simulateReply(o: SimulateReplyOpts): Thread | undefined {
  const ct = idx.contacts.get(o.contactId)
  if (!ct) return undefined
  const ts = o.ts || F.nowIso()
  const e = o.enrolmentId
    ? idx.enrolments.get(o.enrolmentId)
    : S.enrolments.filter(x => x.contactId === ct.id && (!o.businessId || x.businessId === o.businessId)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  let t = o.threadId
    ? idx.threads.get(o.threadId)
    : e?.threadId
      ? idx.threads.get(e.threadId)
      : S.threads.filter(x => x.contactId === ct.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const b = t?.businessId ?? e?.businessId ?? o.businessId ?? Q.primaryBiz(ct)
  if (!b) return undefined
  if (!t) {
    const mb = S.mailboxes.find(x => x.businessIds.includes(b))
    if (!mb) return undefined
    const owner = Q.crel(ct.id, b)?.ownerId || S.session.userId
    t = {
      id: uid('th'), businessId: b, mailboxId: mb.id, subject: `Enquiry from ${ct.name}`, contactId: ct.id, companyId: ct.companyId, dealId: null,
      visibility: 'shared', ownerId: owner, assigneeId: owner, unread: true, archived: false, classification: null, needsReply: true, sharedWith: [], updatedAt: ts,
    }
    S.threads.push(t)
    idx.threads.set(t.id, t)
  }
  const mb = idx.mailboxes.get(t.mailboxId)
  const m: Message = {
    id: uid('em'), threadId: t.id, dir: 'in', from: ct.email || 'unknown@example', to: mb?.address ?? '', cc: '',
    subject: `Re: ${t.subject.replace(/^Re: /, '')}`, body: o.text, ts, status: 'received',
  }
  S.messages.push(m)
  const cl = o.classification ?? classify(o.text)
  const tc = { cat: cl.cat, secondary: cl.secondary, conf: cl.conf, reason: cl.reason, corrected: false, impact: '' }
  t.classification = tc
  t.unread = true
  t.needsReply = !['Unsubscribe', 'Out of Office', 'Delivery Failure'].includes(cl.cat)
  t.updatedAt = ts
  t.archived = false
  const owner = t.ownerId
  const vis = t.visibility === 'private' ? 'private' : 'business'
  act({
    type: 'email_in', businessId: b, actorId: owner, companyId: ct.companyId, contactId: ct.id, dealId: t.dealId, messageId: m.id, seqId: t.seqId,
    subject: `Reply: ${cl.cat}`, desc: o.text.slice(0, 160), ts, visibility: vis, ownerId: owner,
  })
  const live = S.enrolments.filter(x => x.contactId === ct.id && x.businessId === b && LIVE.includes(x.status))
  const discardPending = (list: typeof live): void => {
    for (const x of S.messages) if (x.status === 'pending' && list.some(l => l.id === x.enrolmentId)) x.status = 'discarded'
  }
  let impact = 'No active sequence'
  if (cl.cat === 'Unsubscribe') {
    const scope = o.global ? 'global' : 'business'
    suppressContact(ct, {
      reason: 'Unsubscribe', scope, businessId: b, source: `Reply detected: “${o.text.slice(0, 60)}”`, by: 'system', ts, enrolStatus: 'unsubscribed',
      enrolReason: 'Unsubscribe request', doNotContact: true, subject: `Contact suppressed (${scope}) — unsubscribe`, auditAction: 'Contact suppression updated', actorId: owner,
    })
    impact = 'Sequence stopped · suppression created'
    notify([owner], { type: 'Contact unsubscribe', title: `${ct.name} unsubscribed`, body: 'Outreach stopped and suppression recorded.', link: { page: 'contact', id: ct.id } })
  } else if (cl.cat === 'Out of Office') {
    for (const x of live) {
      x.status = 'paused'
      x.reason = 'Out of office'
      x.resumeAt = cl.returnDate ? `${cl.returnDate}T09:00` : F.addDays(ts, 7)
    }
    const first = live[0]
    if (first?.resumeAt) impact = `Paused until ${F.date(first.resumeAt)}`
  } else if (cl.cat === 'Delivery Failure') {
    // A hard bounce is a global suppression (Invalid address), same path as an unsubscribe.
    suppressContact(ct, {
      reason: 'Invalid address', scope: 'global', businessId: b, source: `Bounce detected on thread “${t.subject}”`, by: 'system', ts, enrolStatus: 'bounced',
      enrolReason: 'Hard bounce', doNotContact: false, subject: `Contact suppressed (global) — invalid address`, auditAction: 'Suppression added (bounce)', actorId: owner,
    })
    ct.deliverability = 'Bounced'
    ct.verification = 'Invalid'
    act({ type: 'bounce', businessId: b, actorId: owner, contactId: ct.id, companyId: ct.companyId, subject: `Email bounced — ${ct.email}`, ts })
    notify([owner], { type: 'Sequence failure', title: `Email to ${ct.name} bounced`, body: 'Address suppressed; outreach stopped.', link: { page: 'contact', id: ct.id } })
    impact = 'Stopped — bounced · address suppressed'
  } else {
    for (const x of live) {
      x.status = 'replied'
      x.nextDue = null
      x.reason = `Human reply (${cl.cat})`
    }
    discardPending(live)
    if (live.length) {
      impact = 'Sequence paused — reply needs review'
      act({ type: 'seq_paused', businessId: b, actorId: owner, contactId: ct.id, companyId: ct.companyId, seqId: live[0].seqId, subject: 'Sequence paused after reply', ts })
    }
    const r = Q.crel(ct.id, b)
    if (r && ['Interested', 'Meeting Requested', 'More Information Requested', 'Referral'].includes(cl.cat)) r.leadStatus = 'Engaged'
    const pos = ['Interested', 'Meeting Requested', 'More Information Requested'].includes(cl.cat)
    notify([owner], {
      type: pos ? 'New positive reply' : 'New reply', title: `${pos ? 'Positive reply from ' : 'Reply from '}${ct.name}`,
      body: `${cl.cat} · ${Q.company(ct.companyId)?.name ?? ''}`, link: { page: 'inbox', id: t.id },
    })
  }
  tc.impact = impact
  S.recs.push({
    id: uid('rc'), key: `reply:${m.id}`, businessId: b, type: 'Reply follow-up', title: `${cl.nextAction} — ${ct.name}`, explain: cl.reason,
    evidence: `Inbound email ${F.dt(ts)} · classified ${cl.cat} (${Math.round(cl.conf * 100)}%)`, confidence: cl.conf > 0.85 ? 'High' : 'Medium',
    action: cl.cat === 'Unsubscribe' ? 'view' : 'task', taskTitle: cl.taskTitle.replace('{name}', ct.firstName), taskDays: cl.followUpDays,
    contactId: ct.id, companyId: ct.companyId, dealId: t.dealId, threadId: t.id, createdAt: ts, status: 'New',
    suggestDeal: cl.deal && !S.deals.some(d => d.companyId === ct.companyId && d.businessId === b && d.status === 'open'),
  })
  reindex()
  if (!o.silent) commit()
  return t
}

export function correctClass(tid: string, cat: string): void {
  const t = idx.threads.get(tid)
  if (!t) return
  t.classification = { ...(t.classification ?? { conf: 1, reason: '' }), cat, corrected: true, conf: 1, reason: `Manually corrected by ${Q.me().name}` }
  audit('Reply classification corrected', `${t.subject} → ${cat}`)
  const ct = t.contactId ? idx.contacts.get(t.contactId) : undefined
  if (cat === 'Unsubscribe' && ct) {
    suppressContact(ct, {
      reason: 'Unsubscribe', scope: 'business', businessId: t.businessId, source: 'Manual classification correction', by: S.session.userId, ts: F.nowIso(),
      enrolStatus: 'unsubscribed', enrolReason: 'Unsubscribe request', doNotContact: true, subject: 'Contact suppressed (business) — unsubscribe',
      auditAction: 'Contact suppression updated',
    })
    notify([t.ownerId], { type: 'Contact unsubscribe', title: `${ct.name} unsubscribed`, body: 'Outreach stopped and suppression recorded.', link: { page: 'contact', id: ct.id } })
  }
  commit()
}

export function simEvent(kind: 'email_open' | 'link_click' | 'meeting_booked', ctid: string): void {
  const ct = idx.contacts.get(ctid)
  if (!ct) return
  const e = S.enrolments.find(x => x.contactId === ctid)
  const b = e?.businessId ?? Q.primaryBiz(ct)
  if (!b) return
  const subject = kind === 'email_open' ? 'Email opened (simulated tracking — unreliable signal)' : kind === 'link_click' ? 'Tracked link clicked (simulated)' : 'Meeting booked via scheduling link'
  act({ type: kind, businessId: b, contactId: ctid, companyId: ct.companyId, seqId: e?.seqId, subject, actorId: e ? e.ownerId : S.session.userId })
  if (kind === 'meeting_booked' && e && ['active', 'awaiting_approval', 'awaiting_task'].includes(e.status)) {
    e.status = 'completed'
    e.reason = 'Meeting booked'
    e.nextDue = null
    notify([e.ownerId], { type: 'Meeting approaching', title: `${ct.name} booked a meeting`, link: { page: 'contact', id: ctid } })
  }
  commit()
}
