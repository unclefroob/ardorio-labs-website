import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi, json } from '../testing/rosterioWorld'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))

beforeEach(() => { localStorage.setItem('ardorio_admin_token', 'tok') })
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

const err = (status: number, code: string, error = 'boom') => json(status, { error, code })

describe('invoices API calls', () => {
  it('builds the list query from the filter and sends the bearer token', async () => {
    const seen: Array<{ url: string; auth: string | null }> = []
    vi.stubGlobal('fetch', (async (url: string, init?: RequestInit) => {
      seen.push({ url, auth: new Headers(init?.headers).get('Authorization') })
      return json(200, { invoices: [] })
    }) as typeof fetch)
    const { listInvoices } = await import('./invoices')
    await listInvoices()
    await listInvoices({ status: 'overdue', companyId: 'co 1', dealId: 'dl1' })
    expect(seen[0]).toEqual({ url: 'https://api.test/sales/invoices', auth: 'Bearer tok' })
    expect(seen[1].url).toBe('https://api.test/sales/invoices?status=overdue&companyId=co+1&dealId=dl1')
  })

  it('uses PUT and DELETE, encodes ids, and treats an empty 204 as success', async () => {
    const api = fakeApi({
      'PUT /sales/invoices/a%2Fb': json(200, { id: 'a/b' }),
      'DELETE /sales/invoices/a%2Fb': new Response(null, { status: 204 }),
      'POST /sales/invoices/i1/issue': json(200, { id: 'i1' }),
      'POST /sales/invoices/i1/mark-paid': json(200, { id: 'i1' }),
      'POST /sales/invoices/clients/s1/link': json(200, {}),
      'DELETE /sales/invoices/clients/s1/link/co1': json(200, {}),
      'PUT /sales/invoices/settings': json(200, {}),
    })
    const m = await import('./invoices')
    const input = { clientSlug: 's', lineItems: [], issueDate: '2026-10-01', paymentTermsDays: 45 }
    await m.updateInvoice('a/b', input)
    await expect(m.deleteInvoice('a/b')).resolves.toBeUndefined()
    await m.issueInvoice('i1')
    await m.markInvoicePaid('i1', { method: 'card', amountCents: 5 })
    await m.linkBillingClient('s1', 'co1')
    await m.unlinkBillingClient('s1', 'co1')
    await m.putInvoiceSettings({ name: 'A', abn: '', address: '', email: '', gstRegistered: true, offerCardPayments: false, bank: { accountName: '', bsb: '', accountNumber: '', payId: '' } })
    expect(api.calls.map(c => `${c.method} ${c.path}`)).toEqual([
      'PUT /sales/invoices/a%2Fb', 'DELETE /sales/invoices/a%2Fb', 'POST /sales/invoices/i1/issue', 'POST /sales/invoices/i1/mark-paid',
      'POST /sales/invoices/clients/s1/link', 'DELETE /sales/invoices/clients/s1/link/co1', 'PUT /sales/invoices/settings',
    ])
    expect(api.calls[0].body).toEqual(input)
    expect(api.calls[3].body).toEqual({ method: 'card', amountCents: 5 })
    expect(api.calls[4].body).toEqual({ companyId: 'co1' })
  })

  it('downloads the PDF and the CSV as blobs through the authenticated path', async () => {
    fakeApi({ 'GET /sales/invoices/i1/pdf': new Response('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } }), 'GET /sales/invoices/export.csv': new Response('a,b') })
    const m = await import('./invoices')
    expect(await (await m.invoicePdf('i1')).text()).toBe('%PDF-1.4')
    expect(await (await m.invoicesCsv()).text()).toBe('a,b')
  })
})

describe('invoiceError', () => {
  async function fail(res: Response, action?: 'issue' | 'save') {
    fakeApi({ 'GET /sales/invoices/x': res })
    const { getInvoice, invoiceError } = await import('./invoices')
    const e = await getInvoice('x').catch(x => x)
    return invoiceError(e, action)
  }

  it('403 is the denied state, however the server words it', async () => {
    expect(await fail(err(403, 'ROLE_REQUIRED'))).toMatchObject({ kind: 'denied', message: expect.stringContaining('admins') })
    expect(await fail(err(403, 'NOT_A_MEMBER'))).toMatchObject({ kind: 'denied' })
  })
  it('NOT_CONFIGURED says card payments are not set up', async () => {
    expect(await fail(err(503, 'NOT_CONFIGURED'))).toMatchObject({ kind: 'not-configured', message: expect.stringMatching(/Card payments are not set up/) })
  })
  it('a failed card link on issue reads as the card link problem, with transfer still available', async () => {
    const e = await fail(err(502, 'UPSTREAM_ERROR', 'stripe down'), 'issue')
    expect(e.kind).toBe('card-link')
    expect(e.message).toMatch(/card payment link could not be created/)
    expect(e.message).toMatch(/transfer or PayID/)
    expect((await fail(err(502, 'INTERNAL'), 'issue')).kind).toBe('card-link')
    expect((await fail(err(502, 'INTERNAL'), 'save')).kind).toBe('other')
  })
  it('maps not found, conflict and validation, keeping the server text for validation', async () => {
    expect((await fail(err(404, 'NOT_FOUND'))).kind).toBe('not-found')
    expect((await fail(err(409, 'CONFLICT'))).kind).toBe('conflict')
    expect(await fail(err(400, 'VALIDATION', 'Unit price must be positive'))).toEqual({ kind: 'validation', message: 'Unit price must be positive' })
  })
  it('a dropped connection is its own message', async () => {
    vi.stubGlobal('fetch', (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch)
    const { getInvoice, invoiceError } = await import('./invoices')
    const e = await getInvoice('x').catch(x => x)
    expect(invoiceError(e).kind).toBe('network')
  })
  it('anything else keeps its message', async () => {
    const { invoiceError } = await import('./invoices')
    expect(invoiceError(new Error('odd'))).toEqual({ kind: 'other', message: 'odd' })
    expect(invoiceError('weird').kind).toBe('other')
  })
})
