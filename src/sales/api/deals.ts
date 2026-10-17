import { salesFetch } from './http'

/** Move a deal still in the pipeline to another company and/or business; its open work moves with it (API: services/sales/dealMove.ts). */
export interface MoveDealBody { businessId?: string; companyId?: string; contactIds?: string[] }
export interface MoveDealResult {
  dealId: string
  moved: { tasks: number; meetings: number; threads: number; recs: number }
  threadsLeft: number
  notes: string[]
}
export const moveDealApi = (id: string, body: MoveDealBody) => salesFetch<MoveDealResult>(`/deals/${encodeURIComponent(id)}/move`, { method: 'POST', body })
