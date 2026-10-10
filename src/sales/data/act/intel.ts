import { F } from '../F'
import { act, audit } from '../internals'
import { commit } from '../commit'
import { mergeTech, sameClosure } from '../signalAdjust'
import { clone, idx, S } from '../store'
import { Q } from '../Q'
import type { AiProvider, CompanyContactItem, CompanySignal, IntelKind, ResearchSource, TechItem } from '../../api/contract'
import type { BusinessId, Intel } from '../types'

export const intelId = (companyId: string, b: BusinessId, kind: IntelKind): string => `in_${companyId}_${b}_${kind}`

export interface IntelInput {
  companyId: string
  businessId: BusinessId
  kind: IntelKind
  provider: AiProvider
  model: string | null
  items: Array<CompanySignal | TechItem | CompanyContactItem>
  sources: ResearchSource[]
  disclaimer: string
}

const LABEL: Record<IntelKind, string> = { signals: 'Company signals', tech: 'Technology stack', contact: 'Company contact details' }

const isSignalItem = (x: unknown): x is CompanySignal => typeof x === 'object' && x !== null && typeof (x as CompanySignal).headline === 'string' && typeof (x as CompanySignal).sourceUrl === 'string'

/** A repeat of a closure someone already confirmed or dismissed keeps their answer; a new story starts unreviewed. */
function carryReviews(next: IntelInput['items'], prev: readonly unknown[]): void {
  const reviewed = prev.filter(isSignalItem).filter(p => p.kind === 'closure' && p.review)
  if (!reviewed.length) return
  for (const n of next) {
    if (!isSignalItem(n) || n.kind !== 'closure') continue
    const old = reviewed.find(p => sameClosure(p, n))
    if (!old) continue
    n.review = old.review
    if (old.reviewedBy) n.reviewedBy = old.reviewedBy
    if (old.reviewedAt) n.reviewedAt = old.reviewedAt
  }
}

/**
 * One record per company, business and kind: a refresh rewrites it in place. A lookup that succeeds but
 * finds nothing never wipes what was saved: it only moves `checkedAt`.
 */
export function saveIntel(i: IntelInput): Intel | undefined {
  const co = Q.company(i.companyId)
  if (!co) return undefined
  const id = intelId(i.companyId, i.businessId, i.kind)
  const now = new Date().toISOString()
  const cur = idx.intel.get(id)
  if (cur && i.items.length === 0 && cur.items.length > 0) {
    cur.checkedAt = now
    act({ type: 'research', businessId: i.businessId, companyId: i.companyId, subject: `${LABEL[i.kind]} checked on the web`, desc: 'nothing new found; earlier results kept' })
    commit()
    return cur
  }
  const items = clone(i.items)
  if (cur) carryReviews(items, cur.items)
  const next: Intel = {
    id, businessId: i.businessId, companyId: i.companyId, kind: i.kind, ts: now, checkedAt: now, by: S.session.userId,
    provider: i.provider, model: i.model, items, sources: clone(i.sources), disclaimer: i.disclaimer,
  }
  if (cur) Object.assign(cur, next)
  else S.intel.push(next)
  act({ type: 'research', businessId: i.businessId, companyId: i.companyId, subject: `${LABEL[i.kind]} checked on the web`, desc: `${i.items.length} found` })
  commit()
  return idx.intel.get(id) ?? next
}

/** A person's answer on a reported closure. Makes no web lookup. Returns false when the closure is no longer saved. */
export function reviewClosure(companyId: string, b: BusinessId, closure: Pick<CompanySignal, 'headline' | 'sourceUrl'>, decision: 'confirmed' | 'dismissed'): boolean {
  const rec = idx.intel.get(intelId(companyId, b, 'signals'))
  const item = rec?.items.find((x): x is CompanySignal => isSignalItem(x) && x.kind === 'closure' && sameClosure(x, closure))
  if (!rec || !item) return false
  item.review = decision
  item.reviewedBy = S.session.userId
  item.reviewedAt = new Date().toISOString()
  const co = Q.company(companyId)
  audit('Record edited', `Closure ${decision}: ${co?.name ?? companyId}`)
  commit()
  return true
}

/** Explicit click only: merge tool names into the company's known technology. Returns how many were new. */
export function addKnownTech(companyId: string, names: readonly string[]): number {
  const c = idx.companies.get(companyId)
  if (!c) return 0
  const before = Array.isArray(c.tech) ? c.tech : []
  const merged = mergeTech(before, names)
  const added = merged.length - before.length
  if (added === 0) return 0
  c.tech = merged
  c.updatedAt = F.nowIso()
  audit('Record edited', `Company technology: ${c.name}`)
  commit()
  return added
}
