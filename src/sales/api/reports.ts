import type { RevenueReport, RevenueSourceFilter } from './contract'
import { SalesHttpError, SalesNetworkError, salesFetch } from './http'

export interface RevenueQuery { from: string; to: string; source: RevenueSourceFilter }

/** GET /sales/reports/revenue for Ardorio. The server allows admins of business `ard` (or super) only. Days are YYYY-MM-DD. */
export function getRevenueReport(q: RevenueQuery, signal?: AbortSignal): Promise<RevenueReport> {
  const p = new URLSearchParams({ business: 'ard', from: q.from, to: q.to, source: q.source })
  return salesFetch<RevenueReport>(`/reports/revenue?${p.toString()}`, { signal })
}

export type RevenueErrorKind = 'denied' | 'not-configured' | 'network' | 'validation' | 'other'

/** A failed revenue report call, in words a person can act on. */
export function revenueReportError(e: unknown): { kind: RevenueErrorKind; message: string } {
  if (e instanceof SalesNetworkError) {
    if (/not configured/i.test(e.message)) return { kind: 'not-configured', message: 'The SalesOS server address is not set up in this build, so the revenue report cannot load.' }
    return { kind: 'network', message: 'Could not reach the server. Check your connection and try again.' }
  }
  if (!(e instanceof SalesHttpError)) return { kind: 'other', message: e instanceof Error ? e.message : 'Something went wrong' }
  if (e.status === 403 || e.code === 'ROLE_REQUIRED' || e.code === 'NOT_A_MEMBER') return { kind: 'denied', message: 'The Ardorio revenue report is for admins of the Ardorio business.' }
  // A server without the report yet answers 404 for the route, or NOT_CONFIGURED: say so rather than show an error.
  if (e.code === 'NOT_CONFIGURED' || e.status === 404) return { kind: 'not-configured', message: 'The revenue report is not available on this server yet. Invoices and payments still show on Customers.' }
  if (e.status === 400 || e.code === 'VALIDATION') return { kind: 'validation', message: e.message }
  return { kind: 'other', message: e.message }
}
