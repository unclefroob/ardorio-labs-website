import { requestEngineTick } from '../../engine/lease'
import { F } from '../F'
import { uid } from '../ids'
import { act, audit, ensureRels, mgrsOf, notify } from '../internals'
import { Q } from '../Q'
import { commit } from '../commit'
import { idx, reindex, S } from '../store'
import type { BusinessId, Deal } from '../types'
import { createTask } from './tasks'

export interface DealForm {
  title: string
  businessId: BusinessId
  companyId: string
  stageId?: string
  ownerId?: string
  type?: string
  value?: number | string
  contractMonths?: number | string
  close: string
  source?: string
  contactIds?: string[]
  description?: string
  priority?: string
  fields?: Record<string, unknown>
}

const STAGE_SUGGESTION: Record<string, string> = {
  Proposal: 'Send proposal and confirm decision date',
  'Demo Scheduled': 'Send demo agenda and confirm attendees',
  'Pilot / Proposal': 'Send pilot outline to careers team',
  'Security / HR Review': 'Send security & confidentiality pack',
  Negotiation: 'Confirm commercial terms and approvers',
  'Internal Approval': 'Confirm approval meeting date',
  'Trial / Proposal': 'Set up trial venues and success criteria',
  Discovery: 'Book discovery session',
  'Solution Scoping': 'Map integrations and technical stakeholders',
}

export function createDeal(f: DealForm): Deal | undefined {
  const pl = Q.pipeline(f.businessId)
  const st = pl.stages.find(s => s.id === f.stageId) ?? pl.stages[0]
  const co = Q.company(f.companyId)
  if (!st || !co) return undefined
  const now = F.nowIso()
  const contactIds = f.contactIds || []
  const d: Deal = {
    id: uid('dl'), name: `${co.name.split(' ').slice(0, 2).join(' ')} — ${f.title}`, title: f.title, businessId: f.businessId, companyId: f.companyId,
    pipelineId: pl.id, stageId: st.id, ownerId: f.ownerId || S.session.userId, type: f.type || 'New business', value: +(f.value ?? 0) || 0, mrr: null,
    recurring: f.businessId !== 'ard', contractMonths: +(f.contractMonths ?? 0) || 12, close: f.close, probability: st.prob, forecast: 'Pipeline',
    source: f.source || 'Outbound', contactIds, primaryContact: contactIds[0] || null, next: '', description: f.description || '', lostReason: '',
    status: 'open', createdAt: now, stageChangedAt: now, lastActivity: now, closedAt: null, priority: f.priority || 'Medium', fields: f.fields || {},
    stageHistory: [{ stageId: st.id, ts: now }], notes: [],
  }
  if (d.businessId === 'ros') {
    d.mrr = Q.rosMrr(d.fields)
    d.value = d.mrr * 12
  }
  if (d.businessId === 'adv' && d.value) d.mrr = Math.round(d.value / 12)
  S.deals.push(d)
  reindex()
  for (const c of contactIds) ensureRels(c, d.businessId, d.ownerId)
  const rel = Q.rel(d.companyId, d.businessId)
  if (rel) rel.status = 'Active opportunity'
  else {
    const anchor = contactIds[0] || S.contacts.find(c => c.companyId === d.companyId)?.id
    if (anchor) ensureRels(anchor, d.businessId)
  }
  act({ type: 'note', businessId: d.businessId, companyId: d.companyId, contactId: d.primaryContact, dealId: d.id, subject: 'Deal created', desc: `${d.title} · ${F.money(d.value)}` })
  audit('Record created', `Deal: ${d.name}`)
  if (d.ownerId !== S.session.userId) notify([d.ownerId], { type: 'Deal assigned', title: `New deal assigned: ${d.title}`, link: { page: 'deal', id: d.id } })
  commit()
  return d
}

export function updateDeal(id: string, p: Partial<Deal>, quiet?: boolean): void {
  const d = idx.deals.get(id)
  if (!d) return
  const patch: Partial<Deal> = p.fields ? { ...p, fields: { ...d.fields, ...p.fields } } : p
  const prevOwner = d.ownerId
  Object.assign(d, patch)
  if (d.businessId === 'ros') {
    d.mrr = Q.rosMrr(d.fields)
    d.value = Math.round(d.mrr * 12)
  }
  if (d.businessId === 'adv' && p.value) d.mrr = Math.round(d.value / 12)
  d.primaryContact = d.contactIds[0] || null
  if (p.ownerId && p.ownerId !== prevOwner) {
    audit('Ownership changed', `Deal: ${d.name} → ${Q.user(p.ownerId)?.name ?? p.ownerId}`)
    notify([p.ownerId], { type: 'Deal assigned', title: `Deal reassigned to you: ${d.title}`, link: { page: 'deal', id: d.id } })
  } else if (!quiet) audit('Record edited', `Deal: ${d.name}`)
  commit()
}

