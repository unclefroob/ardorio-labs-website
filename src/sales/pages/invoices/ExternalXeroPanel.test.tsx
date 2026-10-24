import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceDto, RosterioInvoice } from '../../api/contract'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { dto, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const text = (): string => host.textContent ?? ''
const GET = 'GET /sales/invoices/x1/xero/stripe'
const POST = 'POST /sales/invoices/x1/xero/stripe-link'
const EXT = { source: 'stripe' as never, reference: 'AIQGCIEQ-0002', recordedBy: 'Ryan', recordedAt: '2026-10-09T02:00:00.000Z' }
const ext = (): InvoiceDto => dto({ id: 'x1', invoiceNumber: 'EXT:stripe:AIQGCIEQ-0002:ab12cd34', source: 'external', external: EXT, status: 'sent', payment: null })
const stripe = (o: Partial<RosterioInvoice> = {}): RosterioInvoice => ({
  id: 'in_1', number: 'AIQGCIEQ-0002', accountId: 'acc1', companyId: null, customerName: 'Spuntino', status: 'paid', failed: false, overdue: false,
  amountDueCents: 9900, amountPaidCents: 9900, amountRemainingCents: 0, currency: 'aud', createdAt: '2026-10-01T00:00:00Z', dueAt: null, paidAt: '2026-10-02T00:00:00Z',
  periodStart: null, periodEnd: null, attemptCount: 1, nextAttemptAt: null, lastError: null, hostedUrl: null, pdfUrl: null, customerId: 'cus_1', xero: null, xeroContact: null, ...o,
})

async function show(routes: Parameters<typeof fakeApi>[0], opts: { role?: 'admin' | 'manager'; invoice?: InvoiceDto } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, opts.role ?? 'admin')
  const api = fakeApi(routes)
  const { ExternalXeroPanel } = await import('./ExternalXeroPanel')
  const canAct = (opts.role ?? 'admin') === 'admin'
  await act(async () => { root.render(<ExternalXeroPanel invoice={opts.invoice ?? ext()} canAct={canAct} />) })
  await settle(8)
  return api
}

describe('ExternalXeroPanel', () => {
  it('not linked yet: offers Find in Stripe, with no lookup until clicked', async () => {
    const api = await show({ [GET]: json(200, { linked: null }) })
    expect(text()).toContain('Find this invoice in Stripe to send it to Xero.')
    expect(button(host, 'Find in Stripe')).toBeDefined()
    expect(api.count(POST)).toBe(0)
  })

  it('Find in Stripe posts, reloads and shows the Xero panel with the contact search', async () => {
    let linked = false
    const api = await show({ [GET]: () => json(200, { linked: linked ? stripe() : null }), [POST]: () => { linked = true; return json(200, stripe()) } })
    await click(button(host, 'Find in Stripe'))
    await settle(8)
    expect(api.count(POST)).toBe(1)
    expect(api.count(GET)).toBe(2)
    expect(button(host, 'Find in Stripe')).toBeUndefined()
    expect(host.querySelector('[aria-label="Search Xero contacts"]')).not.toBeNull()
    expect(button(host, 'Close')).toBeUndefined()
  })

  it('a 409 shows its reason and stays unlinked', async () => {
    await show({ [GET]: json(200, { linked: null }), [POST]: json(409, { error: 'No Stripe invoice has the number AIQGCIEQ-0002', code: 'CONFLICT' }) })
    await click(button(host, 'Find in Stripe'))
    await settle(6)
    expect(text()).toContain('No Stripe invoice has the number AIQGCIEQ-0002')
    expect(button(host, 'Find in Stripe')).toBeDefined()
  })

  it('already linked: shows the panel straight away, and sends to Xero from it', async () => {
    const api = await show({
      [GET]: json(200, { linked: stripe({ xeroContact: { id: 'xc1', name: 'Spuntino Pty Ltd' }, xero: { state: 'waiting', text: '' } as never }) }),
    })
    expect(button(host, 'Find in Stripe')).toBeUndefined()
    expect(text()).toContain('Spuntino Pty Ltd')
    expect(api.count(POST)).toBe(0)
  })

  it('non-admin sees nothing and nothing is requested', async () => {
    const api = await show({ [GET]: json(200, { linked: null }) }, { role: 'manager' })
    expect(host.textContent).toBe('')
    expect(api.calls).toEqual([])
  })
})

describe('InvoiceView placement', () => {
  const view = async (inv: InvoiceDto) => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    const api = fakeApi({ [`GET /sales/invoices/${inv.id}`]: json(200, inv), [`GET /sales/invoices/${inv.id}/xero/stripe`]: json(200, { linked: null }), 'GET /sales/xero/status': json(404, { error: 'x', code: 'NOT_FOUND' }) })
    const { Invoice } = await import('./Invoice')
    await act(async () => { root.render(<Invoice route={{ page: 'invoice', id: inv.id }} />) })
    await settle(8)
    return api
  }
  it('an external record shows it, and never the normal Xero panel', async () => {
    const api = await view(ext())
    expect(button(host, 'Find in Stripe')).toBeDefined()
    expect(api.count('GET /sales/xero/status')).toBe(0)
  })
  it('a normal invoice does not show it', async () => {
    const api = await view(dto({ id: 'n1' }))
    expect(button(host, 'Find in Stripe')).toBeUndefined()
    expect(api.calls.some(c => c.path.includes('/xero/stripe'))).toBe(false)
  })
})
