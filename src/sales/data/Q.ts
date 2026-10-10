import { F } from './F'
import { idx, S } from './store'
import { ageDays, applySignalAdjust, computeSignalAdjust, NO_ADJUST, type PendingClosure, type SignalAdjust, type SignalAdjustPart } from './signalAdjust'
import { SYSTEM_USER, SYSTEM_USER_ID } from './systemUser'
import type {
  Activity, Business, BusinessId, Company, CompanyRel, Contact, ContactRel, Deal, Enrolment, Goal, Mailbox,
  Message, Meeting, Notification, Pipeline, PipelineField, Rec, Role, SalesUser, Sequence, Stage, Suppression,
  Task, Team, Template, Thread, ListRec, Intel,
} from './types'
import type { IntelKind } from '../api/contract'

/** Stand-in used only if the signed-in member is missing from the user list (should not happen). */
const GHOST: SalesUser = {
  id: '', name: 'Unknown user', title: '', email: '', super: false, m: {}, active: false, color: '#8E8897',
  meetingLink: '', createdAt: '', username: '',
}

const liveSuppression = (s: Suppression, b: string): boolean => !s.removed && (s.scope === 'global' || s.businessId === b)

export type RoleName = Role | 'super' | null
const EDIT_ROLES: readonly RoleName[] = ['super', 'admin', 'manager', 'sales']
const MANAGE_ROLES: readonly RoleName[] = ['super', 'admin', 'manager']
const ADMIN_ROLES: readonly RoleName[] = ['super', 'admin']
const LIVE_ENROL = ['active', 'awaiting_approval', 'awaiting_task', 'paused', 'scheduled']

export interface ScoreResult {
  total: number
  label: string
  parts: Array<[string, number, number]>
  pos: string[]
  missing: string[]
  next?: string
  /** Movement from saved web signals, already included in `total`. Absent when nothing moved it. */
  adjust?: SignalAdjust
  /** When the saved signals behind `adjust` were last checked. */
  signalsCheckedAt?: string
  /** Present with `adjust`: the same movement with sources, pending closures and when it was last checked. */
  breakdown?: ScoreBreakdown
}
/** A base score and how saved web signals move it, with the reasons and when the web was last checked. */
export interface ScoreBreakdown {
  base: number
  /** Points the saved signals add or take off (0 when nothing moved the score). */
  adjust: number
  total: number
  parts: SignalAdjustPart[]
  /** Reported closures nobody has confirmed or dismissed. They move nothing. */
  pending: PendingClosure[]
  /** When signals or tech were last checked for this company and business; undefined when never. */
  checkedAt: string | undefined
  checkedDaysAgo: number | null
}
export interface RiskResult { level: 'high' | 'med'; reasons: string[] }
export interface Eligibility { blocks: string[]; warns: string[] }
export interface MissingField { key: string; label: string; field: PipelineField | null }
export type TokenMap = Record<string, string | null | undefined>

