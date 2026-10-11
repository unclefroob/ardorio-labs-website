import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { CLIENT, invoicingWorld, setArdRole, SETTINGS } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const GET = 'GET /sales/invoices/settings'
const PUT = 'PUT /sales/invoices/settings'

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

async function world(role: Parameters<typeof setArdRole>[1] = 'admin', others: Parameters<typeof setArdRole>[2] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, role, others)
}

describe('Settings > Invoicing', () => {
  async function show(routes: Parameters<typeof fakeApi>[0]) {
    await world()
    const api = fakeApi(routes)
    const { InvoicingSettings } = await import('./InvoicingSettings')
    await act(async () => { root.render(<InvoicingSettings />) })
    await settle(6)
    return api
  }

  it('shows the business profile fields the existing settings endpoint returns', async () => {
    await show({ [GET]: () => json(200, SETTINGS) })
    expect((field(host, 'Business name') as HTMLInputElement).value).toBe('Ardorio Labs Pty Ltd')
    expect((field(host, 'ABN') as HTMLInputElement).value).toBe('98 765 432 109')
    expect((field(host, 'Business email') as HTMLInputElement).value).toBe('accounts@ardorio.example')
    expect((field(host, 'BSB') as HTMLInputElement).value).toBe('000-000')
    expect((field(host, 'Account number') as HTMLInputElement).value).toBe('00000000')
    expect((field(host, 'PayID') as HTMLInputElement).value).toBe('payments@ardorio.example')
    expect((field(host, 'Payment terms (days)') as HTMLInputElement).value).toBe('45')
    expect(text()).toContain('Defaults for new invoices')
  })

  it('has a Xero not connected row, and Stripe connected only when the server has a key', async () => {
    await show({ [GET]: () => json(200, SETTINGS) })
    expect(text()).toMatch(/Xero.*Not connected/)
    expect(text()).toMatch(/Stripe card payments.*Connected/)
    act(() => root.unmount())
    root = createRoot(host)
    await show({ [GET]: () => json(200, { ...SETTINGS, stripeConfigured: false }) })
    expect(text()).toMatch(/Stripe card payments.*Not set up/)
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Offer card payment by default"]')?.disabled).toBe(true)
    expect(text()).toContain('Unavailable until card payments are set up')
  })

  it('saves the edited profile and never sends the read-only stripeConfigured field', async () => {
    const api = await show({ [GET]: () => json(200, SETTINGS), [PUT]: () => json(200, { ...SETTINGS, name: 'Ardorio Pty Ltd' }) })
    await type(field(host, 'Business name'), 'Ardorio Pty Ltd')
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Offer card payment by default"]'))
    await click(button(host, 'Save changes'))
    await settle(4)
    const body = api.calls.find(c => `${c.method} ${c.path}` === PUT)?.body as Record<string, unknown>
    expect(body).toMatchObject({ name: 'Ardorio Pty Ltd', gstRegistered: true, offerCardPayments: true, bank: { bsb: '000-000' } })
    expect(body).not.toHaveProperty('stripeConfigured')
  })

  it('checks the fields before calling the server', async () => {
    const api = await show({ [GET]: () => json(200, SETTINGS), [PUT]: () => json(200, SETTINGS) })
    await type(field(host, 'ABN'), '12 34')
    await type(field(host, 'BSB'), '1234')
    await click(button(host, 'Save changes'))
    expect(api.count(PUT)).toBe(0)
    expect(text()).toContain('An ABN is 11 digits')
    expect(text()).toContain('A BSB is 6 digits')
  })

  it('shows the server message when saving fails', async () => {
    await show({ [GET]: () => json(200, SETTINGS), [PUT]: () => json(400, { error: 'Business email is not a valid address', code: 'VALIDATION' }) })
    await click(button(host, 'Save changes'))
    await settle(4)
    expect(text()).toContain('Business email is not a valid address')
  })

  it('a 403 explains it is for Ardorio admins', async () => {
    await show({ [GET]: () => json(403, { error: 'no', code: 'ROLE_REQUIRED' }) })
    expect(text()).toContain('limited to admins of the Ardorio business')
    expect(button(host, 'Save changes')).toBeUndefined()
  })
})

describe('Settings tabs', () => {
  async function tabs(role: Parameters<typeof setArdRole>[1], others: Parameters<typeof setArdRole>[2] = {}, route: Record<string, unknown> = { page: 'settings' }) {
    await world(role, others)
    fakeApi({ [GET]: () => json(200, SETTINGS) })
    const { Settings } = await import('../admin/Settings')
    await act(async () => { root.render(<Settings route={route as never} />) })
    await settle(6)
    return [...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)
  }

  it('an admin of Ardorio gets an Invoicing tab; an admin of another business does not', async () => {
    expect(await tabs('admin')).toContain('Invoicing')
    act(() => root.unmount())
    root = createRoot(host)
    expect(await tabs(null, { ros: 'admin' })).not.toContain('Invoicing')
  })

  it('opens straight on Invoicing from a link', async () => {
    await tabs('admin', {}, { page: 'settings', q: { tab: 'invoicing' } })
    expect(text()).toContain('Business details')
    expect(text()).toContain('How clients pay')
  })

  it('ignores that link for someone who cannot see the tab', async () => {
    await tabs(null, { ros: 'admin' }, { page: 'settings', q: { tab: 'invoicing' } })
    expect(text()).not.toContain('How clients pay')
  })
})

