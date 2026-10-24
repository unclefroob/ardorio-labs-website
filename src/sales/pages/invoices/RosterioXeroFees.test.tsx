import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterioInvoice, StripeFeePreview } from '../../api/contract'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, invoice, json } from '../../testing/rosterioWorld'

// Choosing the Xero account for each Stripe fee line when sending a paid invoice.

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
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

const text = (): string => host.textContent ?? ''
const FEES = 'GET /sales/xero/stripe-invoices/in_1/fees'
const ACCOUNTS = 'GET /sales/xero/accounts'
const SYNC = 'POST /sales/xero/stripe-invoices/in_1/sync'
const EXPENSE = { sales: [], bank: [], expense: [{ code: '404', name: 'Bank Fees' }, { code: '478', name: 'Merchant Fees' }] }
const preview = (o: Partial<StripeFeePreview> = {}): StripeFeePreview => ({
  lines: [{ key: 'processing', label: 'Processing fee', amountCents: 70501, accountCode: '404' }, { key: 'radar', label: 'Radar Standard', amountCents: 0, accountCode: '404' }],
  taxCents: 7050, totalCents: 77551, locked: false, ...o,
})
const withContact = (o: Partial<RosterioInvoice> = {}): RosterioInvoice => invoice({ xeroContact: { id: 'c1', name: 'Acme' }, xero: { state: 'not_sent', message: '', syncedAt: null, url: null, feeCents: null, payout: null, voidedInXero: false, redoable: false, nextNumber: null }, ...o })
const select = (label: string): HTMLSelectElement => host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
const pick = async (el: HTMLSelectElement, value: string): Promise<void> => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

let m: Sales
const toasts = (): string[] => m.ui.UI.get().toasts.map(t => t.msg)
async function show(inv: RosterioInvoice, canAct = true) {
  m = await loadSales()
  const { RosterioXeroPanel } = await import('./RosterioXeroPanel')
  await act(async () => { root.render(<RosterioXeroPanel invoice={inv} canAct={canAct} onChange={() => undefined} />) })
  await settle(8)
}

describe('RosterioXeroPanel: Stripe fee lines', () => {
  it('shows a row per line with the suggested account, GST and a total', async () => {
    fakeApi({ [FEES]: json(200, preview()), [ACCOUNTS]: json(200, EXPENSE) })
    await show(withContact())
    expect(text()).toContain('Processing fee')
    expect(text()).toContain('A$705.01')
    expect(text()).toContain('GST on fees')
    expect(text()).toContain('Taken from Stripe')
    expect(text()).toContain('A$775.51')
    expect(select('Account for Processing fee').value).toBe('404')
    expect([...select('Account for Processing fee').options].map(o => o.textContent)).toEqual(['404 · Bank Fees', '478 · Merchant Fees'])
    expect(select('Account for Radar Standard').value).toBe('404')
  })

  it('Send is disabled until a non-zero line has an account, then posts the mapping for all lines', async () => {
    const api = fakeApi({
      [FEES]: json(200, preview({ lines: [{ key: 'processing', label: 'Processing fee', amountCents: 70501, accountCode: '' }, { key: 'radar', label: 'Radar Standard', amountCents: 0, accountCode: '' }] })),
      [ACCOUNTS]: json(200, EXPENSE),
      [SYNC]: json(200, withContact()),
    })
    await show(withContact())
    expect(select('Account for Processing fee').options[0].textContent).toBe('Choose an account…')
    expect(button(host, 'Send to Xero')!.disabled).toBe(true)
    await pick(select('Account for Processing fee'), '478')
    expect(button(host, 'Send to Xero')!.disabled).toBe(false)
    await click(button(host, 'Send to Xero'))
    await settle(4)
    expect(api.calls.find(c => c.method === 'POST')?.body).toEqual({ feeAccounts: { processing: '478', radar: '' } })
  })

  it('a preview refusal shows its reason and still sends without a mapping', async () => {
    const api = fakeApi({ [FEES]: json(409, { error: 'Stripe has not settled this payment yet', code: 'CONFLICT' }), [ACCOUNTS]: json(200, EXPENSE), [SYNC]: json(200, withContact()) })
    await show(withContact())
    expect(text()).toContain('Stripe has not settled this payment yet')
    expect(button(host, 'Send to Xero')!.disabled).toBe(false)
    await click(button(host, 'Send to Xero'))
    await settle(4)
    expect(api.calls.find(c => c.method === 'POST')?.body).toEqual({})
  })

  it('a locked fee shows the accounts used, read-only', async () => {
    fakeApi({ [FEES]: json(200, preview({ locked: true, lines: [{ key: 'processing', label: 'Processing fee', amountCents: 70501, accountCode: '478' }] })), [ACCOUNTS]: json(200, EXPENSE) })
    await show(withContact({ xero: { state: 'synced', message: '', syncedAt: null, url: null, feeCents: 77551, payout: null, voidedInXero: false, redoable: false, nextNumber: null } }))
    expect(text()).toContain('Stripe fee A$775.51')
    expect(text()).toContain('Processing fee')
    expect(text()).toContain('478')
    expect(host.querySelector('select')).toBeNull()
  })

  it('an unpaid invoice, or someone who cannot act, makes no preview request', async () => {
    const api = fakeApi({ [FEES]: json(200, preview()), [ACCOUNTS]: json(200, EXPENSE) })
    await show(withContact({ status: 'open' }))
    expect(api.calls).toEqual([])
    act(() => root.unmount())
    root = createRoot(host)
    await show(withContact(), false)
    expect(api.calls).toEqual([])
  })
})

