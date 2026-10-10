import { F } from '../F'
import { act, audit, mgrsOf, notify } from '../internals'
import { Q } from '../Q'
import { urlOrEmpty } from '../../shared/url'
import { commit } from '../commit'
import { idx, S } from '../store'
import type { EnrichSuggestion } from '../../api/contract'
import type { BusinessId, Research, Task } from '../types'
import { refreshRecs as rules } from '../../ai/rules'
import { createTask } from './tasks'

export function recTask(id: string, force?: boolean): { dup: Task } | { task: Task } | undefined {
  const r = idx.recs.get(id)
  if (!r) return undefined
  const ex = S.tasks.find(t => t.recId === id && !Q.done(t))
  if (ex && !force) return { dup: ex }
  const ct = Q.contact(r.contactId)
  const d = Q.deal(r.dealId)
  const task = createTask({
    title: r.taskTitle || r.title, type: r.taskType || 'Follow-up', businessId: r.businessId,
    assigneeId: d?.ownerId || (ct ? Q.crel(ct.id, r.businessId)?.ownerId : undefined) || S.session.userId, priority: 'High',
    due: F.addDays(`${F.today()}T10:00`, r.taskDays || 1), companyId: r.companyId, contactId: r.contactId, dealId: r.dealId,
    source: 'AI recommendation', recId: id, desc: r.explain,
  }, true)
  r.status = 'Accepted'
  act({ type: 'ai_accepted', businessId: r.businessId, companyId: r.companyId, contactId: r.contactId, dealId: r.dealId, subject: `AI recommendation accepted: ${r.title}` })
  audit('AI recommendation accepted', r.title)
  commit()
  return { task }
}

export function recStatus(id: string, st: string): void {
  const r = idx.recs.get(id)
  if (!r) return
  r.status = st
  if (st === 'Accepted') {
    act({ type: 'ai_accepted', businessId: r.businessId, companyId: r.companyId, contactId: r.contactId, dealId: r.dealId, subject: `AI recommendation accepted: ${r.title}` })
    audit('AI recommendation accepted', r.title)
  }
  commit()
}

export function introRequest(companyId: string, fromBiz: BusinessId, toBiz: BusinessId, note?: string) {
  const co = Q.company(companyId)
  if (!co) return undefined
  const own = Q.rel(companyId, toBiz)?.ownerId || S.teams.find(t => t.businessId === toBiz)?.managerId || mgrsOf(toBiz)[0] || S.session.userId
  const task = createTask({
    title: `Cross-business intro: ${co.name} (${Q.biz(fromBiz)?.name ?? fromBiz} → ${Q.biz(toBiz)?.name ?? toBiz})`, type: 'Follow-up', businessId: toBiz,
    assigneeId: own, priority: 'Medium', due: F.addDays(`${F.today()}T10:00`, 2), companyId, source: 'Cross-business introduction request',
    desc: `${note || ''} Requested by ${Q.me().name} (${Q.biz(fromBiz)?.name ?? fromBiz}). Coordinate before any outreach.`,
  }, true)
  notify([own], {
    type: 'Cross-business introduction request', title: `${Q.me().name} requested an intro at ${co.name}`,
    body: `${Q.biz(fromBiz)?.name ?? fromBiz} → ${Q.biz(toBiz)?.name ?? toBiz}`, link: { page: 'company', id: companyId },
  })
  S.crossStatus[`${companyId}:${toBiz}`] = 'requested'
  audit('Cross-business introduction requested', `${co.name} → ${Q.biz(toBiz)?.name ?? toBiz}`)
  commit()
  return { task, owner: Q.user(own) }
}

export function crossDismiss(k: string): void {
  S.crossStatus[k] = 'dismissed'
  commit()
}

export function saveResearch(snap: Research): void {
  S.research.push(snap)
  const c = idx.companies.get(snap.companyId)
  if (c) {
    c.researchStatus = 'Researched'
    c.lastResearched = F.nowIso()
  }
  act({ type: 'research', businessId: snap.businessId, companyId: snap.companyId, subject: 'AI company research saved', desc: snap.angle })
  commit()
}

const HISTORY_CAP = 100

/** Append to the applied-results log (newest first, capped). Whole-object sync means the cap must hold here. */
function pushHistory(action: string, result: string): void {
  const entry = { ts: F.nowIso(), action, by: S.session.userId, result }
  S.wiza.history = [entry, ...(Array.isArray(S.wiza.history) ? S.wiza.history : [])].slice(0, HISTORY_CAP)
}

/** Log a lookup that produced no applied result (provider error, cap reached, withheld). */
export function enrichLog(action: string, result: string): void {
  pushHistory(action, result)
  commit()
}

const httpUrl = (u: string | undefined): string | undefined => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : undefined)

/**
 * Apply the ticked Grok suggestions to a contact. Verification only moves when the primary email is applied:
 * a published email lands Unverified, an inferred one lands Inferred (blocked from sequences until someone marks
 * it verified). Applying any other field never touches an existing Verified email. Contact.source is never
 * changed: the cited pages live in per-field `enrichment.sourceUrl` and in the activity text.
 */
export function applyEnrichment(ctid: string, fields: EnrichSuggestion[], b: string): void {
  const c = idx.contacts.get(ctid)
  if (!c) return
  const now = F.nowIso()
  const by = S.session.userId
  const changed: string[] = []
  const cited: string[] = []
  for (const f of fields) {
    const raw = typeof f.value === 'string' ? f.value.trim() : ''
    const val = f.field === 'linkedin' ? urlOrEmpty(raw) : f.field === 'email' || f.field === 'email2' ? raw.toLowerCase() : raw
    if (!val) continue
    if (String(c[f.field] ?? '') === val) continue
    Reflect.set(c, f.field, val)
    changed.push(f.field)
    const sourceUrl = httpUrl(f.sourceUrl)
    c.enrichment = {
      ...c.enrichment,
      [f.field]: { kind: f.kind, ...(sourceUrl ? { sourceUrl } : {}), ...(f.pattern ? { pattern: f.pattern } : {}), at: now, by },
    }
    if (sourceUrl && !cited.includes(sourceUrl)) cited.push(sourceUrl)
    if (f.field === 'email') {
      c.verification = f.kind === 'inferred' ? 'Inferred' : 'Unverified'
      delete c.verifiedBy
      delete c.verifiedAt
    }
  }
  c.lastEnriched = now
  pushHistory(`Enriched ${c.name}`, changed.length ? `Updated ${changed.join(', ')}` : 'Reviewed, no changes')
  const biz = (b || Q.primaryBiz(c)) as BusinessId | undefined
  if (biz) {
    const desc = changed.length ? `Updated: ${changed.join(', ')}` : 'No fields applied'
    act({ type: 'enriched', businessId: biz, contactId: ctid, companyId: c.companyId, subject: 'Contact enriched (Grok)', desc: cited.length ? `${desc}\nSources: ${cited.join(' ')}` : desc })
  }
  audit('Contact enriched', `${c.name} — ${changed.join(', ') || 'no changes'}`)
  commit()
}

/**
 * Regenerate rule-based recommendations for the businesses I can edit. Runs in the browser (no lease): the
 * ids come from each rec's natural key, so two tabs creating the same rec write the same record.
 */
export function refreshRecs(): void {
  const sig = (): string => S.recs.map(r => r.id + r.status).join('|')
  const before = sig()
  rules(Q.editScope())
  if (sig() !== before) commit()
}