function emptyPipeline(b: BusinessId): Pipeline {
  return { id: '', businessId: b, name: '', lostReasons: [], forecast: [], card: [], fields: [], stages: [] }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export const Q = {
  me: (): SalesUser => idx.users.get(S.session.userId) ?? GHOST,
  biz: (id: string | null | undefined): Business | undefined => (id ? idx.businesses.get(id) : undefined),
  user: (id: string | null | undefined): SalesUser | undefined => (id ? (idx.users.get(id) ?? (id === SYSTEM_USER_ID ? SYSTEM_USER : undefined)) : undefined),
  company: (id: string | null | undefined): Company | undefined => (id ? idx.companies.get(id) : undefined),
  contact: (id: string | null | undefined): Contact | undefined => (id ? idx.contacts.get(id) : undefined),
  deal: (id: string | null | undefined): Deal | undefined => (id ? idx.deals.get(id) : undefined),
  task: (id: string | null | undefined): Task | undefined => (id ? idx.tasks.get(id) : undefined),
  seq: (id: string | null | undefined): Sequence | undefined => (id ? idx.sequences.get(id) : undefined),
  enrol: (id: string | null | undefined): Enrolment | undefined => (id ? idx.enrolments.get(id) : undefined),
  thread: (id: string | null | undefined): Thread | undefined => (id ? idx.threads.get(id) : undefined),
  msg: (id: string | null | undefined): Message | undefined => (id ? idx.messages.get(id) : undefined),
  mailbox: (id: string | null | undefined): Mailbox | undefined => (id ? idx.mailboxes.get(id) : undefined),
  list: (id: string | null | undefined): ListRec | undefined => (id ? idx.lists.get(id) : undefined),
  meeting: (id: string | null | undefined): Meeting | undefined => (id ? idx.meetings.get(id) : undefined),
  template: (id: string | null | undefined): Template | undefined => (id ? idx.templates.get(id) : undefined),
  team: (id: string | null | undefined): Team | undefined => (id ? idx.teams.get(id) : undefined),
  rec: (id: string | null | undefined): Rec | undefined => (id ? idx.recs.get(id) : undefined),
  /** Saved web-intelligence record for a company. Without a business: the newest one across the businesses the caller can see. */
  intel(companyId: string, kind: IntelKind, b?: string): Intel | undefined {
    const rows = S.intel.filter(i => i.companyId === companyId && i.kind === kind && (b ? i.businessId === b : Q.inScope(i.businessId)))
    return rows.sort((x, y) => y.ts.localeCompare(x.ts))[0]
  },
  /** How saved signals and tech findings move a company's score for one business. Deterministic; nothing here calls the web. */
  signalAdjust(companyId: string, b: string, now: number = Date.now()): SignalAdjust {
    const rows = S.intel.filter(i => i.companyId === companyId && i.businessId === b)
    return rows.length ? computeSignalAdjust(rows, now) : NO_ADJUST
  },
  /** The one place a score and its web-signal movement are worked out. Every score on screen reads this. */
  scoreBreakdown(companyId: string, b: string, base: number, now: number = Date.now()): ScoreBreakdown {
    const rows = S.intel.filter(i => i.companyId === companyId && i.businessId === b && (i.kind === 'signals' || i.kind === 'tech'))
    const adj = rows.length ? computeSignalAdjust(rows, now) : NO_ADJUST
    const checkedAt = rows.map(r => r.checkedAt ?? r.ts).sort().pop()
    const total = adj.parts.length ? applySignalAdjust(base, adj.delta) : base
    return { base, adjust: total - base, total, parts: adj.parts, pending: adj.pending, checkedAt, checkedDaysAgo: checkedAt ? ageDays(checkedAt, now) : null }
  },
  /** The company's newest numeric research score for a business, before any signal movement. */
  researchScore(companyId: string, b: string): number | undefined {
    const r = S.research.filter(x => x.companyId === companyId && x.businessId === b && typeof x.score === 'number').sort((x, y) => y.ts.localeCompare(x.ts))[0]
    return r ? (r.score as number) : undefined
  },
  /** A deal's priority score: the best lead score among its contacts, else the company's latest research score moved by saved signals. Null when neither exists. */
  dealScore(d: Deal): number | null {
    const scores = d.contactIds.filter(id => Q.contact(id)).map(id => Q.score(id, d.businessId).total)
    if (scores.length) return Math.max(...scores)
    const base = Q.researchScore(d.companyId, d.businessId)
    return base === undefined ? null : Q.scoreBreakdown(d.companyId, d.businessId, base).total
  },
  /** One pipeline per business. An empty one is returned while it loads so callers never dereference undefined. */
  pipeline: (b: string): Pipeline => S.pipelines.find(p => p.businessId === b) ?? emptyPipeline(b as BusinessId),

  isSuper: (): boolean => !!Q.me().super,
  role(b: string): RoleName {
    const u = Q.me()
    if (u.super) return 'super'
    return u.m[b as BusinessId] ?? null
  },
  roleOf(u: SalesUser, b: string): RoleName {
    return u.super ? 'super' : (u.m[b as BusinessId] ?? null)
  },
  myBiz(): BusinessId[] {
    const u = Q.me()
    if (u.super) return S.businesses.map(b => b.id)
    return (Object.keys(u.m) as BusinessId[]).filter(b => !!u.m[b])
  },
  scope(): BusinessId[] {
    return S.session.ws === 'all' ? Q.myBiz() : [S.session.ws]
  },
  inScope: (b: string | null | undefined): boolean => !!b && (Q.scope() as string[]).includes(b),
  member: (b: string | null | undefined): boolean => !!b && (Q.myBiz() as string[]).includes(b),
  canEdit: (b: string): boolean => EDIT_ROLES.includes(Q.role(b)),
  canManage: (b: string): boolean => MANAGE_ROLES.includes(Q.role(b)),
  canAdmin: (b: string): boolean => ADMIN_ROLES.includes(Q.role(b)),
  editScope: (): BusinessId[] => Q.scope().filter(b => Q.canEdit(b)),
  anyEdit: (): boolean => Q.editScope().length > 0,
  anyAdmin: (): boolean => Q.myBiz().some(b => Q.canAdmin(b)),
  anyManage: (): boolean => Q.myBiz().some(b => Q.canManage(b)),
  wsBiz: (): BusinessId | null => (S.session.ws === 'all' ? null : S.session.ws),
  defaultBiz(): BusinessId | undefined {
    const e = Q.editScope()
    const ws = Q.wsBiz()
    return ws && Q.canEdit(ws) ? ws : (e[0] ?? Q.scope()[0])
  },
  usersIn: (b: string): SalesUser[] => S.users.filter(u => u.active && (u.super || u.m[b as BusinessId])),
  sellersIn: (b: string): SalesUser[] =>
    S.users.filter(u => {
      const r = u.m[b as BusinessId]
      return u.active && !u.super && (r === 'admin' || r === 'manager' || r === 'sales')
    }),

  relsOf: (cid: string): CompanyRel[] => S.companyRels.filter(r => r.companyId === cid),
  rel: (cid: string, b: string): CompanyRel | undefined => S.companyRels.find(r => r.companyId === cid && r.businessId === b),
  crel: (ctid: string, b: string): ContactRel | undefined => S.contactRels.find(r => r.contactId === ctid && r.businessId === b),
  crelsOf: (ctid: string): ContactRel[] => S.contactRels.filter(r => r.contactId === ctid),
  companies(): Company[] {
    const sc = Q.scope()
    const ids = new Set(S.companyRels.filter(r => sc.includes(r.businessId)).map(r => r.companyId))
    return S.companies.filter(c => ids.has(c.id) && !c.archived)
  },
  contacts(): Contact[] {
    const sc = Q.scope()
    const ids = new Set(S.contactRels.filter(r => sc.includes(r.businessId)).map(r => r.contactId))
    return S.contacts.filter(c => ids.has(c.id) && !c.archived)
  },
  contactBiz(ct: Contact): BusinessId[] {
    const sc = Q.scope()
    return Q.crelsOf(ct.id).map(r => r.businessId).filter(b => sc.includes(b))
  },
  primaryBiz: (ct: Contact): BusinessId | undefined => Q.contactBiz(ct)[0] ?? Q.crelsOf(ct.id)[0]?.businessId,

  deals(): Deal[] {
    const sc = Q.scope()
    return S.deals.filter(d => sc.includes(d.businessId))
  },
  open: (d: Deal): boolean => d.status === 'open',
  stage: (d: Deal): Stage | undefined => Q.pipeline(d.businessId).stages.find(s => s.id === d.stageId),
  weighted: (d: Deal): number => (d.status === 'open' ? ((d.value || 0) * (d.probability || 0)) / 100 : 0),

  tasks(): Task[] {
    const sc = Q.scope()
    return S.tasks.filter(t => sc.includes(t.businessId))
  },
  done: (t: Task): boolean => t.status === 'Completed' || t.status === 'Cancelled',
  overdue: (t: Task): boolean => !Q.done(t) && t.status !== 'Snoozed' && t.due < F.nowIso(),
  isToday: (s: string | null | undefined): boolean => !!s && s.slice(0, 10) === F.today(),

  activities(): Activity[] {
    const sc = Q.scope()
    return S.activities.filter(a => sc.includes(a.businessId))
  },
  actFor(o: { companyId?: string | null; contactId?: string | null; dealId?: string | null }): Activity[] {
    return Q.activities()
      .filter(a => (o.companyId && a.companyId === o.companyId) || (o.contactId && a.contactId === o.contactId) || (o.dealId && a.dealId === o.dealId))
      .sort((a, b) => b.ts.localeCompare(a.ts))
  },
  actVisible(a: Activity): boolean {
    if (a.visibility !== 'private') return true
    const u = Q.me()
    return a.ownerId === u.id || a.actorId === u.id
  },
  threads(): Thread[] {
    const sc = Q.scope()
    return S.threads.filter(t => sc.includes(t.businessId))
  },
  threadBody(t: Thread): boolean {
    if (t.visibility !== 'private') return Q.member(t.businessId)
    const u = Q.me()
    return t.ownerId === u.id || (t.sharedWith || []).includes(u.id)
  },
  msgs: (tid: string): Message[] => S.messages.filter(m => m.threadId === tid).sort((a, b) => a.ts.localeCompare(b.ts)),
  myMailboxes(b?: string): Mailbox[] {
    const u = Q.me()
    return S.mailboxes.filter(m => (!b || m.businessIds.includes(b as BusinessId)) && (m.type === 'personal' ? m.ownerId === u.id : m.authorised.includes(u.id) || u.super))
  },
  /**
   * The suppression covering this contact in business `b` (contract 3.7): a live record in global or
   * business scope that names the contact id OR matches email / email2, ignoring case.
   */
  suppressed(ct: Pick<Contact, 'id' | 'email' | 'email2'>, b: string): Suppression | null {
    const addrs = new Set([ct.email, ct.email2].map(a => (a || '').trim().toLowerCase()).filter(Boolean))
    return S.suppressions.find(s => liveSuppression(s, b) && (s.contactId === ct.id || (!!s.email && addrs.has(s.email.trim().toLowerCase())))) ?? null
  },
  /**
   * Compose-time check for a raw address: a record naming the address, the thread's contact by id, or any known
   * contact whose email / email2 is this address (so a suppression recorded against a contact's other address
   * still blocks).
   */
  suppressedAddr(addr: string, b: string, contactId?: string | null): Suppression | null {
    const a = (addr || '').trim().toLowerCase()
    const direct = S.suppressions.find(s => liveSuppression(s, b) && ((!!a && !!s.email && s.email.trim().toLowerCase() === a) || (!!contactId && s.contactId === contactId)))
    if (direct) return direct
    if (!a) return null
    for (const c of S.contacts) {
      if ([c.email, c.email2].some(x => (x || '').trim().toLowerCase() === a)) {
        const sp = Q.suppressed(c, b)
        if (sp) return sp
      }
    }
    return null
  },
  activeEnrol: (ctid: string): Enrolment[] => S.enrolments.filter(e => e.contactId === ctid && LIVE_ENROL.includes(e.status)),

  tokens(ct: Contact | undefined, sender: SalesUser | undefined, b: string): TokenMap {
    const co = ct ? Q.company(ct.companyId) : undefined
    return {
      first_name: ct?.firstName,
      last_name: ct?.lastName,
      company_name: str(co?.tradingName) || co?.name,
      job_title: ct?.title,
      sender_first_name: sender?.name.split(' ')[0],
      sender_name: sender?.name,
      business_name: Q.biz(b)?.name,
      meeting_link: sender?.meetingLink,
    }
  },
  render(txt: string | null | undefined, map: TokenMap): { text: string; missing: string[] } {
    const missing: string[] = []
    const out = String(txt || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => {
      const v = map[k]
      if (v == null || v === '') {
        missing.push(k)
        return m
      }
      return v
    })
    return { text: out, missing: [...new Set(missing)] }
  },
  senderOf(mb: Mailbox | undefined): SalesUser | undefined {
    if (!mb) return Q.me()
    return mb.type === 'personal' ? Q.user(mb.ownerId) : Q.me()
  },

  /**
   * Display only. Older builds stamped contacts Verified from a simulated lookup. Those have no `verifiedAt`
   * and an 'enriched' activity from the simulation, so the UI asks a person to confirm them.
   */
  mockVerified(ct: Contact): boolean {
    return ct.verification === 'Verified' && !ct.verifiedAt
      && S.activities.some(a => a.contactId === ct.id && a.type === 'enriched' && (a.subject ?? '').includes('Wiza (simulated)'))
  },

  eligibility(ctid: string, seqId: string, mbId?: string): Eligibility {
    const ct = Q.contact(ctid)
    const seq = Q.seq(seqId)
    const blocks: string[] = []
    const warns: string[] = []
    if (!ct || !seq) return { blocks: ['Record not found'], warns }
    const b = seq.businessId
    const bn = Q.biz(b)?.name ?? b
    const sp = Q.suppressed(ct, b)
    if (sp) blocks.push(`${sp.scope === 'global' ? 'Globally suppressed' : `Suppressed for ${bn}`} — ${sp.reason.toLowerCase()} (${F.date(sp.date)})`)
    if (!ct.email) blocks.push('No email address on record')
    else if (ct.deliverability === 'Bounced' || ct.verification === 'Invalid') blocks.push('Email address is invalid or has bounced')
    if (S.enrolments.some(e => e.contactId === ctid && e.seqId === seqId && LIVE_ENROL.includes(e.status))) blocks.push('Already enrolled in this sequence')
    if (seq.status !== 'active') blocks.push(`Sequence is ${seq.status} — activate it before enrolling`)
    const mb = Q.mailbox(mbId || seq.mailboxId)
    if (!mb) blocks.push('No sender mailbox configured')
    else if (mb.status !== 'connected') blocks.push(`Sender mailbox ${mb.address} is disconnected`)
    if (!ct.permission) blocks.push('No outreach permission basis recorded')
    if (!Q.crel(ctid, b)) warns.push(`No ${bn} relationship yet — one will be created`)
    if (ct.verification === 'Inferred' && ct.email) blocks.push('Email is a guess (not found online), not verified — mark it verified first')
    else if (ct.verification !== 'Verified' && ct.email) warns.push('Email not verified')
    for (const e of Q.activeEnrol(ctid).filter(x => x.seqId !== seqId)) {
      const s2 = Q.seq(e.seqId)
      if (e.businessId === b) warns.push(`Also active in “${s2?.name ?? 'another sequence'}”`)
      else warns.push(`Portfolio conflict: active ${Q.biz(e.businessId)?.name ?? e.businessId} outreach (owner ${Q.user(e.ownerId)?.name ?? 'unknown'})`)
    }
    const first = seq.steps.find(s => s.type === 'email')
    if (first) {
      const r = Q.render(`${first.subject ?? ''} ${first.body ?? ''}`, Q.tokens(ct, Q.senderOf(mb), b))
      if (r.missing.length) warns.push(`Missing data for {{${r.missing.join('}}, {{')}}} — step will be held`)
    }
    const rel = Q.crel(ctid, b)
    if (rel?.lastActivity && F.days(rel.lastActivity, F.nowIso()) < 3) warns.push(`Contacted ${F.rel(rel.lastActivity)}`)
    return { blocks, warns }
  },

  score(ctid: string, b: string): ScoreResult {
    const ct = Q.contact(ctid)
    const co = ct ? Q.company(ct.companyId) : undefined
    const bz = Q.biz(b)
    if (!ct || !bz || !co) return { total: 0, parts: [], label: 'Insufficient Data', pos: [], missing: [] }
    const pos: string[] = []
    const missing: string[] = []
    const emp = num(co.employees)
    const loc = num(co.locations)
    let fit = 0
    if (bz.industries.includes(co.industry)) {
      fit += 14
      pos.push(`${co.industry} is a core ${bz.name} industry`)
    }
    if (b === 'ard') {
      if (emp >= 500) fit += 9
      else if (emp >= 200) fit += 6
      if (loc >= 10) {
        fit += 7
        pos.push(`${loc} locations — multi-site operational complexity`)
      }
    }
    if (b === 'ros') {
      if (emp >= 150) fit += 8
      else if (emp >= 80) fit += 5
      if (loc >= 5) {
        fit += 8
        pos.push(`${loc} sites with shift-based staff`)
      }
    }
    if (b === 'pth') {
      if (/School|University|Network|Career/.test(co.type)) {
        fit += 10
        pos.push(co.type)
      }
      if (num(co.eligibleStudents) >= 250) fit += 6
    }
    if (b === 'adv') {
      if (emp >= 300) {
        fit += 10
        pos.push(`${F.num(emp)} employees`)
      } else if (emp >= 120) fit += 6
      if (loc >= 5) fit += 4
    }
    fit = Math.min(30, fit)

    let dm = 0
    if (bz.roles.some(r => ct.title.includes(r))) dm += 12
    const SEN: Record<string, number> = { 'C-Level': 8, Director: 6, Head: 6, Manager: 4 }
    dm += SEN[ct.seniority] || 1
    dm = Math.min(20, dm)
    if (dm >= 16) pos.push(`${ct.title} — likely decision-maker`)

    const clock = F.nowIso()
    const acts = S.activities.filter(a => a.contactId === ctid && a.businessId === b && F.days(a.ts, clock) <= 30)
    let eng = 0
    for (const a of acts) {
      const w: Record<string, number> = {
        email_in: 6, call: a.outcome === 'Connected' || a.outcome === 'Interested' ? 4 : 1, meeting: 6,
        meeting_booked: 5, link_click: 2, linkedin_reply: 4, email_out: 1,
      }
      eng += w[a.type] || 0
    }
    eng = Math.min(20, eng)
    if (eng >= 8) pos.push(`${acts.length} interactions in the last 30 days`)

    let sig = 0
    const dl = S.deals.find(d => d.businessId === b && d.contactIds.includes(ctid) && d.status === 'open')
    if (dl) {
      sig += 10
      pos.push(`Stakeholder on open deal “${dl.title}”`)
    }
    const POSITIVE = ['Interested', 'Meeting Requested', 'More Information Requested']
    const pr = S.threads.find(t => t.contactId === ctid && t.businessId === b && t.classification && POSITIVE.includes(t.classification.cat))
    if (pr?.classification) {
      sig += 6
      pos.push(`Positive reply: ${pr.classification.cat.toLowerCase()}`)
    }
    if (acts.some(a => a.type === 'meeting_booked')) sig += 4
    if (S.research.some(r => r.companyId === co.id && r.businessId === b)) sig += 2
    sig = Math.min(20, sig)

    let comp = 0
    if (ct.email) comp += 3
    else missing.push('Work email')
    if (ct.phone || ct.mobile) comp += 2
    else missing.push('Phone number')
    if (ct.linkedin) comp += 2
    else missing.push('LinkedIn URL')
    if (ct.verification === 'Verified') comp += 2
    else missing.push('Email verification')
    if (ct.title) comp += 1

    const bd = Q.scoreBreakdown(co.id, b, fit + dm + eng + sig + comp)
    const total = bd.total
    const adj: SignalAdjust = { delta: bd.adjust, parts: bd.parts, pending: bd.pending }
    const label = comp < 5 && total < 40 ? 'Insufficient Data' : total >= 75 ? 'High Priority' : total >= 55 ? 'Qualified' : total >= 35 ? 'Developing' : 'Low Priority'
    const next =
      missing.length > 1 ? `Enrich contact to fill ${missing.slice(0, 2).join(' and ').toLowerCase()}`
      : pr && !dl ? 'Respond to reply and qualify an opportunity'
      : eng < 5 ? 'Start outreach — no recent engagement'
      : dl ? `Advance “${dl.title}”`
      : 'Book a discovery conversation'
    return {
      total, label, pos, missing, next, ...(adj.parts.length || adj.pending.length ? { adjust: adj, breakdown: bd, ...(bd.checkedAt ? { signalsCheckedAt: bd.checkedAt } : {}) } : {}),
      parts: [['Company fit', fit, 30], ['Decision-maker relevance', dm, 20], ['Engagement activity', eng, 20], ['Buying signals', sig, 20], ['Data completeness', comp, 10]],
    }
  },
  scoreTone(l: string): string {
    const T: Record<string, string> = { 'High Priority': 'ok', Qualified: 'info', Developing: 'warn', 'Low Priority': '', 'Insufficient Data': '' }
    return T[l] ?? ''
  },

  risk(d: Deal): RiskResult | null {
    if (d.status !== 'open') return null
    const r: string[] = []
    const clock = F.nowIso()
    const idle = F.days(d.lastActivity, clock)
    if (idle >= 14) r.push(`No activity for ${idle} days`)
    else if (idle >= 10) r.push(`Quiet for ${idle} days`)
    if (d.close < clock.slice(0, 10)) r.push('Expected close date has passed')
    const open = S.tasks.filter(t => t.dealId === d.id && !Q.done(t))
    if (!open.length) r.push('No next step scheduled')
    const late = open.some(t => Q.overdue(t))
    if (late) r.push('Follow-up overdue')
    const si = Q.pipeline(d.businessId).stages.findIndex(s => s.id === d.stageId)
    if (si >= 3 && d.contactIds.length < 2) r.push('Single-threaded — one stakeholder')
    return r.length ? { level: idle >= 14 || r.length >= 3 || (late && idle >= 7) ? 'high' : 'med', reasons: r } : null
  },
  nextTask: (d: Deal): Task | undefined => S.tasks.filter(t => t.dealId === d.id && !Q.done(t)).sort((a, b) => a.due.localeCompare(b.due))[0],

  missingFor(d: Deal, stage: Stage, patch?: Partial<Deal>): MissingField[] {
    const v: Deal = { ...d, ...patch, fields: { ...d.fields, ...patch?.fields } }
    const L: Record<string, string> = { value: 'Deal value', description: 'Scope summary / description', primaryContact: 'Key stakeholder', close: 'Expected close date' }
    const pl = Q.pipeline(d.businessId)
    return (stage.required || [])
      .filter(k => {
        if (k.startsWith('f.')) {
          const key = k.slice(2)
          const x = v.fields[key]
          return x == null || x === '' || (x === false && pl.fields.find(f => f.key === key)?.type !== 'boolean')
        }
        const x = v[k]
        return x == null || x === '' || x === 0
      })
      .map(k => {
        const f = k.startsWith('f.') ? (pl.fields.find(x => x.key === k.slice(2)) ?? null) : null
        return { key: k, label: k.startsWith('f.') ? (f?.label ?? k) : (L[k] ?? k), field: f }
      })
  },
  rosMrr(f: { override?: unknown; overrideMrr?: unknown; employees?: unknown; rate?: unknown }): number {
    if (f.override && f.overrideMrr) return +String(f.overrideMrr)
    return Math.round((+String(f.employees || 0) || 0) * (+String(f.rate || 0) || 0) * 100) / 100
  },

  metric(userIds: string[], metric: string, from: string, to: string, b?: string): number {
    return S.activities.filter(a => {
      if (!userIds.includes(a.actorId) || a.ts < from || a.ts > to || (b && a.businessId !== b) || a.dup) return false
      if (metric === 'calls') return a.type === 'call' && a.outcome !== 'Cancelled'
      if (metric === 'emails') return a.type === 'email_out'
      if (metric === 'meetings') return a.type === 'meeting_booked'
      if (metric === 'meetings_held') return a.type === 'meeting'
      return false
    }).length
  },
  goalRange(g: Goal): [string, string] {
    const clock = F.nowIso()
    if (g.period === 'day') {
      const t = clock.slice(0, 10)
      return [`${t}T00:00`, `${t}T23:59`]
    }
    if (g.period === 'month') {
      const t = clock.slice(0, 8)
      return [`${t}01T00:00`, `${t}31T23:59`]
    }
    const ws = F.weekStart()
    return [ws, F.addDays(ws, 7)]
  },
  goalActual(g: Goal): number {
    const [f, t] = Q.goalRange(g)
    const ids = g.ownerType === 'team' ? (Q.team(g.ownerId)?.members ?? []) : [g.ownerId]
    const clock = F.nowIso()
    return Q.metric(ids, g.metric, f, t > clock ? clock : t, g.businessId)
  },
  notifs(): Notification[] {
    const u = Q.me()
    return S.notifications.filter(n => n.userId === u.id).sort((a, b) => b.ts.localeCompare(a.ts))
  },
}
