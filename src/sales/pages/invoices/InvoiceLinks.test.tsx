import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingClient, InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { CLIENT, dto, invoicingWorld, setArdRole, SETTINGS } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const SET = 'GET /sales/invoices/settings'
const CLIENTS = 'GET /sales/invoices/clients'
const GET1 = 'GET /sales/invoices/i1'
const PUT1 = 'PUT /sales/invoices/i1'
const LINKS1 = 'PUT /sales/invoices/i1/links'
const ISSUE1 = 'POST /sales/invoices/i1/issue'
const LINK = 'POST /sales/invoices/clients/test-client/link'
const DEAL_LIST = 'GET /sales/invoices?dealId=dl1'

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
  vi.restoreAllMocks()
})

const text = (): string => host.textContent ?? ''
const modal = (): HTMLElement | null => host.querySelector('[role="dialog"]')
const customer = (): HTMLSelectElement => field(host, 'Customer (CRM company)') as HTMLSelectElement
const deal = (): HTMLSelectElement => field(host, 'Deal (optional)') as HTMLSelectElement
const milestone = (): HTMLSelectElement => field(host, 'Milestone') as HTMLSelectElement
/** The error shown under a labelled field, if any. */
const fieldErr = (label: string): string => (field(host, label)?.closest('.fld')?.querySelector('.err')?.textContent ?? '')

const PLAN = { id: 'bp_dl1', dealId: 'dl1', businessId: 'ard', milestones: [
  { id: 'm1', label: 'Milestone 1: discovery', amountCents: 960000 },
  { id: 'm2', label: 'Milestone 2: core platform', amountCents: 1800000 },
] }

/** The owner's screenshot: INV-0001, issued and overdue, billed to Test Client, which no CRM company is linked to. */
const UNLINKED: InvoiceDto = dto({
  id: 'i1', invoiceNumber: 'INV-0001', clientSlug: 'test-client', clientName: 'Test Client', companyId: null, dealId: null, milestoneId: null,
  overdue: true, dueDate: '2026-10-01', issueDate: '2026-08-17', offerCardPayment: true,
  paymentLinkUrl: 'https://buy.stripe.com/auto', paymentLinkIsAutomatic: true,
  lineItems: [{ description: 'Website build', detail: '', qty: 1, unitPriceCents: 500000, amountCents: 500000 }], subtotalCents: 500000, gstCents: 50000, totalCents: 550000,
})
const TEST_CLIENT: BillingClient = { slug: 'test-client', clientName: 'Test Client', linkedCompanyId: null, billing: { email: 'ap@test.example', contactName: 'Sam', abn: '', address: '' } }

async function show(routes: Parameters<typeof fakeApi>[0], opts: { plans?: boolean } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld(opts.plans ? { billingPlans: [rec('bp_dl1', PLAN)] } : {}))
  setArdRole(m, 'admin')
  const api = fakeApi({ [SET]: () => json(200, SETTINGS), [DEAL_LIST]: () => json(200, { invoices: [] }), ...routes })
  const { Invoice } = await import('./Invoice')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><Invoice route={{ page: 'invoice', id: 'i1' } as never} /><Hosts /></>) })
  await settle(10)
  return api
}
const edit = async (): Promise<void> => { await click(button(host, 'Edit and reissue')); await settle(8) }
const bodyOf = (api: Awaited<ReturnType<typeof show>>, key: string): unknown => api.calls.find(c => `${c.method} ${c.path}` === key)?.body
const putBody = (api: Awaited<ReturnType<typeof show>>): unknown => bodyOf(api, PUT1)
const linksBody = (api: Awaited<ReturnType<typeof show>>): unknown => bodyOf(api, LINKS1)
const writes = (api: Awaited<ReturnType<typeof show>>): string[] => api.calls.filter(c => c.method !== 'GET').map(c => `${c.method} ${c.path}`)
const NOTE = (co: string): string => `This invoice stays addressed to Test Client; it is only linked to ${co} in SalesOS.`

