import { F } from '../data/F'
import { uid } from '../data/ids'
import { Q } from '../data/Q'
import { S } from '../data/store'
import type {
  Activity, BusinessId, Company, Contact, Deal, Meeting, Research, Thread, ThreadClassification,
} from '../data/types'
import { familyOf, playbook, type Family } from './library'
import { companyInsights, cross, dealInsights } from './rules'

/**
 * Deterministic, offline helpers. They are the fallback for the server AI endpoints
 * (stub, 502, network error). Contact enrichment has no local
 * implementation: it either comes from the server or says it is unavailable.
 */

const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const RX = {
  dlv: /delivery (status|has failed|failed)|undeliverable|address not found|mailbox (not found|unavailable)|could not be delivered/i,
  uns: /unsubscribe|remove me|do not contact|don'?t contact|stop (emailing|contacting)|opt(-| )?out|take me off/i,
  ooo: /out of (the )?office|on (annual |parental |personal )?leave|returning on|back in the office|away until/i,
  wrong: /not the right person|wrong person|no longer (work|with)|not responsible for/i,
  ref: /speak (to|with) (our|my)|reach out to|cc'?'?d|looping in|better person|contact (my|our) colleague/i,
  no: /not interested|no thanks|not a fit|happy with our current|no need for/i,
  time: /not right now|next year|next quarter|later in the year|revisit|not a priority|bad time|after (the )?(holidays|new year)/i,
  meet: /demo|meeting|catch up|book a time|schedule|a call|available (on|next)|next week/i,
  price: /pric|cost|expensive|budget|cheaper/i,
  info: /more information|send (some|more)? ?info|brochure|details|case stud|how (the|it|this) .*works/i,
  int: /interested|relevant|sounds good|keen|love to|looks great|interesting/i,
}

export interface ClassMeta { next: string; task: string; days: number; deal: boolean; reason: string }
export const META: Record<string, ClassMeta> = {
  'Interested': { next: 'Respond and propose next step', task: 'Reply to {name} and propose a discovery call', days: 0, deal: true, reason: 'Expresses relevance or interest in the offer.' },
  'Meeting Requested': { next: 'Confirm meeting times', task: 'Book meeting with {name} — send times', days: 0, deal: true, reason: 'Explicitly asks for a meeting or demo.' },
  'More Information Requested': { next: 'Send requested information', task: 'Send information pack to {name}', days: 1, deal: false, reason: 'Asks for further information before deciding.' },
  'Pricing Objection': { next: 'Address pricing with a value-based response', task: 'Respond to {name} on pricing — share indicative structure', days: 1, deal: false, reason: 'Raises cost or budget as a concern.' },
  'Timing Objection': { next: 'Schedule re-engagement', task: 'Re-engage {name} at agreed time', days: 60, deal: false, reason: 'Indicates timing is not right at present.' },
  'Referral': { next: 'Contact the referred colleague', task: 'Reach out to colleague referred by {name}', days: 1, deal: false, reason: 'Points to a different person as the right contact.' },
  'Not Interested': { next: 'Close out politely; no further outreach', task: 'Close the loop with {name}', days: 2, deal: false, reason: 'States they are not interested.' },
  'Unsubscribe': { next: 'Honour opt-out — no further outreach', task: 'Confirm suppression for {name}', days: 0, deal: false, reason: 'Requests removal from communications.' },
  'Out of Office': { next: 'Pause and follow up after return', task: 'Follow up with {name} after leave', days: 7, deal: false, reason: 'Automatic out-of-office response.' },
  'Wrong Contact': { next: 'Ask for the correct contact; update record', task: "Find the right contact at {name}'s company", days: 1, deal: false, reason: 'Says they are not the right person.' },
  'Neutral / Unclear': { next: 'Review manually and reply', task: 'Review reply from {name}', days: 1, deal: false, reason: 'No clear intent detected.' },
  'Delivery Failure': { next: 'Verify address or find alternative contact', task: 'Find a valid email for {name}', days: 1, deal: false, reason: 'Mail server reported a delivery failure.' },
}

export interface Classification {
  cat: string
  secondary: string | null
  conf: number
  reason: string
  nextAction: string
  taskTitle: string
  followUpDays: number
  deal: boolean
  returnDate: string | null
}

