import { F } from '../F'
import { act, audit, mgrsOf, notify } from '../internals'
import { Q } from '../Q'
import { urlOrEmpty } from '../../shared/url'
import { commit } from '../commit'
import { idx, S } from '../store'
import type { BusinessId, Contact, Research, Task } from '../types'
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

export type EnrichFields = Partial<Pick<Contact, 'email' | 'email2' | 'phone' | 'mobile' | 'title' | 'linkedin'>>

export function applyEnrichment(ctid: string, fields: EnrichFields, res: { verification?: string }, b?: BusinessId): void {
  const c = idx.contacts.get(ctid)
  if (!c) return
  const changed: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    const val = k === 'linkedin' && typeof v === 'string' && v ? urlOrEmpty(v) : v
    if (val != null && !(k === 'linkedin' && v && !val)) {
      Reflect.set(c, k, val)
      changed.push(k)
    }
  }
  const now = F.nowIso()
  c.lastEnriched = now
  if (fields.email) c.verification = res.verification || c.verification
  if (res.verification === 'Verified' && (fields.email || c.email)) c.verification = 'Verified'
  S.wiza.used++
  S.wiza.credits = Math.max(0, S.wiza.credits - 1)
  S.wiza.history.unshift({ ts: now, action: `Enriched ${c.name}`, by: S.session.userId, result: changed.length ? `Updated ${changed.join(', ')}` : 'Reviewed, no changes' })
  const biz = b ?? Q.primaryBiz(c)
  if (biz) {
    act({ type: 'enriched', businessId: biz, contactId: ctid, companyId: c.companyId, subject: 'Contact enriched via Wiza (simulated)', desc: changed.length ? `Updated: ${changed.join(', ')}` : 'No fields applied' })
  }
  audit('Contact enriched', `${c.name} — ${changed.join(', ') || 'no changes'}`)
  commit()
}

export function wizaUse(n: number, err?: string): void {
  S.wiza.history.unshift({ ts: F.nowIso(), action: err ? 'Enrichment failed' : 'Lookup', by: S.session.userId, result: err || `${n} lookup(s)` })
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