describe('an issued invoice billed to a client with no CRM company (the screenshot)', () => {
  it('says so on the view, and in the editor the customer picker can be used, with copy that matches', async () => {
    await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }) })
    expect(text()).toContain('Not linked to a CRM company. Choose it under Edit and reissue')
    await edit()
    expect(customer().disabled).toBe(false)
    expect(customer().value).toBe('')
    expect(deal().disabled).toBe(true)
    expect(milestone().disabled).toBe(true)
    expect([...milestone().options].map(o => o.textContent)).toEqual(['Choose a deal first'])
    expect(text()).toContain('Billed to Test Client, which is not linked to a CRM company. Choose the company to link it.')
    expect(text()).toContain('Saving a change to the customer, deal or milestone alone does not reissue the invoice.')
  })

  it('keeps the picker locked, without the "choose" hint, until the billing clients have loaded', async () => {
    let release: (r: Response) => void = () => undefined
    await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => new Promise<Response>(r => { release = r }) })
    await edit()
    expect(customer().disabled).toBe(true)
    expect(text()).toContain('Checking which company it is linked to')
    expect(text()).not.toContain('Choose the company to link it')
    await act(async () => { release(json(200, { clients: [TEST_CLIENT] })) })
    await settle(6)
    expect(customer().disabled).toBe(false)
    expect(text()).toContain('Choose the company to link it')
  })

  it('a client list that fails to load says the company can’t be chosen yet, and retries', async () => {
    let n = 0
    const api = await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => (++n === 1 ? json(500, { error: 'boom', code: 'INTERNAL' }) : json(200, { clients: [TEST_CLIENT] })) })
    await edit()
    expect(customer().disabled).toBe(true)
    expect(text()).toContain('The billing clients could not be loaded, so a company can’t be chosen yet.')
    expect(text()).not.toContain('Choose the company to link it')
    await click(button(host, 'Try again'))
    await settle(6)
    expect(api.count(CLIENTS)).toBe(2)
    expect(customer().disabled).toBe(false)
  })

  it('a company billed as a different client is set directly, with a note, and Save changes writes only the links', async () => {
    // Ritchies in production: Tidewater Foods (co1) already bills as its own client, tidewater.
    const saved = { ...UNLINKED, companyId: 'co1', dealId: 'dl1', milestoneId: 'm2' }
    const api = await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }), [LINKS1]: () => json(200, saved) }, { plans: true })
    await edit()
    await type(customer(), 'co1')
    expect(customer().value).toBe('co1')
    expect(fieldErr('Customer (CRM company)')).toBe('')
    expect(customer().getAttribute('aria-invalid')).toBeNull()
    expect(text()).toContain(NOTE('Tidewater Foods'))
    // No offer to link Test Client: the company already has a billing client.
    expect(text()).not.toContain('Link billing client')
    expect(button(host, 'Link this invoice only')).toBeUndefined()
    // Tidewater's own billing details are not shown as this invoice's, and nothing asks to add details.
    expect(text()).not.toContain('Edit billing details')
    expect(text()).not.toContain('Add billing details')
    await type(deal(), 'dl1')
    await settle(6)
    await type(milestone(), 'm2')
    // The issued invoice keeps its own lines: a milestone does not overwrite them.
    expect((host.querySelector('[aria-label="Description line 1"]') as HTMLInputElement).value).toBe('Website build')
    await click(button(host, 'Save changes'))
    await settle(8)
    // Only the links route: no full PUT, no reissue, no billing-client link.
    expect(writes(api)).toEqual([LINKS1])
    expect(linksBody(api)).toEqual({ companyId: 'co1', dealId: 'dl1', milestoneId: 'm2' })
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Saved. Nothing was reissued.')
    // Now it has a company, which an issued invoice keeps; the note stays.
    expect(customer().disabled).toBe(true)
    expect(text()).toContain(NOTE('Tidewater Foods'))
  })
})

