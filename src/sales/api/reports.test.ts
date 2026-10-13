import { afterEach, describe, expect, it, vi } from 'vitest'
import { SalesHttpError, SalesNetworkError } from './http'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))

afterEach(() => { vi.unstubAllGlobals() })

describe('getRevenueReport', () => {
  it('calls GET /sales/reports/revenue for business ard with the range and source', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', (async (url: string, init?: RequestInit) => {
      seen.push(`${init?.method ?? 'GET'} ${url}`)
      return new Response(JSON.stringify({ from: '2026-10-01', to: '2026-10-09', source: 'external', months: [], invoicedCents: 0, collectedCents: 0, outstandingCents: 0, overdueCents: 0, recordedLate: [] }), { status: 200 })
    }) as typeof fetch)
    const { getRevenueReport } = await import('./reports')
    const r = await getRevenueReport({ from: '2026-10-01', to: '2026-10-09', source: 'external' })
    expect(seen).toEqual(['GET https://api.test/sales/reports/revenue?business=ard&from=2026-10-01&to=2026-10-09&source=external'])
    expect(r.source).toBe('external')
  })
})

describe('revenueReportError', () => {
  it('maps the server answers to something a person can act on', async () => {
    const { revenueReportError } = await import('./reports')
    expect(revenueReportError(new SalesHttpError(403, { error: 'no', code: 'ROLE_REQUIRED' })).kind).toBe('denied')
    expect(revenueReportError(new SalesHttpError(404, { error: 'Not found', code: 'NOT_FOUND' })).kind).toBe('not-configured')
    expect(revenueReportError(new SalesHttpError(503, { error: 'off', code: 'NOT_CONFIGURED' })).kind).toBe('not-configured')
    expect(revenueReportError(new SalesNetworkError('API URL is not configured (VITE_API_URL missing at build time).')).kind).toBe('not-configured')
    expect(revenueReportError(new SalesNetworkError()).kind).toBe('network')
    expect(revenueReportError(new SalesHttpError(400, { error: 'from is not a day', code: 'VALIDATION' }))).toEqual({ kind: 'validation', message: 'from is not a day' })
    expect(revenueReportError(new SalesHttpError(500, null, 'boom'))).toEqual({ kind: 'other', message: 'boom' })
  })
})