export function classify(text: string | null | undefined): Classification {
  const t = text || ''
  const m = (k: keyof typeof RX): boolean => RX[k].test(t)
  let cat: string
  let sec: string | null = null
  let conf = 0.72
  if (m('dlv')) { cat = 'Delivery Failure'; conf = 0.98 }
  else if (m('uns')) { cat = 'Unsubscribe'; conf = 0.97 }
  else if (m('ooo')) { cat = 'Out of Office'; conf = 0.95 }
  else if (m('wrong') && !m('meet')) { cat = m('ref') ? 'Referral' : 'Wrong Contact'; sec = m('ref') ? 'Wrong Contact' : null; conf = 0.88 }
  else if (m('ref')) { cat = 'Referral'; conf = 0.84 }
  else if (m('no')) { cat = 'Not Interested'; conf = 0.9 }
  else if (m('time')) { cat = 'Timing Objection'; conf = 0.83 }
  else if (m('meet') && (m('int') || m('info'))) { cat = 'Meeting Requested'; sec = 'Interested'; conf = 0.93 }
  else if (m('price')) { cat = 'Pricing Objection'; sec = m('int') ? 'Interested' : null; conf = 0.82 }
  else if (m('meet')) { cat = 'Meeting Requested'; conf = 0.86 }
  else if (m('info')) { cat = 'More Information Requested'; sec = m('int') ? 'Interested' : null; conf = 0.85 }
  else if (m('int')) { cat = 'Interested'; conf = 0.8 }
  else { cat = 'Neutral / Unclear'; conf = 0.55 }

  let ret: string | null = null
  const r = t.match(/(?:return(?:ing)?|back)\s+(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})/i)
  if (r) {
    const mon = MON[r[2].toLowerCase()]
    if (mon != null) ret = `${F.nowIso().slice(0, 4)}-${String(mon + 1).padStart(2, '0')}-${String(r[1]).padStart(2, '0')}`
  }
  const M = META[cat]
  return {
    cat, secondary: sec, conf, reason: M.reason + (sec ? ` Also signals ${sec.toLowerCase()}.` : ''),
    nextAction: M.next, taskTitle: M.task,
    followUpDays: ret ? Math.max(1, F.days(F.nowIso(), `${ret}T09:00`) + 1) : M.days,
    deal: M.deal, returnDate: ret,
  }
}

export function toThreadClassification(c: Classification): ThreadClassification {
  return { cat: c.cat, secondary: c.secondary, conf: c.conf, reason: c.reason }
}

export interface Draft { subject: string; body: string }

export function suggestReply(t: Thread): Draft {
  const ct = Q.contact(t.contactId)
  const b = t.businessId
  const me = Q.user(t.ownerId) ?? Q.me()
  const fn = ct?.firstName || 'there'
  const bz = Q.biz(b)?.name ?? ''
  const c = t.classification?.cat ?? ''
  const now = F.nowIso()
  const skip = F.d(now).getDay() >= 4 ? 2 : 0
  const times = [1, 2, 3].map(i => {
    const d = F.d(F.addDays(now, i + skip))
    return `${F.W[d.getDay()]} ${d.getDate()} ${F.M[d.getMonth()]}`
  }).join(', ')
  const B: Record<string, string> = {
    'Meeting Requested': `Thanks ${fn} — glad this is timely. I can do ${times} at 10:00 am or 2:00 pm, or pick a time that suits here: ${me.meetingLink}\n\nAhead of the session I will send a short overview of how ${bz} approaches this so the time is well spent.`,
    'Interested': `Thanks ${fn}, appreciate you coming back to me. Would a 20–30 minute call next week work to understand your current setup? I can do ${times}.`,
    'More Information Requested': `Thanks ${fn}. I have attached a short overview of how ${bz} works and what a typical rollout looks like. Happy to walk through it on a quick call if useful.`,
    'Pricing Objection': `Thanks ${fn} — a fair question. Pricing depends on scope and team size, so rather than quote a generic number I would like to understand your setup and give you an indicative range. Would 15 minutes this week work?`,
    'Timing Objection': `Understood, ${fn}. I will check back in closer to the time — let me know if anything changes sooner.`,
    'Referral': `Thanks ${fn}, I appreciate the pointer. I will reach out to your colleague directly and keep it brief.`,
    'Not Interested': `Thanks for letting me know, ${fn}. I will close this off on my side.`,
    'Wrong Contact': `Thanks ${fn} — apologies for the misdirect. Could you point me to the right person?`,
  }
  const body = B[c] ?? `Thanks ${fn} — appreciate the reply. `
  return { subject: `Re: ${t.subject.replace(/^Re: /, '')}`, body: `Hi ${fn},\n\n${body}\n\nKind regards,\n${me.name}` }
}

