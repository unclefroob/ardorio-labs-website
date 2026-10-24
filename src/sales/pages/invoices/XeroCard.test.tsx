import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { XeroAccountsResponse, XeroSettings, XeroStatus } from '../../api/contract'
import { changes } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../mail/navigate', () => ({ leaveTo: vi.fn() }))

const STATUS = 'GET /sales/xero/status'
const ACCOUNTS = 'GET /sales/xero/accounts'
const SAVE = 'PUT /sales/xero/settings'
const CONNECT = 'POST /sales/xero/connect'
const DISCONNECT = 'POST /sales/xero/disconnect'

const SETTINGS: XeroSettings = { salesAccountCode: '200', paymentAccountCode: '090', gstTaxType: 'OUTPUT', noGstTaxType: 'EXEMPTOUTPUT', autoSync: true, syncFrom: '2026-09-01' }
const status = (over: Partial<XeroStatus> = {}, settings: Partial<XeroSettings> = {}): XeroStatus => ({
  configured: true, connected: true, tenantName: 'Ardorio Pty Ltd', connectedAt: '2026-09-01T00:00:00.000Z', problem: null,
  settings: { ...SETTINGS, ...settings }, counts: { waiting: 2, failed: 1 }, ...over,
})
const ACCTS: XeroAccountsResponse = { sales: [{ code: '200', name: 'Sales' }, { code: '210', name: 'Consulting' }], bank: [{ code: '090', name: 'Business Bank Account' }, { code: '091', name: 'Savings' }] }

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  window.history.replaceState(null, '', '/sales/settings')
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
const toasts = (): string[] => m.ui.UI.get().toasts.map(t => t.msg)

async function show(routes: Parameters<typeof fakeApi>[0]) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, 'admin')
  const api = fakeApi(routes)
  const { XeroCard } = await import('./XeroCard')
  await act(async () => { root.render(<XeroCard />) })
  await settle(8)
  return api
}

