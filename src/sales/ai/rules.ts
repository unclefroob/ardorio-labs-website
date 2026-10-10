import { F } from '../data/F'
import { stableId } from '../data/ids'
import { Q } from '../data/Q'
import { S } from '../data/store'
import type { BusinessId, Company, Deal, Rec, Research } from '../data/types'
import { LIB } from './library'

/** Rules-only insight code: synchronous, deterministic, no model calls (decision D17). */

export interface CrossItem {
  key: string
  companyId: string
  fromBiz: BusinessId
  toBiz: BusinessId
  ownerId: string
  reason: string
  stakeholders: string[]
  status: string
  activeElsewhere: boolean
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

type CrossRule = [BusinessId, (c: Company) => boolean, (c: Company) => string]
const CROSS_RULES: CrossRule[] = [
  ['ros',
    c => n(c.employees) >= 100 && n(c.locations) >= 5 && /Retail|Hospitality|Supermarkets|Multi-site|Healthcare|Enterprise Services|Furniture/.test(c.industry),
    c => `${n(c.locations)} locations with an estimated ${F.num(n(c.employees))} shift-based staff — rostering complexity across sites.`],
  ['adv',
    c => n(c.employees) >= 250 && !/Education|Career/.test(c.industry),
    c => `${F.num(n(c.employees))} employees${n(c.locations) > 5 ? ` across ${n(c.locations)} sites` : ''} — scale where wellbeing and confidential HR support are typical priorities.`],
  ['ard',
    c => n(c.locations) >= 10 && n(c.employees) >= 300,
    c => `${n(c.locations)} locations — likely operational software and integration needs across head office and sites.`],
]

export function cross(): CrossItem[] {
  const out: CrossItem[] = []
  const openDeal = (cid: string, b?: string): boolean => S.deals.some(d => d.companyId === cid && (!b || d.businessId === b) && d.status === 'open')
  for (const c of S.companies) {
    if (c.archived) continue
    const rels = Q.relsOf(c.id)
    if (!rels.length) continue
    for (const [to, ok, why] of CROSS_RULES) {
      if (rels.some(r => r.businessId === to) || !ok(c)) continue
      const key = `${c.id}:${to}`
      const status = S.crossStatus[key] || 'open'
      if (status === 'dismissed') continue
      const from = rels.slice().sort((a, b) => (openDeal(c.id, b.businessId) ? 1 : 0) - (openDeal(c.id, a.businessId) ? 1 : 0))[0]
      const bz = Q.biz(to)
      const sh = S.contacts.filter(x => x.companyId === c.id && !!bz && bz.roles.some(r => x.title.includes(r)))
      out.push({
        key, companyId: c.id, fromBiz: from.businessId, toBiz: to, ownerId: from.ownerId, reason: why(c),
        stakeholders: sh.map(x => x.id), status, activeElsewhere: openDeal(c.id),
      })
    }
  }
  return out.sort((a, b) => (b.activeElsewhere ? 1 : 0) - (a.activeElsewhere ? 1 : 0) || n(Q.company(b.companyId)?.employees) - n(Q.company(a.companyId)?.employees))
}

type RecInput = Pick<Rec, 'key' | 'businessId' | 'type' | 'title' | 'explain' | 'evidence' | 'confidence' | 'action'> &
  Partial<Pick<Rec, 'taskTitle' | 'taskType' | 'taskDays' | 'contactId' | 'companyId' | 'dealId' | 'threadId' | 'suggestDeal'>> & {
    fromBiz?: BusinessId; meetingId?: string; crossKey?: string
  }

const DM = /Decision|Economic/

/** Rule-based recommendations for the given businesses only (any client may generate them; ids are derived from the key). */
export function refreshRecs(scope: readonly BusinessId[]): void {
  const clock = F.nowIso()
  const inScope = (b: string): boolean => (scope as readonly string[]).includes(b)
  const have = new Set(S.recs.map(r => r.key))
  const live = new Set<string>()
  const add = (r: RecInput): void => {
    if (!inScope(r.businessId)) return
    live.add(r.key)
    if (have.has(r.key)) return
    S.recs.push({ id: stableId('rc', r.key), createdAt: clock, status: 'New', ...r })
    have.add(r.key)
  }

  for (const d of S.deals) {
    if (d.status !== 'open' || !inScope(d.businessId)) continue
    const idle = F.days(d.lastActivity, clock)
    const cts = d.contactIds.map(Q.contact).filter((c): c is NonNullable<typeof c> => !!c)
    const dm = cts.find(c => DM.test(c.buyingRole)) ?? cts[0]
    const pl = Q.pipeline(d.businessId)
    const si = pl.stages.findIndex(s => s.id === d.stageId)
    const stageName = Q.stage(d)?.name ?? ''
    if (idle >= 10) {
      add({
        key: `stale:${d.id}`, businessId: d.businessId, type: 'Stale deal', title: `Follow up on ${d.title}`,
        explain: `This deal has not had activity in ${idle} days. Consider following up with ${dm ? `${dm.name} (${dm.title})` : 'the primary stakeholder'}.`,
        evidence: `Last activity ${F.date(d.lastActivity)} · stage ${stageName} for ${F.days(d.stageChangedAt, clock)} days`,
        confidence: idle >= 14 ? 'High' : 'Medium', action: 'task', taskTitle: `Follow up with ${dm ? dm.firstName : 'stakeholder'} — ${d.title}`,
        taskType: 'Follow-up', taskDays: 0, dealId: d.id, companyId: d.companyId, contactId: dm?.id,
      })
    }
    if (!S.tasks.some(t => t.dealId === d.id && !Q.done(t))) {
      add({
        key: `next:${d.id}`, businessId: d.businessId, type: 'No next step', title: `Set a next step for ${d.title}`,
        explain: 'No open task is scheduled for this deal, so it can easily stall.', evidence: `0 open tasks · stage ${stageName}`,
        confidence: 'High', action: 'task', taskTitle: `Schedule next step — ${d.title}`, taskDays: 1, dealId: d.id, companyId: d.companyId, contactId: dm?.id,
      })
    }
    if (si >= 3 && !cts.some(c => DM.test(c.buyingRole))) {
      add({
        key: `gap:${d.id}`, businessId: d.businessId, type: 'Stakeholder gap', title: `Identify the decision-maker for ${d.title}`,
        explain: `The deal is at ${stageName} but no linked stakeholder is marked as decision-maker or economic buyer.`,
        evidence: `${cts.length} linked contact(s): ${cts.map(c => c.buyingRole).join(', ')}`, confidence: 'Medium', action: 'task',
        taskTitle: `Map decision-maker and approval path — ${d.title}`, taskType: 'Research', taskDays: 2, dealId: d.id, companyId: d.companyId,
      })
    }
    if (d.close <= F.addDays(clock, 21).slice(0, 10) && d.close >= clock.slice(0, 10) && d.probability < 40) {
      add({
        key: `close:${d.id}`, businessId: d.businessId, type: 'Forecast risk', title: `Close date at risk: ${d.title}`,
        explain: `Expected close is ${F.date(d.close)} but the deal is still at ${stageName} (${d.probability}%).`,
        evidence: `Close in ${F.days(clock, `${d.close}T17:00`)} days`, confidence: 'Medium', action: 'view', dealId: d.id, companyId: d.companyId,
      })
    }
  }

  for (const m of S.meetings) {
    if (m.status !== 'upcoming' || m.start < clock || F.days(clock, m.start) > 3) continue
    add({
      key: `prep:${m.id}`, businessId: m.businessId, type: 'Meeting prep', title: `Prepare for ${m.title}`,
      explain: `Meeting ${F.rel(m.start)}. A pre-meeting briefing is available.`, evidence: `${(m.participants || []).length} participant(s) · ${m.type}`,
      confidence: 'High', action: 'brief', meetingId: m.id, dealId: m.dealId, companyId: m.companyId, taskTitle: `Prepare for ${m.title}`,
      taskType: 'Meeting Preparation', taskDays: 0,
    })
  }

  for (const x of cross().slice(0, 8)) {
    add({
      key: `cross:${x.key}`, businessId: x.toBiz, fromBiz: x.fromBiz, type: 'Cross-business',
      title: `${Q.company(x.companyId)?.name ?? 'Company'} may suit ${Q.biz(x.toBiz)?.name ?? x.toBiz}`,
      explain: `${x.reason} Existing ${Q.biz(x.fromBiz)?.name ?? x.fromBiz} relationship.`,
      evidence: `Company profile (CRM) · ${x.stakeholders.length} relevant stakeholder(s) on file`,
      confidence: x.activeElsewhere ? 'Medium' : 'Low', action: 'intro', companyId: x.companyId, crossKey: x.key,
    })
  }

  for (const r of S.contactRels) {
    if (live.size > 200) break
    if (!inScope(r.businessId)) continue
    const c = Q.contact(r.contactId)
    if (!c || !c.email || Q.suppressed(c, r.businessId) || Q.activeEnrol(c.id).length) continue
    if (r.lastActivity && F.days(r.lastActivity, clock) < 21) continue
    if (S.deals.some(d => d.status === 'open' && d.contactIds.includes(c.id))) continue
    if (!/C-Level|Director|Head/.test(c.seniority)) continue
    const sc = Q.score(c.id, r.businessId)
    if (sc.total < 50) continue
    add({
      key: `reach:${c.id}:${r.businessId}`, businessId: r.businessId, type: 'New outreach',
      title: `Reach out to ${c.name} (${Q.company(c.companyId)?.name ?? ''})`,
      explain: `Lead score ${sc.total} (${sc.label}): ${sc.pos.slice(0, 2).join('; ')}. No recent engagement.`,
      evidence: `Score breakdown · ${sc.parts.map(p => `${p[0].split(' ')[0]} ${p[1]}/${p[2]}`).join(', ')}`,
      confidence: 'Medium', action: 'task', taskTitle: `Personalised outreach — ${c.name}`, taskType: 'Email', taskDays: 1,
      contactId: c.id, companyId: c.companyId,
    })
  }

  for (const r of S.recs) {
    if (inScope(r.businessId) && r.status === 'New' && r.type !== 'Reply follow-up' && !live.has(r.key)) r.status = 'Expired'
  }
}

export interface DealInsights {
  health: number
  risk: ReturnType<typeof Q.risk>
  missing: string[]
  gaps: string[]
  objections: string[]
  recs: string[]
  stalled: string | null
  next: string
  forecast: string | null
}

const KEY_FIELDS: Record<BusinessId, string[]> = {
  ard: ['solution', 'techStack', 'integrations', 'decisionMaker', 'champion', 'procurement', 'decisionDate'],
  ros: ['employees', 'rate', 'provider', 'payroll', 'decisionMaker', 'demoDate', 'implDate'],
  pth: ['eligible', 'yearLevels', 'existingPlatform', 'decisionMaker', 'approvalReq', 'pilotStart'],
  adv: ['employees', 'eapProvider', 'hrPlatform', 'hrStakeholder', 'securityReview', 'dataResidency', 'launch'],
}
const OBJ: Record<BusinessId, string[]> = {
  ard: ['Integration complexity with existing ERP / identity systems', 'Internal capacity to support implementation', 'Build vs. buy comparison'],
  ros: ['Switching cost from current provider', 'Payroll integration effort', 'Manager adoption across venues'],
  pth: ['Teacher time to run sessions', 'Budget cycle aligned to academic year', 'Evidence of student outcomes'],
  adv: ['Confidentiality of individual responses', 'Data residency and security review', 'Overlap with existing EAP'],
}
const REC: Record<BusinessId, string[]> = {
  ard: ['Identify technical stakeholders and confirm integration scope', 'Document operational requirements per site type', 'Assess integration complexity (ERP, identity, payroll)'],
  ros: ['Confirm current rostering pain points', 'Understand payroll requirements and pay cycles', 'Schedule or tailor the demo', 'Clarify rollout timeline across locations'],
  pth: ['Clarify existing career education tools', 'Confirm student cohorts and year levels', 'Understand approval requirements', 'Agree how pilot outcomes will be reviewed', 'Map the school decision timeline'],
  adv: ['Clarify existing EAP processes', 'Identify HR pain points', 'Understand confidentiality requirements', 'Confirm security review requirements', 'Map implementation stakeholders'],
}

export function dealInsights(d: Deal): DealInsights {
  const clock = F.nowIso()
  const pl = Q.pipeline(d.businessId)
  const risk = Q.risk(d)
  const cts = d.contactIds.map(Q.contact).filter((c): c is NonNullable<typeof c> => !!c)
  const missing = KEY_FIELDS[d.businessId]
    .filter(k => d.fields[k] == null || d.fields[k] === '')
    .map(k => pl.fields.find(f => f.key === k)?.label ?? k)
  let h = 80
  if (risk) h -= risk.reasons.length * 12
  h -= missing.length * 3
  if (cts.length >= 3) h += 6
  h = Math.max(12, Math.min(96, h))
  if (d.status !== 'open') h = d.status === 'won' ? 100 : 0
  const gaps: string[] = []
  if (!cts.some(c => DM.test(c.buyingRole))) gaps.push('No decision-maker / economic buyer linked')
  if (d.businessId === 'ard' && !d.fields.champion) gaps.push('No technical champion identified')
  if (d.businessId === 'adv' && !cts.some(c => /Security|IT/.test(c.title))) gaps.push('No IT/security reviewer linked')
  if (d.businessId === 'pth' && !cts.some(c => /Principal/.test(c.title))) gaps.push('Principal / approver not engaged')
  if (d.businessId === 'ros' && !cts.some(c => /Payroll/.test(c.title))) gaps.push('Payroll stakeholder not linked')
  const obj: string[] = []
  for (const t of S.threads.filter(x => x.dealId === d.id || (x.companyId === d.companyId && x.businessId === d.businessId))) {
    if (t.classification?.cat === 'Pricing Objection') obj.push(`Pricing raised in email “${t.subject}”`)
    if (t.classification?.cat === 'Timing Objection') obj.push('Timing concern raised')
  }
  const recs = REC[d.businessId]
  const stall = F.days(d.stageChangedAt, clock)
  const forecast = d.status !== 'open' ? null
    : d.probability >= 60 && risk ? `Forecast at ${d.probability}% but showing risk signals — consider moving to Best case.`
    : d.close < clock.slice(0, 10) ? 'Close date has passed — update the expected close date.'
    : `Forecast category ${d.forecast} is consistent with stage and activity.`
  return {
    health: h, risk, missing, gaps, objections: obj.concat(OBJ[d.businessId].slice(0, 2)), recs,
    stalled: stall >= 21 && d.status === 'open' ? `In ${Q.stage(d)?.name ?? 'stage'} for ${stall} days — longer than typical for this stage.` : null,
    next: risk?.reasons.includes('No next step scheduled') ? `Schedule a next step with ${cts[0]?.firstName ?? 'the customer'}`
      : gaps.length ? gaps[0].replace('No ', 'Engage ').replace(' linked', '').replace(' identified', '')
      : recs[0],
    forecast,
  }
}

export interface CompanyInsights {
  snap: Research | undefined
  signals: string[]
  gaps: string[]
  deals: Deal[]
  cross: CrossItem[]
  fit: number | null
  summary: string
}

export function companyInsights(c: Company, b: BusinessId): CompanyInsights {
  const snap = S.research.filter(r => r.companyId === c.id && r.businessId === b).sort((x, y) => y.ts.localeCompare(x.ts))[0]
  const deals = S.deals.filter(d => d.companyId === c.id && d.businessId === b)
  const cr = cross().filter(x => x.companyId === c.id)
  const cts = S.contacts.filter(x => x.companyId === c.id)
  const bz = Q.biz(b)
  const sig: string[] = []
  if (n(c.locations) >= 5) sig.push(`${n(c.locations)} locations`)
  if (n(c.employees) >= 200) sig.push(`${F.num(n(c.employees))} employees`)
  const pos = S.threads.filter(t => t.companyId === c.id && t.businessId === b && ['Interested', 'Meeting Requested', 'More Information Requested'].includes(t.classification?.cat ?? ''))
  if (pos.length) sig.push(`${pos.length} positive repl${pos.length > 1 ? 'ies' : 'y'}`)
  if (deals.some(d => d.status === 'won')) sig.push('Existing customer')
  const gaps = LIB[b].base.st.filter(r => !cts.some(x => r.split(/[ /]+/).some(w => w.length > 3 && x.title.includes(w))))
  const overview = snap && typeof snap.overview === 'string' ? snap.overview : ''
  return {
    snap, signals: sig, gaps, deals, cross: cr, fit: snap && typeof snap.score === 'number' ? snap.score : null,
    summary: snap ? overview : `${c.name} — ${c.industry}, ${c.hq}. Run research to generate a full ${bz?.name ?? 'business'} briefing.`,
  }
}