export type FactRow = [string, string | number]
export interface ResearchInput { name?: string; industry?: string; website?: string }
export interface ResearchError { error: string }

export function research(cid: string | null | undefined, b: BusinessId, input: ResearchInput = {}): Research | ResearchError {
  const co = cid ? Q.company(cid) : undefined
  const bz = Q.biz(b)
  if (S.demo.researchFail) return { error: 'Research provider unavailable (simulated). Try again or continue with CRM data only.' }
  const name = co ? co.name : (input.name ?? '')
  const ind = co ? co.industry : (input.industry || 'Unknown')
  const fam: Family = familyOf(ind)
  const X = playbook(b, fam)
  const emp = co?.employees ?? null
  const loc = co?.locations ?? null
  let score = 40
  if (bz?.industries.includes(ind)) score += 25
  if (emp != null && emp >= 200) score += 12
  if (loc != null && loc >= 5) score += 10
  if (b === 'pth' && /School|University|Network/.test(co?.type ?? '')) score += 15
  score = Math.min(96, score)
  if (!co) score = Math.min(score, 55)
  const facts: FactRow[] = co
    ? [
        ['Industry (CRM)', ind + (co.subindustry ? ` — ${co.subindustry}` : '')],
        ['Headquarters (CRM)', `${co.hq}, ${co.state}`],
        ['Employees (CRM estimate)', emp ? F.num(emp) : 'Unknown'],
        ['Locations (CRM)', loc || 'Unknown'],
        ['Known technology (CRM)', (co.tech || []).join(', ') || '—'],
      ]
    : [['Name provided', name], ['Website provided', input.website || '—']]
  const rels = co ? Q.relsOf(co.id).filter(r => r.businessId !== b).map(r => Q.biz(r.businessId)?.name ?? r.businessId) : []
  const model: Record<Family, string> = {
    retail: 'Multi-site retail with central head office and store teams',
    hosp: 'Multi-venue hospitality with shift-based casual workforce',
    edu: 'Education provider with careers / pathways function',
    cons: 'Project-based delivery across active worksites',
    mfg: 'Production facilities with shift operations',
    dist: 'Warehousing and distribution network',
    svc: 'Service delivery across offices or sites',
  }
  const sources: Array<{ label: string; kind: string }> = []
  if (co) {
    sources.push({ label: 'CRM company record', kind: 'CRM data' })
    sources.push({ label: `${S.contacts.filter(c => c.companyId === co.id).length} linked contacts`, kind: 'CRM data' })
  }
  sources.push({ label: `${bz?.name ?? b} product knowledge`, kind: 'Configured knowledge' })
  sources.push({ label: `Sector research fixture (${ind})`, kind: 'Simulated — not live web' })
  return {
    id: uid('rs'), companyId: co?.id ?? '', businessId: b, ts: F.nowIso(), by: S.session.userId, simulated: true, limited: !co,
    companyName: name,
    overview: co
      ? `${name} is ${/^[AEIOU]/.test(ind) ? 'an' : 'a'} ${ind.toLowerCase()} organisation headquartered in ${co.hq}. ${co.description}`
      : `No CRM record matched “${name}”. Results below are generic for the ${ind} sector and should be verified.`,
    size: emp ? `${F.num(emp)} employees (est.)${loc ? ` · ${loc} locations` : ''}` : 'Unknown',
    industry: ind, model: model[fam], challenges: X.ch, offerings: X.off, stakeholders: X.st, score,
    angle: X.angle || `Lead with ${X.ch[0].toLowerCase()} and propose a short discovery conversation.`,
    facts,
    inferred: ['Pain points are inferred from sector patterns, not confirmed by the customer', 'Stakeholder roles are typical buying roles, not verified individuals'],
    sources, cross: rels,
  }
}