describe('(b) a company with no billing client', () => {
  it('asks inline, links Test Client to it, then Save changes sends only the link to the links route and never reissues', async () => {
    let clients = [TEST_CLIENT, CLIENT]
    const saved = { ...UNLINKED, companyId: 'co2' }
    const api = await show({
      [GET1]: () => json(200, UNLINKED),
      [CLIENTS]: () => json(200, { clients }),
      [LINK]: () => { clients = [{ ...TEST_CLIENT, linkedCompanyId: 'co2' }, CLIENT]; return json(200, { ...TEST_CLIENT, linkedCompanyId: 'co2' }) },
      [LINKS1]: () => json(200, saved),
      [ISSUE1]: () => json(200, saved),
    })
    await edit()
    await type(customer(), 'co2')
    // An inline confirm, not a dialog, and nothing is written yet.
    expect(modal()).toBeNull()
    expect(text()).toContain('Link billing client Test Client to Banksia Advisory? Future invoices to Test Client will be on this company.')
    expect(button(host, 'Link this invoice only')).toBeDefined()
    expect(api.count(LINK)).toBe(0)
    expect(customer().value).toBe('')
    expect(document.activeElement).toBe(button(host, 'Link billing client'))
    await click(button(host, 'Link billing client'))
    await settle(6)
    expect(api.calls.find(c => `${c.method} ${c.path}` === LINK)?.body).toEqual({ companyId: 'co2' })
    expect(customer().value).toBe('co2')
    expect(text()).not.toContain('Link billing client Test Client')
    // Linked for real now, so the invoice is not "only linked".
    expect(text()).not.toContain('This invoice stays addressed to')

    await click(button(host, 'Save changes'))
    await settle(8)
    expect(writes(api)).toEqual([LINK, LINKS1])
    expect(linksBody(api)).toEqual({ companyId: 'co2' })
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Saved. Nothing was reissued.')
    expect(customer().disabled).toBe(true)
    expect(text()).toContain('The customer of an issued invoice can’t be changed.')
    expect(deal().disabled).toBe(false)
  })

  it('Link this invoice only sets the company without linking Test Client, with the note', async () => {
    const api = await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }), [LINKS1]: () => json(200, { ...UNLINKED, companyId: 'co2' }) })
    await edit()
    await type(customer(), 'co2')
    await click(button(host, 'Link this invoice only'))
    await settle(4)
    expect(customer().value).toBe('co2')
    expect(text()).not.toContain('Link billing client Test Client')
    expect(text()).toContain(NOTE('Banksia Advisory'))
    expect(text()).not.toContain('Add billing details')
    await click(button(host, 'Save changes'))
    await settle(8)
    expect(writes(api)).toEqual([LINKS1])
    expect(linksBody(api)).toEqual({ companyId: 'co2' })
  })

  it('Keep unlinked leaves everything as it was', async () => {
    const api = await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }) })
    await edit()
    await type(customer(), 'co2')
    await click(button(host, 'Keep unlinked'))
    expect(text()).not.toContain('Link billing client Test Client')
    expect(customer().value).toBe('')
    expect(api.count(LINK)).toBe(0)
    // Still in the editor: the confirm's button is not the editor's Cancel.
    expect(button(host, 'Save changes')).toBeDefined()
  })

  it('a refused link is shown under the customer picker and nothing is chosen', async () => {
    const api = await show({
      [GET1]: () => json(200, UNLINKED),
      [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }),
      [LINK]: () => json(409, { error: 'That billing client is already linked to another company', code: 'CONFLICT', details: { linkedElsewhere: true } }),
    })
    await edit()
    await type(customer(), 'co2')
    await click(button(host, 'Link billing client'))
    await settle(6)
    expect(fieldErr('Customer (CRM company)')).toBe('That billing client is already linked to another company')
    expect(customer().value).toBe('')
    expect(api.count(LINKS1)).toBe(0)
    expect(api.count(PUT1)).toBe(0)
  })
})

