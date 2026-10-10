import { F } from '../F'
import { act, audit } from '../internals'
import { commit } from '../commit'
import { mergeTech } from '../signalAdjust'
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

/** One record per company, business and kind: a refresh rewrites it in place. */
export function saveIntel(i: IntelInput): Intel | undefined {
  const co = Q.company(i.companyId)
  if (!co) return undefined
  const id = intelId(i.companyId, i.businessId, i.kind)
  const next: Intel = {
    id, businessId: i.businessId, companyId: i.companyId, kind: i.kind, ts: new Date().toISOString(), by: S.session.userId,
    provider: i.provider, model: i.model, items: clone(i.items), sources: clone(i.sources), disclaimer: i.disclaimer,
  }
  const cur = idx.intel.get(id)
  if (cur) Object.assign(cur, next)
  else S.intel.push(next)
  act({ type: 'research', businessId: i.businessId, companyId: i.companyId, subject: `${LABEL[i.kind]} checked on the web`, desc: `${i.items.length} found` })
  commit()
  return idx.intel.get(id) ?? next
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