export interface MeetingActionItem { title: string; type: string; days: number; on: boolean; assigneeId: string }
export interface MeetingUpdate { label: string; key: string; value: number; from: unknown }
export interface MeetingActionsResult {
  actions: MeetingActionItem[]
  missing: string[]
  updates: MeetingUpdate[]
  email: Draft
}

export function meetingActions(m: Meeting): MeetingActionsResult {
  const txt = Object.values(m.sections || {}).concat([m.summary || '', m.nextSteps || '']).join('\n')
  const lines = txt.split(/\n|\.\s|;/).map(s => s.trim()).filter(Boolean)
  const acts: MeetingActionItem[] = []
  const seen = new Set<string>()
  const add = (t: string, ty: string, dd: number): void => {
    const k = t.toLowerCase().slice(0, 40)
    if (seen.has(k)) return
    seen.add(k)
    acts.push({ title: t, type: ty, days: dd, on: true, assigneeId: m.ownerId || Q.me().id })
  }
  const clean = (l: string): string => l.replace(/^[-•\s]*/, '').replace(/^./, x => x.toUpperCase())
  for (const l of lines) {
    if (/\b(send|share|email)\b/i.test(l)) add(clean(l), 'Email', 1)
    else if (/\b(book|schedule|organise|arrange|run)\b/i.test(l)) add(clean(l), 'Meeting Preparation', 3)
    else if (/\b(confirm|clarify|check|follow up|chase)\b/i.test(l)) add(clean(l), 'Follow-up', 2)
    else if (/\bproposal|quote|pricing\b/i.test(l)) add(`Prepare proposal: ${l.slice(0, 70)}`, 'Proposal', 5)
  }
  const first = m.participants?.[0]
  const ct = first ? Q.contact(first) : undefined
  if (!acts.length) add(`Send meeting recap to ${ct?.firstName || 'attendees'}`, 'Email', 1)
  const s = m.sections || {}
  const missing: string[] = []
  if (!s.decision) missing.push('Decision-makers and approval process')
  if (!s.budget) missing.push('Budget / commercial expectations')
  if (!s.timeline) missing.push('Timeline and key dates')
  if (!s.requirements) missing.push('Requirements')
  const upd: MeetingUpdate[] = []
  const d = m.dealId ? Q.deal(m.dealId) : undefined
  const money = txt.match(/A\$\s?([\d,.]+)\s?(k|m)?/i)
  if (money && d) {
    let v = parseFloat(money[1].replace(/,/g, ''))
    if (/k/i.test(money[2] || '')) v *= 1e3
    if (/m/i.test(money[2] || '')) v *= 1e6
    if (d.businessId !== 'ros' && Math.round(v) !== d.value) upd.push({ label: 'Deal value', key: 'value', value: Math.round(v), from: d.value })
  }
  const stud = txt.match(/(\d{2,5})\s+students/i)
  if (stud && d?.businessId === 'pth') upd.push({ label: 'Eligible students', key: 'f.eligible', value: +stud[1], from: d.fields.eligible })
  const emp = txt.match(/(\d{2,5})\s+(employees|staff)/i)
  if (emp && d && (d.businessId === 'ros' || d.businessId === 'adv')) upd.push({ label: 'Employees', key: 'f.employees', value: +emp[1], from: d.fields.employees })
  const me = Q.user(m.ownerId) ?? Q.me()
  const email: Draft = {
    subject: `Recap: ${m.title}`,
    body: `Hi ${ct?.firstName || 'all'},\n\nThank you for your time today. A short recap:\n\n${m.summary ? m.summary + '\n\n' : ''}Agreed next steps:\n${acts.map(a => '• ' + a.title).join('\n')}\n\nPlease let me know if I have missed anything.\n\nKind regards,\n${me.name}`,
  }
  return { actions: acts.slice(0, 6), missing, updates: upd, email }
}

export interface MeetingBrief {
  people: Array<{ id: string; name: string; title: string; role: string; last: Activity | undefined }>
  deal: Deal | undefined
  recent: Activity[]
  lastMeeting: Meeting | undefined
  questions: string[]
  agenda: string[]
  risks: string[]
}