describe('(a) the company Test Client is already linked to', () => {
  const linked = { ...TEST_CLIENT, linkedCompanyId: 'co1' }

  it('the hint names it; picking it sets it with no confirm and no note, then its deal and milestone are saved through the links route', async () => {
    const saved = { ...UNLINKED, companyId: 'co1', dealId: 'dl1', milestoneId: 'm2' }
    const api = await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [linked] }), [LINKS1]: () => json(200, saved) }, { plans: true })
    await edit()
    expect(text()).toContain('Billed to Test Client, which is linked to Tidewater Foods. Choose Tidewater Foods to put this invoice on it.')
    await type(customer(), 'co1')
    expect(text()).not.toContain('Link billing client')
    expect(text()).not.toContain('This invoice stays addressed to')
    expect(customer().value).toBe('co1')
    expect([...deal().options].map(o => o.textContent)).toEqual(['No deal', 'Platform build, phase 2'])
    await type(deal(), 'dl1')
    await settle(6)
    expect(milestone().disabled).toBe(false)
    await type(milestone(), 'm2')
    await click(button(host, 'Save changes'))
    await settle(8)
    expect(writes(api)).toEqual([LINKS1])
    expect(linksBody(api)).toEqual({ companyId: 'co1', dealId: 'dl1', milestoneId: 'm2' })
  })

  it('picking another company is refused inline, because Test Client already belongs to Tidewater Foods', async () => {
    const api = await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [linked, { ...CLIENT, linkedCompanyId: null }] }) })
    await edit()
    await type(customer(), 'co2')
    expect(fieldErr('Customer (CRM company)')).toBe('Test Client is already linked to Tidewater Foods. Choose Tidewater Foods, or change the billing link on the company first.')
    expect(customer().getAttribute('aria-invalid')).toBe('true')
    expect(customer().value).toBe('')
    expect(text()).not.toContain('Link billing client')
    expect(button(host, 'Link this invoice only')).toBeUndefined()
    expect(api.count(LINK)).toBe(0)
    // Picking an allowed one clears the message.
    await type(customer(), 'co1')
    expect(fieldErr('Customer (CRM company)')).toBe('')
  })
})

describe('server refusals land on the right picker', () => {
  it('a VALIDATION naming milestoneId is shown under Milestone, not as a page banner', async () => {
    const linked = { ...TEST_CLIENT, linkedCompanyId: 'co1' }
    await show({
      [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [linked] }),
      [LINKS1]: () => json(400, { error: 'That milestone is not on the billing plan of the deal', code: 'VALIDATION', details: { field: 'milestoneId' } }),
    }, { plans: true })
    await edit()
    await type(customer(), 'co1')
    await type(deal(), 'dl1')
    await settle(6)
    await type(milestone(), 'm1')
    await click(button(host, 'Save changes'))
    await settle(8)
    expect(fieldErr('Milestone')).toBe('That milestone is not on the billing plan of the deal')
    expect(fieldErr('Customer (CRM company)')).toBe('')
    expect(host.querySelector('.banner.bad')).toBeNull()
  })

  it('a VALIDATION naming companyId is shown under Customer', async () => {
    const api = await show({
      [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }),
      [LINKS1]: () => json(400, { error: 'This invoice\'s billing client is linked to another company: the invoice can only be linked to that company', code: 'VALIDATION', details: { field: 'companyId' } }),
    })
    await edit()
    await type(customer(), 'co1')
    await click(button(host, 'Save changes'))
    await settle(8)
    expect(fieldErr('Customer (CRM company)')).toBe('This invoice\'s billing client is linked to another company: the invoice can only be linked to that company')
    expect(api.count(PUT1)).toBe(0)
  })
})