// Voided in Xero: send as a new invoice. Fee and payment wrong: redo them.
const flags = (o: Partial<NonNullable<RosterioInvoice['xero']>>): RosterioInvoice =>
  withContact({ xero: { state: 'synced', message: '', syncedAt: null, url: null, feeCents: null, payout: null, voidedInXero: false, redoable: false, nextNumber: null, ...o } })
const voidedInv = (o: Partial<RosterioInvoice> = {}): RosterioInvoice => ({ ...flags({ state: 'error', voidedInXero: true, nextNumber: 'INV-0042-1', feeCents: 77551 }), ...o })
const redoInv = (): RosterioInvoice => flags({ redoable: true, feeCents: 77551 })
const FEES_REDO = 'GET /sales/xero/stripe-invoices/in_1/fees?redo=1'

describe('RosterioXeroPanel: voided in Xero', () => {
  it('shows the warning, the hint and no Send button; confirm sends mode new-invoice with the chosen accounts', async () => {
    const api = fakeApi({ [FEES]: json(200, preview({ lines: [{ key: 'processing', label: 'Processing fee', amountCents: 70501, accountCode: '404' }] })), [ACCOUNTS]: json(200, EXPENSE), [SYNC]: json(200, withContact()) })
    await show(voidedInv())
    expect(text()).toContain('Voided in Xero.')
    expect(text()).toContain('Creates INV-0042-1 in Xero. The voided invoice stays as it is.')
    expect(button(host, 'Retry')).toBeFalsy()
    await pick(select('Account for Processing fee'), '478')
    await click(button(host, 'Send as a new invoice'))
    expect(api.calls.some(c => c.method === 'POST')).toBe(false)
    await click(button(host, 'Confirm'))
    await settle(4)
    expect(api.calls.find(c => c.method === 'POST')?.body).toEqual({ feeAccounts: { processing: '478' }, mode: 'new-invoice' })
  })

  it('an unpaid voided invoice sends only the mode', async () => {
    const api = fakeApi({ [SYNC]: json(200, withContact()) })
    await show(voidedInv({ status: 'open' }))
    await click(button(host, 'Send as a new invoice'))
    await click(button(host, 'Confirm'))
    await settle(4)
    expect(api.calls.find(c => c.method === 'POST')?.body).toEqual({ mode: 'new-invoice' })
  })

  it('Cancel does nothing', async () => {
    const api = fakeApi({ [FEES]: json(200, preview()), [ACCOUNTS]: json(200, EXPENSE) })
    await show(voidedInv())
    await click(button(host, 'Send as a new invoice'))
    await click(button(host, 'Cancel'))
    expect(button(host, 'Confirm')).toBeFalsy()
    expect(button(host, 'Send as a new invoice')).toBeTruthy()
    expect(api.calls.some(c => c.method === 'POST')).toBe(false)
  })

  it('a refusal shows its text', async () => {
    fakeApi({ [SYNC]: json(409, { error: 'Xero has no free number', code: 'CONFLICT' }) })
    await show(voidedInv({ status: 'open' }))
    await click(button(host, 'Send as a new invoice'))
    await click(button(host, 'Confirm'))
    await settle(4)
    expect(toasts()).toContain('Xero has no free number')
  })

  it('is hidden from someone who cannot act', async () => {
    fakeApi({})
    await show(voidedInv(), false)
    expect(text()).not.toContain('Voided in Xero.')
    expect(text()).not.toContain('Creates INV')
    expect(button(host, 'Send as a new invoice')).toBeFalsy()
  })
})