describe('Billing details dialog', () => {
  async function open(client: typeof CLIENT | null, routes: Parameters<typeof fakeApi>[0] = {}, companyId = 'co1') {
    await world()
    const api = fakeApi(routes)
    const onSaved = vi.fn()
    const { BillingDetails } = await import('../../modals/invoices/BillingDetails')
    await act(async () => { root.render(<BillingDetails companyId={companyId} client={client} onSaved={onSaved} />) })
    await settle(6)
    return { api, onSaved }
  }
  const modal = (): HTMLElement => host.querySelector('[role="dialog"]') as HTMLElement

  it('edits the linked billing client', async () => {
    const { api, onSaved } = await open(CLIENT, { 'PUT /sales/invoices/clients/tidewater': () => json(200, { ...CLIENT, billing: { ...CLIENT.billing, email: 'ap@tidewater.example' } }) })
    expect((field(modal(), 'Billing contact') as HTMLInputElement).value).toBe('Priya Raman')
    await type(field(modal(), 'Email'), 'ap@tidewater.example')
    await click(button(modal(), 'Save billing details'))
    await settle(4)
    expect(api.calls.find(c => c.method === 'PUT')?.body).toMatchObject({ clientName: 'Tidewater Foods', billing: { email: 'ap@tidewater.example', abn: '12 345 678 901' } })
    expect(api.calls.some(c => c.path.includes('/link'))).toBe(false)
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ slug: 'tidewater', linkedCompanyId: 'co1' }))
  })

  it('creates a billing client for a company that has none, then links it', async () => {
    const { api, onSaved } = await open(null, {
      'GET /sales/invoices/clients': () => json(200, { clients: [] }),
      'POST /sales/invoices/clients': () => json(200, { slug: 'banksia', clientName: 'Banksia Advisory', billing: { email: 'a@b.co' }, linkedCompanyId: null }),
      'POST /sales/invoices/clients/banksia/link': () => json(200, {}),
    }, 'co2')
    expect((field(modal(), 'Name on invoice') as HTMLInputElement).value).toBe('Banksia Advisory')
    await type(field(modal(), 'Email'), 'a@b.co')
    await click(button(modal(), 'Save billing details'))
    await settle(6)
    const seq = api.calls.map(c => `${c.method} ${c.path}`).filter(k => !k.startsWith('GET'))
    expect(seq).toEqual(['POST /sales/invoices/clients', 'POST /sales/invoices/clients/banksia/link'])
    expect(api.calls.find(c => c.path.endsWith('/link'))?.body).toEqual({ companyId: 'co2' })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ slug: 'banksia', linkedCompanyId: 'co2' }))
  })

  it('offers an unlinked billing client from the old invoicing to link instead of creating a duplicate', async () => {
    const legacy = { slug: 'banksia-old', clientName: 'Banksia (old)', billing: { email: 'old@b.co' }, linkedCompanyId: null }
    const { api } = await open(null, {
      'GET /sales/invoices/clients': () => json(200, { clients: [legacy, CLIENT] }),
      'PUT /sales/invoices/clients/banksia-old': () => json(200, legacy),
      'POST /sales/invoices/clients/banksia-old/link': () => json(200, {}),
    }, 'co2')
    const sel = field(modal(), 'Use an existing billing client') as HTMLSelectElement
    expect([...sel.options].map(o => o.textContent)).toEqual(['Create a new one', 'Banksia (old)'])
    await type(sel, 'banksia-old')
    expect((field(modal(), 'Email') as HTMLInputElement).value).toBe('old@b.co')
    await click(button(modal(), 'Save billing details'))
    await settle(6)
    expect(api.calls.some(c => c.method === 'POST' && c.path === '/sales/invoices/clients')).toBe(false)
    expect(api.calls.some(c => c.path === '/sales/invoices/clients/banksia-old/link')).toBe(true)
  })

  it('does not call the server with a bad email or ABN', async () => {
    const { api } = await open(CLIENT, { 'PUT /sales/invoices/clients/tidewater': () => json(200, CLIENT) })
    await type(field(modal(), 'Email'), 'not-an-email')
    await type(field(modal(), 'ABN'), '123')
    await click(button(modal(), 'Save billing details'))
    expect(api.calls.some(c => c.method === 'PUT')).toBe(false)
    expect(modal().textContent).toContain('not a valid email')
    expect(modal().textContent).toContain('ABN is 11 digits')
  })
})