describe('an issued invoice that has a company', () => {
  it('keeps the company locked but lets the deal and milestone change, sending only those to the links route', async () => {
    const withCo = { ...UNLINKED, clientSlug: 'tidewater', clientName: 'Tidewater Foods', companyId: 'co1' }
    const api = await show({ [GET1]: () => json(200, withCo), [CLIENTS]: () => json(200, { clients: [CLIENT] }), [LINKS1]: () => json(200, { ...withCo, dealId: 'dl1', milestoneId: 'm1' }) }, { plans: true })
    await edit()
    expect(customer().disabled).toBe(true)
    expect(text()).toContain('The customer of an issued invoice can’t be changed.')
    expect(text()).not.toContain('Choose the company')
    expect(text()).not.toContain('This invoice stays addressed to')
    expect(deal().disabled).toBe(false)
    await type(deal(), 'dl1')
    await settle(6)
    await type(milestone(), 'm1')
    await click(button(host, 'Save changes'))
    await settle(8)
    expect(writes(api)).toEqual([LINKS1])
    // The unchanged company is not sent, so it is not validated again.
    expect(linksBody(api)).toEqual({ dealId: 'dl1', milestoneId: 'm1' })
  })

  it('editing anything besides the links still saves the whole form with the full PUT, as before', async () => {
    const linked = { ...TEST_CLIENT, linkedCompanyId: 'co1' }
    const api = await show({ [GET1]: () => json(200, UNLINKED), [CLIENTS]: () => json(200, { clients: [linked] }), [PUT1]: () => json(200, UNLINKED) })
    await edit()
    await type(customer(), 'co1')
    await type(host.querySelector('[aria-label="Unit price line 1"]'), '6000')
    await click(button(host, 'Save changes'))
    await settle(8)
    expect(putBody(api)).toMatchObject({ companyId: 'co1', paymentLinkUrl: 'https://buy.stripe.com/auto', lineItems: [{ unitPriceCents: 600000 }] })
    expect(api.count(LINKS1)).toBe(0)
    expect(api.count(ISSUE1)).toBe(0)
  })
})