describe('RosterioXeroPanel: redo payment and fee', () => {
  it('loads the preview with redo, shows editable rows, and sends mode redo with the chosen accounts', async () => {
    const api = fakeApi({
      [FEES]: json(200, preview({ locked: true })),
      [FEES_REDO]: json(200, preview({ lines: [{ key: 'processing', label: 'Processing fee', amountCents: 70501, accountCode: '404' }] })),
      [ACCOUNTS]: json(200, EXPENSE), [SYNC]: json(200, redoInv()),
    })
    await show(redoInv())
    expect(host.querySelector('select')).toBeNull()
    await click(button(host, 'Redo payment and fee'))
    await settle(6)
    expect(api.count(FEES_REDO) > 0).toBe(true)
    expect(text()).toContain('Removes the payment and fee in Xero, then adds them again.')
    await pick(select('Account for Processing fee'), '478')
    await click(button(host, 'Redo in Xero'))
    await settle(4)
    expect(api.calls.find(c => c.method === 'POST')?.body).toEqual({ feeAccounts: { processing: '478' }, mode: 'redo' })
  })

  it('Cancel goes back; a 409 shows its text', async () => {
    fakeApi({ [FEES]: () => json(200, preview({ locked: true })), [FEES_REDO]: () => json(200, preview()), [ACCOUNTS]: () => json(200, EXPENSE), [SYNC]: json(409, { error: 'Reconciled in Xero: unreconcile first', code: 'CONFLICT' }) })
    await show(redoInv())
    await click(button(host, 'Redo payment and fee'))
    await settle(6)
    await click(button(host, 'Cancel'))
    await settle(4)
    expect(button(host, 'Redo payment and fee')).toBeTruthy()
    await click(button(host, 'Redo payment and fee'))
    await settle(6)
    await click(button(host, 'Redo in Xero'))
    await settle(4)
    expect(toasts()).toContain('Reconciled in Xero: unreconcile first')
  })

  it('is hidden from non-admins and from ordinary invoices', async () => {
    fakeApi({ [FEES]: json(200, preview({ locked: true })), [ACCOUNTS]: json(200, EXPENSE) })
    await show(redoInv(), false)
    expect(button(host, 'Redo payment and fee')).toBeFalsy()
    act(() => root.unmount())
    root = createRoot(host)
    await show(flags({ feeCents: 77551 }))
    expect(button(host, 'Redo payment and fee')).toBeFalsy()
    expect(button(host, 'Send as a new invoice')).toBeFalsy()
  })
})
