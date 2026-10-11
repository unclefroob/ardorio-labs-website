import { Act } from '../data/Act'
import type { BusinessId, IntelKind } from '../api/contract'
import { isFailure, runIntel, type IntelItem, type WebOutcome } from './client'

/** Look a company up on the web and, when something usable came back, save it as that company's intel record. */
export async function checkCompany(kind: IntelKind, companyId: string, b: BusinessId, opts: { signal?: AbortSignal } = {}): Promise<WebOutcome<IntelItem>> {
  const o: WebOutcome<IntelItem> = await runIntel(kind, { businessId: b, companyId }, opts)
  if (!isFailure(o)) {
    Act.saveIntel({ companyId, businessId: b, kind, provider: o.provider, model: o.model, items: o.items, sources: o.sources, disclaimer: o.disclaimer })
  }
  return o
}