describe('a paid invoice', () => {
  const paid: InvoiceDto = { ...UNLINKED, status: 'paid', overdue: false, payment: { method: 'bank-transfer', paidAt: '2026-10-06', amountCents: 550000, reference: '' } }

  it('stays read-only but its links can be set with Edit links, on a company billed as another client, through the links route only', async () => {
    const saved = { ...paid, companyId: 'co1', dealId: 'dl1', milestoneId: 'm1' }
    const api = await show({ [GET1]: () => json(200, paid), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }), [LINKS1]: () => json(200, saved) }, { plans: true })
    expect(text()).toContain('This invoice is paid, so it is read-only.')
    expect(text()).toContain('Not linked to a CRM company. Choose it with Edit links: the paid invoice itself does not change.')
    expect(button(host, 'Edit and reissue')).toBeUndefined()
    expect(field(host, 'Customer (CRM company)')).toBeNull()
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([])

    await click(button(host, 'Edit links'))
    await settle(6)
    expect(customer().disabled).toBe(false)
    expect((button(host, 'Save links') as HTMLButtonElement).disabled).toBe(true)
    await type(customer(), 'co1')
    expect(text()).toContain(NOTE('Tidewater Foods'))
    expect(text()).not.toContain('Link billing client')
    await type(deal(), 'dl1')
    await settle(6)
    await type(milestone(), 'm1')
    await click(button(host, 'Save links'))
    await settle(8)
    expect(writes(api)).toEqual([LINKS1])
    expect(linksBody(api)).toEqual({ companyId: 'co1', dealId: 'dl1', milestoneId: 'm1' })
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Links saved. Nothing else on the invoice changed.')
    // Back on the view, which shows the company it is now on.
    expect(field(host, 'Customer (CRM company)')).toBeNull()
    expect(text()).not.toContain('Not linked to a CRM company')
    expect(text()).toContain('Tidewater Foods')
  })

  it('a company with no billing client offers the optional link and Link this invoice only', async () => {
    const api = await show({ [GET1]: () => json(200, paid), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }), [LINKS1]: () => json(200, { ...paid, companyId: 'co2' }) })
    await click(button(host, 'Edit links'))
    await settle(6)
    await type(customer(), 'co2')
    expect(text()).toContain('Link billing client Test Client to Banksia Advisory?')
    await click(button(host, 'Link this invoice only'))
    await click(button(host, 'Save links'))
    await settle(8)
    expect(writes(api)).toEqual([LINKS1])
    expect(linksBody(api)).toEqual({ companyId: 'co2' })
  })

  it('a paid invoice whose client belongs to another company is refused inline, and Cancel closes the pickers', async () => {
    const api = await show({ [GET1]: () => json(200, paid), [CLIENTS]: () => json(200, { clients: [{ ...TEST_CLIENT, linkedCompanyId: 'co1' }] }) })
    await click(button(host, 'Edit links'))
    await settle(6)
    await type(customer(), 'co2')
    expect(fieldErr('Customer (CRM company)')).toContain('Test Client is already linked to Tidewater Foods')
    expect(customer().value).toBe('')
    await click(button(host, 'Cancel'))
    expect(field(host, 'Customer (CRM company)')).toBeNull()
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([])
  })

  it('a server refusal lands under the picker it names', async () => {
    await show({
      [GET1]: () => json(200, paid), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }),
      [LINKS1]: () => json(400, { error: 'That deal belongs to a different company', code: 'VALIDATION', details: { field: 'dealId' } }),
    })
    await click(button(host, 'Edit links'))
    await settle(6)
    await type(customer(), 'co1')
    await type(deal(), 'dl1')
    await click(button(host, 'Save links'))
    await settle(8)
    expect(fieldErr('Deal (optional)')).toBe('That deal belongs to a different company')
    expect(field(host, 'Customer (CRM company)')).not.toBeNull()
  })

  it('an external record has no Edit links', async () => {
    const ext: InvoiceDto = { ...paid, source: 'external', external: { source: 'xero', reference: 'X-1', recordedBy: 'Ann', recordedAt: '2026-10-06T00:00:00Z' } }
    await show({ [GET1]: () => json(200, ext), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT] }) })
    expect(button(host, 'Edit links')).toBeUndefined()
  })
})

describe('drafts are unchanged', () => {
  const draft = { ...UNLINKED, status: 'draft' as const, overdue: false, sentAt: null, issuedCount: 0, paymentLinkUrl: '', paymentLinkIsAutomatic: false }

  it('a draft with no company picks one directly: no confirm, no note, no link call, and Save draft sends the whole form', async () => {
    const api = await show({ [GET1]: () => json(200, draft), [CLIENTS]: () => json(200, { clients: [TEST_CLIENT, CLIENT] }), [PUT1]: () => json(200, draft) })
    expect(customer().disabled).toBe(false)
    expect(text()).toContain('Billed to Test Client, which is not linked to a CRM company. Choose the company to link it.')
    expect(text()).toContain('Linking a milestone marks it Invoiced when you issue this invoice, and Paid when you mark it paid.')
    expect(button(host, 'Edit links')).toBeUndefined()
    await type(customer(), 'co2')
    expect(text()).not.toContain('Link billing client')
    expect(text()).not.toContain('This invoice stays addressed to')
    expect(customer().value).toBe('co2')
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(api.count(LINK)).toBe(0)
    expect(api.count(LINKS1)).toBe(0)
    expect(putBody(api)).toMatchObject({ clientSlug: 'test-client', companyId: 'co2', dealId: null, milestoneId: null, paymentLinkUrl: '' })
  })

  it('a draft with a company keeps its picker locked', async () => {
    const withCo = { ...draft, clientSlug: 'tidewater', clientName: 'Tidewater Foods', companyId: 'co1' }
    await show({ [GET1]: () => json(200, withCo), [CLIENTS]: () => json(200, { clients: [CLIENT] }) })
    expect(customer().disabled).toBe(true)
    expect(text()).not.toContain('The customer of an issued invoice')
  })
})
