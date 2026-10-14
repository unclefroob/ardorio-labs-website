import { nudgeEngine } from '../engineNudge'
import { F } from '../F'
import { uid } from '../ids'
import { act, audit, ensureRels, mgrsOf, notify } from '../internals'
import { Q } from '../Q'
import { commit } from '../commit'
import { idx, reindex, S } from '../store'
import type { BusinessId, Company, Deal, Pipeline, Stage } from '../types'
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

/** A new open deal record in stage `st`, before it is stored. */
export function dealRecord(f: DealForm, pl: Pipeline, st: Stage, co: Company): Deal {
  const now = F.nowIso()
  const contactIds = f.contactIds || []
  return {
    id: uid('dl'), name: `${co.name.split(' ').slice(0, 2).join(' ')} — ${f.title}`, title: f.title, businessId: f.businessId, companyId: f.companyId,
    pipelineId: pl.id, stageId: st.id, ownerId: f.ownerId || S.session.userId, type: f.type || 'New business', value: +(f.value ?? 0) || 0, mrr: null,
    recurring: f.businessId !== 'ard', contractMonths: +(f.contractMonths ?? 0) || 12, close: f.close, probability: st.prob, forecast: 'Pipeline',
    source: f.source || 'Outbound', contactIds, primaryContact: contactIds[0] || null, next: '', description: f.description || '', lostReason: '',
    status: 'open', createdAt: now, stageChangedAt: now, lastActivity: now, closedAt: null, priority: f.priority || 'Medium', fields: f.fields || {},
    stageHistory: [{ stageId: st.id, ts: now }], notes: [],
  }
}

export function createDeal(f: DealForm): Deal | undefined {
  const pl = Q.pipeline(f.businessId)
  const st = pl.stages.find(s => s.id === f.stageId) ?? pl.stages[0]
  const co = Q.company(f.companyId)
  if (!st || !co) return undefined
  const contactIds = f.contactIds || []
  const d = dealRecord(f, pl, st, co)
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
  nudgeEngine()
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

/** Where a closed deal goes back to when reopened, and whether that came from its history or the fallback. */
export interface ReopenTarget { stage: Stage; from: 'history' | 'fallback' }

/**
 * The stage a closed deal returns to on reopen: the last open stage in its stageHistory before it closed that still
 * exists in the pipeline, else the pipeline's last open stage (contract: deal reopen).
 */
export function reopenTarget(d: Pick<Deal, 'businessId' | 'stageHistory'>): ReopenTarget | undefined {
  const pl = Q.pipeline(d.businessId)
  const open = pl.stages.filter(s => !s.won && !s.lost)
  const hist = d.stageHistory ?? []
  for (let i = hist.length - 1; i >= 0; i--) {
    const st = open.find(s => s.id === hist[i].stageId)
    if (st) return { stage: st, from: 'history' }
  }
  const last = open[open.length - 1]
  return last ? { stage: last, from: 'fallback' } : undefined
}

/** Other won, live deals of this company in this business (they keep it a customer). */
export function otherWonDeals(d: Pick<Deal, 'id' | 'companyId' | 'businessId'>): Deal[] {
  return S.deals.filter(x => x.id !== d.id && x.companyId === d.companyId && x.businessId === d.businessId && x.status === 'won' && x.archived !== true)
}

/**
 * Reopen a won or lost deal (contract: deal reopen). It returns to the stage it was in before it closed, and the won and
 * lost fields are cleared (closedAt, lostReason, wonNotes). reopenedBy is the server's, which also stamps reopenedAt.
 * A won deal's company stops being a customer of the business unless another won deal keeps it one. An Ardorio billing
 * plan is left exactly as it is: its contract stays frozen, and the server drafts no retainer invoice while the deal
 * is not won. Returns the stage it went back to.
 */
export function reopenDeal(id: string): Stage | undefined {
  const d = idx.deals.get(id)
  if (!d || d.status === 'open') return undefined
  const t = reopenTarget(d)
  if (!t) return undefined
  const st = t.stage
  const was = d.status
  const from = Q.stage(d)
  const now = F.nowIso()
  Object.assign(d, {
    status: 'open', stageId: st.id, probability: st.prob, forecast: st.prob >= 70 ? 'Commit' : st.prob >= 40 ? 'Best case' : 'Pipeline',
    closedAt: null, lostReason: '', stageChangedAt: now, reopenedAt: now,
  })
  if ('wonNotes' in d) delete d.wonNotes
  d.stageHistory.push({ stageId: st.id, ts: now })
  if (was === 'won') {
    const rel = Q.rel(d.companyId, d.businessId)
    if (rel && rel.status === 'Customer' && !otherWonDeals(d).length) rel.status = 'Active opportunity'
  }
  const closed = from?.name ?? (was === 'won' ? 'Closed Won' : 'Closed Lost')
  act({ type: 'stage', businessId: d.businessId, companyId: d.companyId, dealId: d.id, subject: 'Deal reopened', desc: `${closed} → ${st.name}` })
  audit('Deal reopened', `${d.name}: ${closed} → ${st.name}`)
  commit()
  return st
}

/** Admins only (the server rejects anyone else). The deal keeps its stage and history; it just stops counting. */
export function archiveDeal(id: string): void {
  const d = idx.deals.get(id)
  if (!d || d.archived) return
  d.archived = true
  d.archivedAt = F.nowIso()
  d.archivedBy = S.session.userId
  audit('Record archived', `Deal: ${d.name}`)
  commit()
}

export function restoreDeal(id: string): void {
  const d = idx.deals.get(id)
  if (!d || !d.archived) return
  d.archived = false
  delete d.archivedAt
  delete d.archivedBy
  audit('Record restored', `Deal: ${d.name}`)
  commit()
}