export function meetingBrief(m: Meeting): MeetingBrief {
  const d = m.dealId ? Q.deal(m.dealId) : undefined
  const ps = (m.participants || []).map(Q.contact).filter((c): c is Contact => !!c)
  const recent = S.activities
    .filter(a => a.companyId === m.companyId && a.businessId === m.businessId && Q.actVisible(a))
    .sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 5)
  const ins = d ? dealInsights(d) : null
  const lastMeeting = S.meetings.filter(x => x.companyId === m.companyId && x.status === 'completed').sort((a, b) => b.start.localeCompare(a.start))[0]
  return {
    people: ps.map(p => ({
      id: p.id, name: p.name, title: p.title, role: p.buyingRole,
      last: S.activities.filter(a => a.contactId === p.id).sort((a, b) => b.ts.localeCompare(a.ts))[0],
    })),
    deal: d, recent, lastMeeting,
    questions: ins ? ins.recs.slice(0, 3).concat(ins.missing.slice(0, 2).map(x => `Confirm: ${x.toLowerCase()}`)) : ['Understand current process', 'Confirm decision-makers'],
    agenda: [
      `Recap of previous discussion${lastMeeting ? ` (${F.date(lastMeeting.start)})` : ''}`,
      'Confirm priorities and success criteria',
      ins && ins.gaps[0] ? `Address: ${ins.gaps[0].toLowerCase()}` : 'Map stakeholders and approval path',
      'Agree next steps and dates',
    ],
    risks: ins?.risk?.reasons ?? [],
  }
}

export interface DraftContext { deal?: Deal }
export function draft(ct: Contact, b: BusinessId, purpose: string, ctx?: DraftContext): Draft {
  const me = Q.me()
  const co = Q.company(ct.companyId)
  const bz = Q.biz(b)
  const fn = ct.firstName
  const P: Record<BusinessId, string> = {
    ard: 'how operations and technology teams bring site and head-office workflows into one tailored platform, integrated with the systems already in place',
    ros: 'how multi-site operators reduce the time spent building and adjusting rosters, and keep timesheets accurate for payroll',
    pth: 'how students explore careers through short, practical simulations before making subject and pathway decisions',
    adv: 'how organisations give employees confidential access to wellbeing support, with aggregated insight for HR',
  }
  const p = P[b]
  if (purpose === 'stale' && ctx?.deal) {
    return {
      subject: `Checking in on ${ctx.deal.title}`,
      body: `Hi ${fn},\n\nI wanted to check in on where things are at with ${ctx.deal.title.toLowerCase()}. Last time we spoke, the next step was ${(ctx.deal.next || 'to reconnect on scope').toLowerCase()}.\n\nIs there anything I can prepare that would help move the conversation forward internally?\n\nKind regards,\n${me.name}`,
    }
  }
  if (purpose === 'intro') {
    return {
      subject: `${co?.name ?? ''} — ${bz?.name ?? ''}`,
      body: `Hi ${fn},\n\nI work with ${(bz?.industries[0] || '').toLowerCase()} teams on ${p}.\n\nGiven your role as ${ct.title} at ${co?.name ?? 'your organisation'}, I thought a short conversation might be useful. Would 20 minutes next week suit?\n\nKind regards,\n${me.name}\n${bz?.name ?? ''}`,
    }
  }
  return {
    subject: `Following up — ${co?.name ?? ''}`,
    body: `Hi ${fn},\n\nThanks again for your time recently. Following on from our conversation, I wanted to share a little more on ${p}.\n\nWould it be helpful to set up a short follow-up to go through next steps?\n\nKind regards,\n${me.name}`,
  }
}

export interface CopilotItem {
  kind: string
  id?: string | null
  line: string
  meta?: string
  tone?: string
  act?: string
}
export interface CopilotDraft extends Draft { contactId: string; businessId: BusinessId; dealId?: string }
export interface CopilotContext { contactId?: string; dealId?: string }
export interface CopilotResult {
  text: string
  items: CopilotItem[]
  scope: BusinessId[]
  draft?: CopilotDraft
}

const POSITIVE = ['Interested', 'Meeting Requested']
const bizName = (b: string): string => Q.biz(b)?.name ?? b