describe('Xero card', () => {
  it('is honest when the server has no Xero app: says why, offers no button', async () => {
    await show({ [STATUS]: () => json(200, status({ configured: false, connected: false, settings: null, reason: 'Xero is not set up on the server (XERO_CLIENT_ID)' })) })
    expect(text()).toContain('set up on the server')
    expect(button(host, /Connect/)).toBeUndefined()
  })

  it('not connected: explains what it does and connects by sending the browser to Xero', async () => {
    const api = await show({ [STATUS]: () => json(200, status({ connected: false, settings: null, tenantName: '', connectedAt: null })), [CONNECT]: () => json(200, { url: 'https://login.xero.com/identity/connect/authorize?x=1' }) })
    expect(text()).toContain('Send issued invoices and their payments to Xero')
    expect(text()).toContain('issued before you connect are not sent')
    await click(button(host, 'Connect to Xero'))
    await settle(4)
    expect(api.count(CONNECT)).toBe(1)
    const { leaveTo } = await import('../../mail/navigate')
    expect(leaveTo).toHaveBeenCalledWith('https://login.xero.com/identity/connect/authorize?x=1')
  })

  it('a refused connect shows the server’s words and leaves the button usable', async () => {
    await show({ [STATUS]: () => json(200, status({ connected: false, settings: null })), [CONNECT]: () => json(503, { error: 'Xero is not set up', code: 'NOT_CONFIGURED' }) })
    await click(button(host, 'Connect to Xero'))
    await settle(4)
    expect(button(host, 'Connect to Xero')?.disabled).toBe(false)
    const { leaveTo } = await import('../../mail/navigate')
    expect(leaveTo).not.toHaveBeenCalled()
  })

  it('connected: names the organisation, lists the accounts from Xero and shows the saved choices', async () => {
    await show({ [STATUS]: () => json(200, status()), [ACCOUNTS]: () => json(200, ACCTS) })
    expect(text()).toContain('Connected to Ardorio Pty Ltd')
    expect((field(host, 'Sales account') as HTMLSelectElement).value).toBe('200')
    expect([...(field(host, 'Sales account') as HTMLSelectElement).options].map(o => o.textContent)).toEqual(['Choose an account…', '200 · Sales', '210 · Consulting'])
    expect((field(host, 'Bank account for payments') as HTMLSelectElement).value).toBe('090')
    expect((field(host, 'Tax type with GST') as HTMLSelectElement).value).toBe('OUTPUT')
    expect((field(host, 'Start from') as HTMLInputElement).value).toBe('2026-09-01')
    expect(text()).toContain('2 waiting · 1 to fix')
    expect(button(host, 'Save Xero settings')?.disabled).toBe(true)
  })

  it('a bank account with no code is chosen by its Xero id and saves without a code error', async () => {
    const ID = '3f1c2b7a-5d4e-4a69-9b0c-1e2f3a4b5c6d'
    const api = await show({ [STATUS]: () => json(200, status()), [ACCOUNTS]: () => json(200, { ...ACCTS, bank: [...ACCTS.bank, { code: ID, name: 'Business Trans Acct' }] }), [SAVE]: () => json(200, { settings: { ...SETTINGS, paymentAccountCode: ID } }) })
    await type(field(host, 'Bank account for payments'), ID)
    expect(text()).not.toContain('Up to 10 letters')
    expect([...(field(host, 'Bank account for payments') as HTMLSelectElement).options].map(o => o.textContent)).toContain('Business Trans Acct')
    await click(button(host, 'Save Xero settings'))
    await settle(4)
    expect(api.calls.find(c => `${c.method} ${c.path}` === SAVE)?.body).toEqual({ paymentAccountCode: ID })
  })

  it('saves only what changed', async () => {
    const api = await show({ [STATUS]: () => json(200, status()), [ACCOUNTS]: () => json(200, ACCTS), [SAVE]: () => json(200, { settings: { ...SETTINGS, salesAccountCode: '210' } }) })
    await type(field(host, 'Sales account'), '210')
    expect(button(host, 'Save Xero settings')?.disabled).toBe(false)
    await click(button(host, 'Save Xero settings'))
    await settle(4)
    expect(api.calls.find(c => `${c.method} ${c.path}` === SAVE)?.body).toEqual({ salesAccountCode: '210' })
    expect(toasts()).toContain('Xero settings saved')
    expect(button(host, 'Save Xero settings')?.disabled).toBe(true)
  })

  it('the switch and the tax types are saved too', async () => {
    const api = await show({ [STATUS]: () => json(200, status()), [ACCOUNTS]: () => json(200, ACCTS), [SAVE]: () => json(200, { settings: { ...SETTINGS, autoSync: false, noGstTaxType: 'EXEMPTEXPORT' } }) })
    await click(host.querySelector('[aria-label="Send invoices automatically"]'))
    await type(field(host, 'Tax type without GST'), 'EXEMPTEXPORT')
    expect(text()).toContain('Off. Use Send to Xero on each invoice.')
    await click(button(host, 'Save Xero settings'))
    await settle(4)
    expect(api.calls.find(c => `${c.method} ${c.path}` === SAVE)?.body).toEqual({ autoSync: false, noGstTaxType: 'EXEMPTEXPORT' })
  })

  it('shows the server’s reason when saving is refused, and keeps the edit', async () => {
    await show({ [STATUS]: () => json(200, status()), [ACCOUNTS]: () => json(200, ACCTS), [SAVE]: () => json(400, { error: 'syncFrom must be a date like 2026-07-01', code: 'VALIDATION' }) })
    await type(field(host, 'Sales account'), '210')
    await click(button(host, 'Save Xero settings'))
    await settle(4)
    expect(text()).toContain('syncFrom must be a date like 2026-07-01')
    expect((field(host, 'Sales account') as HTMLSelectElement).value).toBe('210')
  })

  it('asks for the sales account when none is chosen, and for the bank account after it', async () => {
    await show({ [STATUS]: () => json(200, status({}, { salesAccountCode: '' })), [ACCOUNTS]: () => json(200, ACCTS) })
    expect(text()).toContain('Nothing is sent until you do')
    act(() => root.unmount()); root = createRoot(host)
    await show({ [STATUS]: () => json(200, status({}, { paymentAccountCode: '' })), [ACCOUNTS]: () => json(200, ACCTS) })
    expect(text()).toContain('Choose a bank account')
  })

  it('if Xero’s accounts cannot be read, the codes can be typed, and a bad code stops the save', async () => {
    await show({ [STATUS]: () => json(200, status()), [ACCOUNTS]: () => json(502, { error: 'Xero is down', code: 'UPSTREAM_ERROR' }) })
    expect(text()).toContain("Couldn't load Xero accounts")
    const sales = field(host, 'Sales account') as HTMLInputElement
    expect(sales.tagName).toBe('INPUT')
    expect(sales.value).toBe('200')
    await type(sales, 'bad code!')
    expect(text()).toContain('Up to 10 letters, digits, dots or dashes')
    expect(button(host, 'Save Xero settings')?.disabled).toBe(true)
  })

  it('a saved code Xero no longer has is still shown, marked', async () => {
    await show({ [STATUS]: () => json(200, status({}, { salesAccountCode: '999' })), [ACCOUNTS]: () => json(200, ACCTS) })
    expect([...(field(host, 'Sales account') as HTMLSelectElement).options].map(o => o.textContent)).toContain('999 (not in Xero)')
  })

  it('Xero turned the connection down: offers Reconnect, not the settings', async () => {
    await show({ [STATUS]: () => json(200, status({ problem: 'Xero access was revoked or expired. Reconnect Xero.' })), [ACCOUNTS]: () => json(200, ACCTS) })
    expect(button(host, 'Reconnect to Xero')).toBeDefined()
    expect(field(host, 'Sales account')).toBeNull()
  })

  it('disconnecting asks first, and Keep backs out', async () => {
    const api = await show({ [STATUS]: () => json(200, status()), [ACCOUNTS]: () => json(200, ACCTS), [DISCONNECT]: () => json(200, { ok: true }) })
    await click(button(host, 'Disconnect'))
    expect(text()).toContain('Disconnect Xero?')
    expect(api.count(DISCONNECT)).toBe(0)
    await click(button(host, 'Keep'))
    expect(text()).not.toContain('Disconnect Xero?')
    await click(button(host, 'Disconnect'))
    await click(button(host, 'Disconnect'))
    await settle(4)
    expect(api.count(DISCONNECT)).toBe(1)
    expect(toasts()).toContain('Xero disconnected')
  })

  it('a 403 says it is for admins and shows no controls', async () => {
    await show({ [STATUS]: () => json(403, { error: 'no', code: 'ROLE_REQUIRED' }) })
    expect(text()).toContain('limited to admins of the Ardorio business')
    expect(button(host, /Connect/)).toBeUndefined()
  })

  it('the return from Xero is said once, in words, and the address is cleaned', async () => {
    window.history.replaceState(null, '', '/sales/settings?xero=error&reason=choose-one')
    await show({ [STATUS]: () => json(200, status({ connected: false, settings: null })) })
    expect(toasts().join(' ')).toContain('Select only one Xero organisation')
    expect(window.location.search).toBe('')
  })

  it('a good return welcomes you and points at the next step', async () => {
    window.history.replaceState(null, '', '/sales/settings?xero=connected')
    await show({ [STATUS]: () => json(200, status({}, { salesAccountCode: '' })), [ACCOUNTS]: () => json(200, ACCTS) })
    expect(toasts().join(' ')).toContain('Xero connected')
  })
})