/** Returns a suggested next-step title for the new stage, if there is one. */
export function moveStage(id: string, stageId: string): string | undefined {
  const d = idx.deals.get(id)
  if (!d || d.stageId === stageId) return undefined
  const st = Q.pipeline(d.businessId).stages.find(s => s.id === stageId)
  if (!st) return undefined
  const from = Q.stage(d)
  const now = F.nowIso()
  d.stageId = stageId
  d.probability = st.prob
  d.forecast = st.prob >= 70 ? 'Commit' : st.prob >= 40 ? 'Best case' : 'Pipeline'
  d.stageChangedAt = now
  d.stageHistory.push({ stageId, ts: now })
  act({ type: 'stage', businessId: d.businessId, companyId: d.companyId, dealId: d.id, subject: `Moved from ${from?.name ?? '?'} to ${st.name}` })
  audit('Deal stage changed', `${d.name}: ${from?.name ?? '?'} → ${st.name}`)
  if (d.ownerId !== S.session.userId) notify([d.ownerId], { type: 'Deal stage changed', title: `${d.title} → ${st.name}`, link: { page: 'deal', id: d.id } })
  commit()
  return STAGE_SUGGESTION[st.name]
}

export interface WonForm {
  value: number | string
  close: string
  term?: number | string
  revenueType?: string
  notes?: string
}

export function markWon(id: string, f: WonForm): void {
  const d = idx.deals.get(id)
  if (!d) return
  const st = Q.pipeline(d.businessId).stages.find(s => s.won)
  if (!st) return
  const from = Q.stage(d)
  const now = F.nowIso()
  Object.assign(d, {
    stageId: st.id, status: 'won', value: +f.value, probability: 100, forecast: 'Closed', closedAt: `${f.close}T${now.slice(11)}`, close: f.close,
    contractMonths: +(f.term ?? 0) || d.contractMonths, revenueType: f.revenueType, wonNotes: f.notes,
  })
  if (d.businessId !== 'ard') d.mrr = Math.round(d.value / 12)
  d.stageHistory.push({ stageId: st.id, ts: now })
  act({ type: 'won', businessId: d.businessId, companyId: d.companyId, dealId: d.id, subject: `Deal won — ${F.money(d.value)}`, desc: f.notes || '' })
  const rel = Q.rel(d.companyId, d.businessId)
  if (rel) rel.status = 'Customer'
  audit('Deal stage changed', `${d.name}: ${from?.name ?? '?'} → Closed Won`)
  notify([...mgrsOf(d.businessId), d.ownerId], { type: 'Goal milestone', title: `Deal won: ${d.title}`, body: F.money(d.value), link: { page: 'deal', id: d.id } })
  requestEngineTick()
  commit()
}

export interface LostForm {
  reason: string
  notes?: string
  reengage?: string
}

export function markLost(id: string, f: LostForm): void {
  const d = idx.deals.get(id)
  if (!d) return
  const st = Q.pipeline(d.businessId).stages.find(s => s.lost)
  if (!st) return
  const from = Q.stage(d)
  const now = F.nowIso()
  Object.assign(d, { stageId: st.id, status: 'lost', probability: 0, forecast: 'Closed', lostReason: f.reason, lostNotes: f.notes, closedAt: now })
  d.stageHistory.push({ stageId: st.id, ts: now })
  act({ type: 'lost', businessId: d.businessId, companyId: d.companyId, dealId: d.id, subject: `Deal lost — ${f.reason}`, desc: f.notes || '' })
  audit('Deal stage changed', `${d.name}: ${from?.name ?? '?'} → Closed Lost`)
  if (f.reengage) {
    createTask({
      title: `Re-engage ${Q.company(d.companyId)?.name ?? 'company'} (${d.title})`, type: 'Follow-up', businessId: d.businessId, assigneeId: d.ownerId,
      due: `${f.reengage}T10:00`, dealId: d.id, companyId: d.companyId, contactId: d.primaryContact, source: 'Lost deal re-engagement',
    }, true)
  }
  for (const t of S.tasks) {
    if (t.dealId === d.id && !Q.done(t) && t.source !== 'Lost deal re-engagement') t.status = 'Cancelled'
  }
  commit()
}

export function reopenDeal(id: string): void {
  const d = idx.deals.get(id)
  if (!d) return
  const st = Q.pipeline(d.businessId).stages[2]
  if (!st) return
  Object.assign(d, { status: 'open', stageId: st.id, probability: st.prob, closedAt: null })
  act({ type: 'stage', businessId: d.businessId, companyId: d.companyId, dealId: d.id, subject: 'Deal reopened' })
  commit()
}