export function copilot(q: string, ctx?: CopilotContext): CopilotResult {
  const ql = q.toLowerCase()
  let sc = Q.scope()
  const nm = S.businesses.filter(b => ql.includes(b.name.toLowerCase())).map(b => b.id)
  const denied = nm.filter(b => !Q.member(b))
  const scoped = nm.filter(b => Q.member(b))
  if (scoped.length) sc = scoped
  const R = (text: string, items: CopilotItem[] = [], extra: Partial<CopilotResult> = {}): CopilotResult => ({ text, items, scope: sc, ...extra })
  if (denied.length && !scoped.length) return R(`You don't have access to ${denied.map(bizName).join(', ')}. I can only answer using records from businesses you are a member of.`)
  const deals = S.deals.filter(d => sc.includes(d.businessId))
  const me = Q.me()
  const clock = F.nowIso()
  const nameOf = (id: string | null | undefined): string => Q.user(id)?.name ?? ''
  const stageName = (d: Deal): string => Q.stage(d)?.name ?? ''

  if (/(draft|write|compose).*(email|follow|reply|note)/.test(ql)) {
    let ct: Contact | undefined = ctx?.contactId ? Q.contact(ctx.contactId) : undefined
    if (!ct) ct = S.contacts.find(c => ql.includes(`${c.firstName.toLowerCase()} ${c.lastName.toLowerCase()}`) || (ql.includes(c.lastName.toLowerCase()) && c.lastName.length > 4))
    if (!ct && ctx?.dealId) ct = Q.contact(Q.deal(ctx.dealId)?.primaryContact)
    if (!ct) return R('Which contact should the email be for? Open a contact or deal and ask again, or include their name — for example “Draft a follow-up email for Sam Ricci”.')
    const b = Q.primaryBiz(ct)
    if (!b || (!sc.includes(b) && !Q.member(b))) return R('That contact is outside your accessible businesses.')
    const cid = ct.id
    const d = S.deals.find(x => x.contactIds.includes(cid) && x.status === 'open' && x.businessId === b)
    const dr = draft(ct, b, d && F.days(d.lastActivity, clock) > 7 ? 'stale' : 'follow', { deal: d })
    return R(
      `Here is a draft for ${ct.name} (${ct.title}, ${Q.company(ct.companyId)?.name ?? ''}), written in ${bizName(b)} positioning. Nothing is sent until you review it in the composer.`,
      [], { draft: { ...dr, contactId: ct.id, businessId: b, dealId: d?.id } },
    )
  }

  if (/call/.test(ql) && /(today|should|who|prospect)/.test(ql)) {
    const t = S.tasks
      .filter(x => sc.includes(x.businessId) && x.type === 'Call' && !Q.done(x) && x.due.slice(0, 10) <= clock.slice(0, 10) && (x.assigneeId === me.id || Q.isSuper() || Q.canManage(x.businessId)))
      .sort((a, b) => a.due.localeCompare(b.due))
    const hot = S.threads
      .filter(x => sc.includes(x.businessId) && x.needsReply && POSITIVE.includes(x.classification?.cat ?? ''))
      .map(x => Q.contact(x.contactId)).filter((c): c is Contact => !!c)
    const items: CopilotItem[] = hot.map((c): CopilotItem => ({ kind: 'contact', id: c.id, line: `${c.name} · ${Q.company(c.companyId)?.name ?? ''}`, meta: 'Replied positively — call while warm', tone: 'ok' }))
      .concat(t.slice(0, 8).map((x): CopilotItem => ({
        kind: 'contact', id: x.contactId, line: `${Q.contact(x.contactId)?.name || x.title} · ${Q.company(x.companyId)?.name || ''}`,
        meta: `${Q.overdue(x) ? 'Overdue — ' : 'Due '}${F.dt(x.due)} · ${x.title}`, tone: Q.overdue(x) ? 'bad' : '',
      })))
    return R(
      items.length
        ? `I would prioritise ${items.length} call${items.length > 1 ? 's' : ''} — warm replies first, then due and overdue call tasks${scoped.length ? ` in ${scoped.map(bizName).join(', ')}` : ''}.`
        : 'No calls are due today in this scope. Consider high-scoring contacts in Recommendations.',
      items.slice(0, 10),
    )
  }

  const wk = ql.match(/(\d+)\s*(week|day)/)
  if (/(haven'?t|not been|no) (been )?(contacted|activity|touched)|stale|untouched|gone quiet/.test(ql)) {
    const n = wk ? +wk[1] * (wk[2] === 'week' ? 7 : 1) : 14
    const r = deals.filter(d => d.status === 'open' && F.days(d.lastActivity, clock) >= n).sort((a, b) => a.lastActivity.localeCompare(b.lastActivity))
    return R(
      r.length ? `${r.length} open deal${r.length > 1 ? 's have' : ' has'} had no activity for ${n}+ days:` : `Every open deal in scope has activity within the last ${n} days.`,
      r.map(d => ({ kind: 'deal', id: d.id, line: d.name, meta: `${F.days(d.lastActivity, clock)} days idle · ${stageName(d)} · ${F.money(d.value, 1)} · ${nameOf(d.ownerId)}`, tone: 'warn', act: 'task' })),
    )
  }

  if (/school|university|pathiq/.test(ql) && /(interest|replied|engag)/.test(ql)) {
    if (!Q.member('pth')) return R("You don't have access to PathIQ records.")
    const ths = S.threads.filter(t => t.businessId === 'pth' && ['Interested', 'Meeting Requested', 'More Information Requested'].includes(t.classification?.cat ?? ''))
    const out = ths.filter(t => !S.activities.some(a => a.contactId === t.contactId && a.type === 'meeting_booked' && a.ts >= t.updatedAt.slice(0, 10)) && !S.meetings.some(m => m.companyId === t.companyId && m.status === 'upcoming'))
    return R(
      out.length ? `${out.length} PathIQ organisation${out.length > 1 ? 's have' : ' has'} shown interest without a meeting booked:` : 'All interested PathIQ organisations already have a meeting booked.',
      out.map(t => ({ kind: 'contact', id: t.contactId, line: `${Q.contact(t.contactId)?.name ?? ''} · ${Q.company(t.companyId)?.name ?? ''}`, meta: `${t.classification?.cat ?? ''} · ${F.rel(t.updatedAt)}`, tone: 'ok' })),
    )
  }

  if (/(both|cross|suitable for|also fit|other business)/.test(ql)) {
    let c = cross().filter(x => Q.member(x.fromBiz) || Q.member(x.toBiz))
    if (nm.length >= 2) c = c.filter(x => nm.includes(x.toBiz) && (nm.includes(x.fromBiz) || Q.relsOf(x.companyId).some(r => nm.includes(r.businessId))))
    return R(
      c.length ? "These companies have an existing relationship and look like a fit for another portfolio business. Deal details from businesses you can't access are withheld." : 'No cross-business candidates match that request.',
      c.slice(0, 10).map(x => ({ kind: 'company', id: x.companyId, line: `${Q.company(x.companyId)?.name ?? ''} → ${bizName(x.toBiz)}`, meta: x.reason, tone: 'acc' })),
    )
  }

  if (/summar|pipeline|forecast|how (am|are) (i|we) (doing|tracking)/.test(ql)) {
    const mine = /my /.test(ql) ? deals.filter(d => d.ownerId === me.id) : deals
    const op = mine.filter(Q.open)
    const tot = op.reduce((s, d) => s + d.value, 0)
    const w = op.reduce((s, d) => s + Q.weighted(d), 0)
    const since = F.addDays(clock, -30)
    const won = mine.filter(d => d.status === 'won' && (d.closedAt ?? '') >= since)
    const rk = op.filter(d => Q.risk(d)?.level === 'high')
    const by: Record<string, { n: number; v: number }> = {}
    for (const d of op) {
      const k = `${bizName(d.businessId)} · ${stageName(d)}`
      const e = (by[k] ??= { n: 0, v: 0 })
      e.n++
      e.v += d.value
    }
    return R(
      `${/my /.test(ql) ? 'Your' : 'The'} open pipeline is ${F.money(tot)} across ${op.length} deals (${F.money(w)} weighted). ${won.length} deal${won.length !== 1 ? 's' : ''} won in the last 30 days worth ${F.money(won.reduce((s, d) => s + d.value, 0))}. ${rk.length} deal${rk.length !== 1 ? 's are' : ' is'} at high risk.`,
      Object.entries(by).sort((a, b) => b[1].v - a[1].v).slice(0, 8)
        .map(([k, v]): CopilotItem => ({ kind: 'text', line: k, meta: `${v.n} deal${v.n > 1 ? 's' : ''} · ${F.money(v.v, 1)}` }))
        .concat(rk.slice(0, 4).map((d): CopilotItem => ({ kind: 'deal', id: d.id, line: d.name, meta: `At risk: ${Q.risk(d)?.reasons[0] ?? ''}`, tone: 'bad' }))),
    )
  }

  if (/overdue|my tasks|to.?do/.test(ql)) {
    const t = S.tasks.filter(x => sc.includes(x.businessId) && Q.overdue(x) && (x.assigneeId === me.id || /team|all/.test(ql)))
    return R(
      t.length ? `${t.length} overdue task${t.length > 1 ? 's' : ''}:` : 'Nothing overdue — nice.',
      t.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 12).map(x => ({ kind: 'task', id: x.id, line: x.title, meta: `Due ${F.dt(x.due)} · ${nameOf(x.assigneeId)}`, tone: 'bad' })),
    )
  }

  if (/risk|stuck|stall/.test(ql)) {
    const r = deals.filter(d => Q.risk(d)).sort((a, b) => (Q.risk(b)?.reasons.length ?? 0) - (Q.risk(a)?.reasons.length ?? 0))
    return R(`${r.length} deals show risk signals:`, r.slice(0, 10).map(d => ({
      kind: 'deal', id: d.id, line: d.name, meta: (Q.risk(d)?.reasons ?? []).join(' · '), tone: Q.risk(d)?.level === 'high' ? 'bad' : 'warn',
    })))
  }

  if (/(biggest|largest|top) deal/.test(ql)) {
    const r = deals.filter(Q.open).sort((a, b) => b.value - a.value)
    return R('Largest open deals in scope:', r.slice(0, 8).map(d => ({ kind: 'deal', id: d.id, line: d.name, meta: `${F.money(d.value)} · ${stageName(d)} · ${d.probability}%` })))
  }

  if (/repl(y|ies)|respond|inbox/.test(ql)) {
    const t = S.threads.filter(x => sc.includes(x.businessId) && x.needsReply && Q.threadBody(x))
    return R(`${t.length} conversation${t.length !== 1 ? 's need' : ' needs'} a reply:`, t.map(x => ({
      kind: 'thread', id: x.id, line: x.subject, meta: `${Q.contact(x.contactId)?.name || ''} · ${x.classification?.cat || 'Unclassified'}`,
      tone: POSITIVE.includes(x.classification?.cat ?? '') ? 'ok' : '',
    })))
  }

  const co: Company | undefined = S.companies.find(c => ql.includes(c.name.toLowerCase()) || (ql.includes(c.name.split(' ')[0].toLowerCase()) && c.name.split(' ')[0].length > 5))
  if (co) {
    const b = sc.find(x => Q.rel(co.id, x)) ?? sc[0]
    if (!Q.relsOf(co.id).some(r => Q.member(r.businessId)) || !b) return R(`${co.name} has no relationship with a business you can access.`)
    const ins = companyInsights(co, b)
    return R(
      ins.summary + (ins.signals.length ? ` Signals: ${ins.signals.join(', ')}.` : '') + (ins.gaps.length ? ` Stakeholder gaps: ${ins.gaps.slice(0, 2).join(', ')}.` : ''),
      [{ kind: 'company', id: co.id, line: `Open ${co.name}`, meta: Q.relsOf(co.id).filter(r => Q.member(r.businessId)).map(r => bizName(r.businessId)).join(', ') }]
        .concat(ins.deals.filter(d => Q.member(d.businessId)).map(d => ({ kind: 'deal', id: d.id, line: d.title, meta: `${stageName(d)} · ${F.money(d.value, 1)}` }))),
    )
  }

  return R(
    'I can answer questions using live CRM data in your current workspace. Try one of these:',
    [
      'Which of my Rosterio prospects should I call today?',
      "Which Ardorio deals haven't been contacted for two weeks?",
      "Which schools have shown interest in PathIQ but haven't booked a meeting?",
      'Which companies could be suitable for both Ardorio and Advanta?',
      'Summarise my current pipeline',
      'Draft a follow-up email for your contact',
    ].map(s => ({ kind: 'prompt', line: s })),
  )
}
