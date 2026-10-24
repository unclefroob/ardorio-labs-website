import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterioInvoice } from '../../api/contract'
import { changes } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
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
  hostedUrl: `https://invoice.stripe.test/${id}`, pdfUrl: null, customerId: 'cus_1', xero: null, xeroContact: null, ...o,
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

  describe('Xero', () => {
    const info = (o: Partial<NonNullable<RosterioInvoice['xero']>> = {}): NonNullable<RosterioInvoice['xero']> => ({ state: 'not_sent', message: '', syncedAt: null, url: null, feeCents: null, payout: null, ...o })
    const XLIST = { ...LIST, invoices: [
      inv('1', { xero: info({ state: 'synced', syncedAt: '2026-10-03T00:00:00Z', url: 'https://go.xero.com/i1', feeCents: 215, payout: 'awaiting' }), xeroContact: { id: 'c1', name: 'Spuntino Pty Ltd' } }),
      inv('2', { customerName: 'Forty Winks', customerId: 'cus_2', xero: info({ state: 'needs-contact' }) }),
      inv('3', { customerName: 'Kaffeehaus', xero: info({ state: 'error', message: 'Account code 999 is not valid' }), xeroContact: { id: 'c3', name: 'Kaffeehaus' } }),
      inv('4', { customerName: 'Drafty', status: 'draft', xero: null }),
    ] }
    const GET = 'GET /sales/rosterio/invoices'
    const openPanel = async (num: string) => { await click(host.querySelector(`[aria-label="Xero details for RS-${num}"]`)); await settle(2) }
    const wait = async (ms = 350) => { await act(async () => { await new Promise(r => setTimeout(r, ms)) }); await settle(3) }

    it('a chip per invoice: its state, and a dash for a draft', async () => {
      fakeApi({ [GET]: json(200, XLIST) })
      await page('ros')
      expect(text()).toContain('In Xero')
      expect(text()).toContain('Choose a contact')
      expect(text()).toContain('Not in Xero')
    })

    it('a synced invoice: contact, fee, payout and a link, with no send button', async () => {
      fakeApi({ [GET]: json(200, XLIST) })
      await page('ros')
      await openPanel('1')
      expect(text()).toContain('Spuntino Pty Ltd')
      expect(text()).toContain('Stripe fee A$2.15')
      expect(text()).toContain('Awaiting payout')
      expect(button(host, 'Send to Xero')).toBeUndefined()
      expect([...host.querySelectorAll('a')].map(a => a.getAttribute('href'))).toContain('https://go.xero.com/i1')
    })

    it('no contact yet: search, pick, and it saves with the customer and contact, then refreshes', async () => {
      const api = fakeApi({
        [GET]: json(200, XLIST),
        'GET /sales/xero/contacts?q=forty': json(200, { contacts: [{ id: 'xc9', name: 'Forty Winks Pty Ltd' }, { id: 'xc8', name: 'Forty Winks Sales' }] }),
        'PUT /sales/xero/stripe-contact': json(200, { contact: { id: 'xc9', name: 'Forty Winks Pty Ltd' } }),
      })
      await page('ros')
      await openPanel('2')
      expect(text()).toContain('No Xero contact yet')
      expect(button(host, 'Send to Xero')).toBeUndefined()
      await type(host.querySelector('[aria-label="Search Xero contacts"]'), 'forty')
      await wait()
      expect(api.count('GET /sales/xero/contacts?q=forty')).toBe(1)
      await click(button(host, 'Forty Winks Pty Ltd'))
      await settle(4)
      expect(api.calls.find(c => c.method === 'PUT')?.body).toEqual({ customerId: 'cus_2', contactId: 'xc9' })
      expect(api.count(GET)).toBe(2)
      expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Xero contact saved')
    })

    it('Retry calls the sync endpoint and refreshes', async () => {
      const api = fakeApi({ [GET]: json(200, XLIST), 'POST /sales/xero/stripe-invoices/3/sync': json(200, inv('3', { xero: info({ state: 'synced' }) })) })
      await page('ros')
      await openPanel('3')
      expect(text()).toContain('Account code 999 is not valid')
      await click(button(host, 'Retry'))
      await settle(4)
      expect(api.count('POST /sales/xero/stripe-invoices/3/sync')).toBe(1)
      expect(api.count(GET)).toBe(2)
      expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Sent to Xero')
    })

    it('a refused send shows the server reason', async () => {
      fakeApi({ [GET]: json(200, XLIST), 'POST /sales/xero/stripe-invoices/3/sync': json(409, { error: 'Already in Xero', code: 'CONFLICT' }) })
      await page('ros')
      await openPanel('3')
      await click(button(host, 'Retry'))
      await settle(4)
      expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Already in Xero')
    })

    it('someone who is not an admin of Ardorio sees the state but no actions', async () => {
      fakeApi({ [GET]: json(200, XLIST) })
      await page('ros', 'manager')
      await openPanel('3')
      expect(text()).toContain('Account code 999 is not valid')
      expect(button(host, 'Retry')).toBeUndefined()
    })
  })
})
