import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterioInvoice } from '../../api/contract'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { invoicingWorld, setArdRole, SUMMARY } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

// Who has paid for Rosterio, from Stripe: the Invoices page in Rosterio's workspace, tabs in All businesses.

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
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const thisMonth = new Date().toISOString().slice(0, 7)
const inv = (id: string, o: Partial<RosterioInvoice> = {}): RosterioInvoice => ({
  id, number: `RS-${id}`, accountId: 'acc1', companyId: null, customerName: 'Spuntino', status: 'paid', failed: false, overdue: false,
  amountDueCents: 9900, amountPaidCents: 9900, amountRemainingCents: 0, currency: 'aud', createdAt: `${thisMonth}-01T00:00:00Z`, dueAt: null,
  paidAt: `${thisMonth}-02T00:00:00Z`, periodStart: null, periodEnd: null, attemptCount: 1, nextAttemptAt: null, lastError: null,
  hostedUrl: `https://invoice.stripe.test/${id}`, pdfUrl: null, ...o,
})
const LIST = { configured: true, syncedAt: new Date().toISOString(), syncError: null, invoices: [
  inv('1'),
  inv('2', { customerName: 'Forty Winks', status: 'open', failed: true, amountPaidCents: 0, amountRemainingCents: 4900, amountDueCents: 4900, paidAt: null, nextAttemptAt: '2026-10-20T00:00:00Z' }),
  inv('3', { customerName: 'Kaffeehaus', status: 'open', overdue: true, amountPaidCents: 0, amountRemainingCents: 2000, amountDueCents: 2000, paidAt: null, dueAt: '2026-10-01T00:00:00Z' }),
] }

async function page(ws: 'ros' | 'all', ardRole: Parameters<typeof setArdRole>[1] = 'admin') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, ardRole, { ros: 'admin' })
  const { Act } = await import('../../data/Act')
  Act.setSession({ ws })
  const { Invoices } = await import('./Invoices')
  await act(async () => { root.render(<Invoices />) })
  await settle(6)
}
const text = (): string => host.textContent ?? ''

describe('Rosterio invoices', () => {
  it('in Rosterio\'s workspace: what was collected, what is owing, failed cards first-class, each with its Stripe page', async () => {
    fakeApi({ 'GET /sales/rosterio/invoices': json(200, LIST) })
    await page('ros')
    expect(text()).toContain('Rosterio subscriptions, as Stripe has them')
    expect(text()).toContain('A$99.00') // collected this month
    expect(text()).toContain('A$69.00') // outstanding: 49 + 20
    expect(text()).toContain('Payment failed · retry')
    expect(text()).toContain('Overdue')
    expect([...host.querySelectorAll('a')].map(a => a.getAttribute('href'))).toContain('https://invoice.stripe.test/1')
    await click([...host.querySelectorAll('button')].find(b => b.textContent?.startsWith('Payment failed'))!)
    expect(text()).toContain('Forty Winks')
    expect(text()).not.toContain('Kaffeehaus')
  })

  it('Check Stripe now asks the server to look, then shows what it found', async () => {
    const api = fakeApi({ 'GET /sales/rosterio/invoices': json(200, LIST), 'POST /sales/rosterio/invoices/sync': json(200, { invoices: 3, syncedAt: new Date().toISOString(), error: null }) })
    await page('ros')
    await click(button(host, 'Check Stripe now'))
    await settle(4)
    expect(api.count('POST /sales/rosterio/invoices/sync')).toBe(1)
    expect(api.count('GET /sales/rosterio/invoices')).toBe(2)
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('3 invoices checked')
  })

  it('says plainly when Stripe is not connected, rather than showing an empty list as if nobody owed anything', async () => {
    fakeApi({ 'GET /sales/rosterio/invoices': json(200, { configured: false, syncedAt: null, syncError: null, invoices: [] }) })
    await page('ros')
    expect(text()).toContain('Stripe or Rosterio is not connected on the server')
  })

  it('in All businesses, an admin of both gets a tab each', async () => {
    fakeApi({ 'GET /sales/rosterio/invoices': json(200, LIST), 'GET /sales/invoices': json(200, { invoices: [] }), 'GET /sales/invoices/summary': json(200, SUMMARY) })
    await page('all')
    const tabs = [...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)
    expect(tabs.some(t => t?.startsWith('Ardorio'))).toBe(true)
    expect(tabs.some(t => t?.includes('(Stripe)'))).toBe(true)
  })
})
