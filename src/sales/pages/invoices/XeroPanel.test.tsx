import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceXeroInfo, XeroStatus } from '../../api/contract'
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

const STATUS = 'GET /sales/xero/status'
const SYNC = 'POST /sales/invoices/i1/xero/sync'
const connected: XeroStatus = {
  configured: true, connected: true, tenantName: 'Ardorio Pty Ltd', connectedAt: '2026-09-01T00:00:00.000Z', problem: null, counts: { waiting: 0, failed: 0 }, bankScope: true,
  settings: { salesAccountCode: '200', paymentAccountCode: '090', gstTaxType: 'OUTPUT', noGstTaxType: 'EXEMPTOUTPUT', autoSync: true, syncFrom: '2026-09-01', stripeSync: false, stripeFrom: '', clearingAccountCode: '', feeAccountCode: '', feeTaxType: 'INPUT' },
}
const x = (over: Partial<InvoiceXeroInfo>): InvoiceXeroInfo => ({ state: 'synced', message: '', syncedAt: '2026-10-04T00:00:00.000Z', url: 'https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=abc', ...over })

let host: HTMLDivElement
let root: Root
let m: Sales
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const text = (): string => host.textContent ?? ''

async function show(inv: ReturnType<typeof dto>, routes: Parameters<typeof fakeApi>[0], onChange = vi.fn()) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, 'admin')
  const api = fakeApi(routes)
  const { XeroPanel } = await import('./XeroPanel')
  await act(async () => { root.render(<XeroPanel invoice={inv} onChange={onChange} />) })
  await settle(6)
  return { api, onChange }
}

describe('Xero panel on an invoice', () => {
  it('synced: In Xero, with a safe link to it and no button', async () => {
    await show(dto({ xero: x({}) }), { [STATUS]: () => json(200, connected) })
    expect(text()).toContain('In Xero')
    const a = host.querySelector<HTMLAnchorElement>('a')
    expect(a?.textContent).toBe('Open in Xero')
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a?.getAttribute('target')).toBe('_blank')
    expect(button(host, /Send to Xero|Retry/)).toBeUndefined()
  })

  it('shows nothing at all for a draft (the server sends no Xero state)', async () => {
    await show(dto({ status: 'draft', xero: null }), { [STATUS]: () => json(200, connected) })
    expect(text()).toBe('')
  })

  it('error: shows Xero’s reason and Retry; Retry sends and shows the new state', async () => {
    const synced = dto({ xero: x({}) })
    const { api, onChange } = await show(dto({ xero: x({ state: 'error', message: "Xero: Account code '999' is not a valid code", url: null }) }), { [STATUS]: () => json(200, connected), [SYNC]: () => json(200, synced) })
    expect(text()).toContain("Xero: Account code '999' is not a valid code")
    await click(button(host, 'Retry'))
    await settle(4)
    expect(api.count(SYNC)).toBe(1)
    expect(onChange).toHaveBeenCalledWith(synced)
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Sent to Xero')
  })

  it('a retry that fails again says so, and still shows the invoice', async () => {
    const still = dto({ xero: x({ state: 'error', message: 'Xero: still wrong', url: null }) })
    const { onChange } = await show(dto({ xero: x({ state: 'error', message: 'Xero: wrong', url: null }) }), { [STATUS]: () => json(200, connected), [SYNC]: () => json(200, still) })
    await click(button(host, 'Retry'))
    await settle(4)
    expect(onChange).toHaveBeenCalledWith(still)
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Xero rejected the invoice')
  })

  it('a refusal from the server (409 with its reason) is shown as a toast, nothing is replaced', async () => {
    const { onChange } = await show(dto({ xero: x({ state: 'not_sent', url: null, syncedAt: null }), sentAt: '2026-08-01T00:00:00.000Z', issueDate: '2026-08-01' }), { [STATUS]: () => json(200, connected), [SYNC]: () => json(409, { error: 'Set a sales account in Settings > Invoicing', code: 'CONFLICT' }) })
    expect(text()).toContain('Issued before the start date (2026-09-01)')
    await click(button(host, 'Send to Xero'))
    await settle(4)
    expect(onChange).not.toHaveBeenCalled()
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Set a sales account in Settings > Invoicing')
  })

  it('never sent and Xero not connected: says so without a button', async () => {
    await show(dto({ xero: x({ state: 'not_sent', url: null, syncedAt: null }) }), { [STATUS]: () => json(200, { ...connected, connected: false, settings: null }) })
    expect(text()).toContain('Xero is not connected')
    expect(button(host, /Send to Xero|Retry/)).toBeUndefined()
  })

  it('if the connection cannot be read, an invoice that never went says nothing rather than guess', async () => {
    await show(dto({ xero: x({ state: 'not_sent', url: null, syncedAt: null }) }), { [STATUS]: () => json(500, { error: 'x', code: 'INTERNAL' }) })
    expect(text()).toBe('')
  })
})
