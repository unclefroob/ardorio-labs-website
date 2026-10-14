import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const CREATE = 'POST /sales/invoices'
const GET1 = 'GET /sales/invoices/i1'
const PUT1 = 'PUT /sales/invoices/i1'
const ISSUE1 = 'POST /sales/invoices/i1/issue'
const PAY1 = 'POST /sales/invoices/i1/mark-paid'
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
const modalBtn = (label: string): HTMLButtonElement | undefined => button(modal() ?? host, label)

const base = { [SET]: () => json(200, SETTINGS), [CLIENTS]: () => json(200, { clients: [CLIENT] }), [DEAL_LIST]: () => json(200, { invoices: [] }) }

async function show(routes: Parameters<typeof fakeApi>[0], route: Record<string, unknown>, role: Parameters<typeof setArdRole>[1] = 'admin') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, role)
  const api = fakeApi({ ...base, ...routes })
  const { Invoice } = await import('./Invoice')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><Invoice route={route as never} /><Hosts /></>) })
  await settle(10)
  return api
}
const fill = async (label: string, v: string): Promise<void> => type(host.querySelector(`[aria-label="${label}"]`), v)

describe('new invoice', () => {
  it('starts with 45 day terms, GST 10%, a blank line and the customer picker over Ardorio companies only', async () => {
    await show({}, { page: 'invoice', id: 'new' })
    expect(text()).toContain('New invoice')
    expect((field(host, 'Payment terms (days)') as HTMLInputElement).value).toBe('45')
    expect((host.querySelector('[aria-label="GST rate"]') as HTMLInputElement).value).toBe('10')
    const options = [...(field(host, 'Customer (CRM company)') as HTMLSelectElement).options].map(o => o.textContent)
    expect(options).toEqual(['Select a customer…', 'Banksia Advisory', 'Tidewater Foods'])
    expect(host.querySelectorAll('.inv-lines').length).toBe(2) // header + one line
    expect(text()).toContain('Quantities can be fractional')
  })

  it('shows the linked billing details once a customer is picked, and warns when there are none', async () => {
    await show({}, { page: 'invoice', id: 'new' })
    await type(field(host, 'Customer (CRM company)'), 'co1')
    expect(text()).toContain('Priya Raman')
    expect(text()).toContain('accounts@tidewaterfoods.example')
    expect(text()).toContain('12 345 678 901')
    expect(button(host, 'Edit billing details')).toBeDefined()
    expect(text()).not.toContain('has no billing details')
    await type(field(host, 'Customer (CRM company)'), 'co2')
    expect(text()).toContain('Banksia Advisory has no billing details')
    await click(button(host, 'Add billing details'))
    expect(m.ui.UI.get().modals.map(x => x.name)).toEqual(['billingDetails'])
  })

  it('the deal picker lists only that customer’s Ardorio deals; the milestone picker waits for a billing plan', async () => {
    await show({}, { page: 'invoice', id: 'new' })
    const dealSel = field(host, 'Deal (optional)') as HTMLSelectElement
    expect(dealSel.disabled).toBe(true)
    await type(field(host, 'Customer (CRM company)'), 'co1')
    expect([...dealSel.options].map(o => o.textContent)).toEqual(['No deal', 'Platform build, phase 2'])
    await type(dealSel, 'dl1')
    const ms = field(host, 'Milestone') as HTMLSelectElement
    expect(ms.disabled).toBe(true)
    expect([...ms.options].map(o => o.textContent)).toEqual(['No billing plan on this deal'])
  })

  it('shows a live totals rail from decimal-string cents: fractional qty, GST and total', async () => {
    await show({}, { page: 'invoice', id: 'new' })
    await fill('Description line 1', 'Consulting')
    await fill('Quantity line 1', '7.5')
    await fill('Unit price line 1', '480.00')
    expect(text()).toContain('$3,600.00')
    expect(text()).toContain('GST (10%)$360.00')
    expect(text()).toContain('Total$3,960.00')
    await fill('GST rate', '0')
    expect(text()).toContain('GST (0%)$0.00')
    expect(text()).toContain('Total$3,600.00')
  })

  it('does not save an incomplete form and says what is wrong', async () => {
    const api = await show({ [CREATE]: () => json(200, dto({ id: 'n', status: 'draft' })) }, { page: 'invoice', id: 'new' })
    await click(button(host, 'Save draft'))
    expect(api.count(CREATE)).toBe(0)
    expect(text()).toContain('Fix the highlighted fields first.')
    expect(text()).toContain('Choose a customer')
    expect(text()).toContain('Describe what this line is for')
  })

  it('rejects a unit price with more than two decimals instead of rounding it silently', async () => {
    const api = await show({ [CREATE]: () => json(200, dto()) }, { page: 'invoice', id: 'new' })
    await type(field(host, 'Customer (CRM company)'), 'co1')
    await fill('Description line 1', 'x')
    await fill('Unit price line 1', '10.555')
    await click(button(host, 'Save draft'))
    expect(api.count(CREATE)).toBe(0)
    expect(text()).toContain('Unit price must be dollars and cents')
  })

  it('saves a draft with integer cents, the company, deal, terms and due date', async () => {
    const api = await show({ [CREATE]: () => json(200, dto({ id: 'n1', status: 'draft' })) }, { page: 'invoice', id: 'new' })
    await type(field(host, 'Customer (CRM company)'), 'co1')
    await type(field(host, 'Deal (optional)'), 'dl1')
    await fill('Description line 1', 'Additional consulting')
    await fill('Detail line 1', 'Data model workshop, 7.5 hours')
    await fill('Quantity line 1', '7.5')
    await fill('Unit price line 1', '1,234.55')
    await type(field(host, 'Payment terms (days)'), '30')
    await click(button(host, 'Save draft'))
    await settle(4)
    const call = api.calls.find(c => `${c.method} ${c.path}` === CREATE)
    expect(call?.body).toMatchObject({
      clientSlug: 'tidewater', companyId: 'co1', dealId: 'dl1', milestoneId: null, gstRate: 0.1, paymentTermsDays: 30, offerCardPayment: false,
      lineItems: [{ description: 'Additional consulting', detail: 'Data model workshop, 7.5 hours', qty: 7.5, unitPriceCents: 123455 }],
    })
    const body = call?.body as { issueDate: string; dueDate: string }
    const days = (Date.parse(body.dueDate) - Date.parse(body.issueDate)) / 86_400_000
    expect(days).toBe(30)
  })

  it('the card toggle follows the business default, and is switched off with an explanation when Stripe is not configured', async () => {
    await show({ [SET]: () => json(200, { ...SETTINGS, offerCardPayments: true, stripeConfigured: true }) }, { page: 'invoice', id: 'new' })
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Offer card payment"]')?.getAttribute('aria-checked')).toBe('true')
    expect(text()).toContain('Costs about 1.7% + A$0.30 to receive')
    act(() => root.unmount())
    root = createRoot(host)
    await show({ [SET]: () => json(200, { ...SETTINGS, offerCardPayments: true, stripeConfigured: false }) }, { page: 'invoice', id: 'new' })
    const sw = host.querySelector<HTMLButtonElement>('[aria-label="Offer card payment"]')
    expect(sw?.disabled).toBe(true)
    expect(sw?.getAttribute('aria-checked')).toBe('false')
    expect(text()).toContain("Card payments aren't set up on the server")
    expect(text()).toContain('Unavailable until card payments are set up')
  })

  it('a business not registered for GST starts new invoices at 0%', async () => {
    await show({ [SET]: () => json(200, { ...SETTINGS, gstRegistered: false }) }, { page: 'invoice', id: 'new' })
    expect((host.querySelector('[aria-label="GST rate"]') as HTMLInputElement).value).toBe('0')
  })
})

describe('draft invoice', () => {
  const draft = dto({ id: 'i1', status: 'draft', invoiceNumber: 'INV-0035', sentAt: null, issuedCount: 0, offerCardPayment: true, paymentLinkUrl: '' })

  it('loads into the editor with Delete draft, Preview PDF, Save draft and Issue invoice', async () => {
    await show({ [GET1]: () => json(200, draft) }, { page: 'invoice', id: 'i1' })
    expect(text()).toContain('INV-0035')
    expect(text()).toContain('Draft')
    for (const b of ['Delete draft', 'Preview PDF', 'Save draft', 'Issue invoice']) expect(button(host, b)).toBeDefined()
    expect((host.querySelector('[aria-label="Unit price line 1"]') as HTMLInputElement).value).toBe('18000.00')
    expect(text()).toContain('Created on issue')
    expect(text()).toContain('Available once issued')
  })

  it('saves with the invoice’s own client slug, locks the customer picker, and does not need the clients list', async () => {
    const api = await show({ [GET1]: () => json(200, draft), [PUT1]: () => json(200, draft), [CLIENTS]: () => json(500, { error: 'Server error', code: 'INTERNAL' }) }, { page: 'invoice', id: 'i1' })
    const sel = [...host.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'co1')) as HTMLSelectElement
    expect(sel.disabled).toBe(true)
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(api.calls.find(c => c.method === 'PUT' && c.path === '/sales/invoices/i1')?.body).toMatchObject({ clientSlug: 'tidewater' })
    expect(text()).not.toContain('Fix the highlighted fields')
  })

  it('Issue invoice confirms, saves what is on screen, then issues', async () => {
    const api = await show({ [GET1]: () => json(200, draft), [PUT1]: () => json(200, draft), [ISSUE1]: () => json(200, dto({ offerCardPayment: true, paymentLinkUrl: 'https://buy.stripe.com/x', paymentLinkIsAutomatic: true })) }, { page: 'invoice', id: 'i1' })
    await fill('Unit price line 1', '20000')
    await click(button(host, 'Issue invoice'))
    expect(modal()?.getAttribute('aria-label')).toBe('Issue INV-0035?')
    expect(api.count(ISSUE1)).toBe(0)
    await click(modalBtn('Issue invoice'))
    await settle(8)
    expect(api.calls.map(c => `${c.method} ${c.path}`).filter(k => k === PUT1 || k === ISSUE1)).toEqual([PUT1, ISSUE1])
    expect(api.calls.find(c => c.path === '/sales/invoices/i1' && c.method === 'PUT')?.body).toMatchObject({ lineItems: [{ unitPriceCents: 2000000 }] })
    // The page is now the read-only sent view with the link and card status.
    expect(text()).toContain('Public invoice link')
    expect(text()).toContain('Link active')
  })

  it('a failed card link on issue is explained, and the invoice is not shown as lost', async () => {
    await show({
      [GET1]: () => json(200, draft), [PUT1]: () => json(200, draft),
      [ISSUE1]: () => json(502, { error: 'Stripe is down', code: 'UPSTREAM_ERROR' }),
    }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Issue invoice'))
    await click(modalBtn('Issue invoice'))
    await settle(8)
    expect(text()).toContain('The card payment link could not be created')
    expect(text()).toContain('transfer or PayID')
  })

  it('deleting asks first and only drafts can be deleted', async () => {
    const api = await show({ [GET1]: () => json(200, draft), 'DELETE /sales/invoices/i1': () => new Response(null, { status: 204 }) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Delete draft'))
    expect(modal()?.getAttribute('aria-label')).toBe('Delete draft INV-0035?')
    expect(api.count('DELETE /sales/invoices/i1')).toBe(0)
    await click(modalBtn('Delete draft'))
    await settle(4)
    expect(api.count('DELETE /sales/invoices/i1')).toBe(1)
  })

  it('says so when saving clears a pasted payment link because the total moved', async () => {
    await show({ [GET1]: () => json(200, { ...draft, paymentLinkUrl: 'https://buy.stripe.com/old' }), [PUT1]: () => json(200, { ...draft, paymentLinkUrl: '' }) }, { page: 'invoice', id: 'i1' })
    await fill('Unit price line 1', '19000')
    await click(button(host, 'Save draft'))
    await settle(6)
    expect(text()).toContain('The total changed, so the pasted payment link was cleared')
  })
})

describe('sent invoice', () => {
  const sent = dto({ id: 'i1' })

  it('is read-only with Download PDF, Edit and reissue and Mark paid, and no Delete', async () => {
    await show({ [GET1]: () => json(200, sent) }, { page: 'invoice', id: 'i1' })
    for (const b of ['Download PDF', 'Edit and reissue', 'Mark paid', 'Copy link']) expect(button(host, b)).toBeDefined()
    expect(button(host, 'Delete draft')).toBeUndefined()
    expect(host.querySelector('input[readonly]')).not.toBeNull()
    expect((host.querySelector('#inv-link') as HTMLInputElement).value).toBe('https://ardorio.co/invoice/tok')
    expect(text()).toContain('Milestone 2: core platform')
    expect(text()).toContain('3 Oct 2026')
    expect(text()).toContain('17 Nov 2026 · 45 days')
    expect(text()).toContain('first issue')
  })

  it('copies the hosted link', async () => {
    await show({ [GET1]: () => json(200, sent) }, { page: 'invoice', id: 'i1' })
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await click(button(host, 'Copy link'))
    expect(writeText).toHaveBeenCalledWith('https://ardorio.co/invoice/tok')
  })

  it('Edit and reissue opens the editor with Save changes and Reissue, and Cancel goes back', async () => {
    await show({ [GET1]: () => json(200, sent) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Edit and reissue'))
    expect(button(host, 'Save changes')).toBeDefined()
    expect(button(host, 'Reissue')).toBeDefined()
    expect(button(host, 'Save draft')).toBeUndefined()
    await click(button(host, 'Cancel'))
    expect(button(host, 'Edit and reissue')).toBeDefined()
  })

  it('shows the card-link failure banner and retries by issuing again', async () => {
    const failed = dto({ id: 'i1', offerCardPayment: true, paymentLinkUrl: '' })
    const api = await show({ [GET1]: () => json(200, failed), [ISSUE1]: () => json(200, dto({ id: 'i1', offerCardPayment: true, paymentLinkUrl: 'https://buy.stripe.com/ok', paymentLinkIsAutomatic: true })) }, { page: 'invoice', id: 'i1' })
    expect(text()).toContain("INV-0034 was issued, but the card link couldn't be created.")
    expect(text()).toContain('Link failed')
    await click(button(host, 'Try the card link again'))
    await settle(4)
    expect(api.count(ISSUE1)).toBe(1)
    expect(text()).not.toContain("couldn't be created")
    expect(text()).toContain('Link active')
  })

  it('the Mark paid dialog records the payment and turns the page read-only', async () => {
    const api = await show({ [GET1]: () => json(200, sent), [PAY1]: () => json(200, dto({ id: 'i1', status: 'paid', payment: { method: 'payid', paidAt: '2026-10-09', amountCents: 1950000, reference: 'ABC' } })) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Mark paid'))
    expect(modal()?.getAttribute('aria-label')).toBe('Mark INV-0034 as paid')
    expect((field(modal() as HTMLElement, 'Amount received (inc GST)') as HTMLInputElement).value).toBe('19800.00')
    await click(button(modal() as HTMLElement, 'PayID'))
    await type(field(modal() as HTMLElement, 'Amount received (inc GST)'), '19,500.00')
    await type(field(modal() as HTMLElement, 'Reference (optional)'), 'ABC')
    await click(modalBtn('Mark paid'))
    await settle(6)
    expect(api.calls.find(c => `${c.method} ${c.path}` === PAY1)?.body).toMatchObject({ method: 'payid', amountCents: 1950000, reference: 'ABC' })
    expect(text()).toContain('This invoice is paid, so it is read-only')
    expect(text()).toContain('Payment received')
    expect(button(host, 'Mark paid')).toBeUndefined()
    expect(button(host, 'Edit and reissue')).toBeUndefined()
  })

  it('refuses a blank amount in the dialog without calling the server', async () => {
    const api = await show({ [GET1]: () => json(200, sent), [PAY1]: () => json(200, sent) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Mark paid'))
    await type(field(modal() as HTMLElement, 'Amount received (inc GST)'), '')
    await click(modalBtn('Mark paid'))
    expect(api.count(PAY1)).toBe(0)
    expect(modal()?.textContent).toContain('Enter the amount received')
  })

  it('shows a server error in the dialog and keeps it open', async () => {
    await show({ [GET1]: () => json(200, sent), [PAY1]: () => json(409, { error: 'Already paid', code: 'CONFLICT' }) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Mark paid'))
    await click(modalBtn('Mark paid'))
    await settle(4)
    expect(modal()).not.toBeNull()
    expect(modal()?.textContent).toContain('Already paid')
  })
})

describe('sent invoice: the card payment link', () => {
  const auto = dto({ id: 'i1', offerCardPayment: true, paymentLinkUrl: 'https://buy.stripe.com/auto', paymentLinkIsAutomatic: true })
  const manual = dto({ id: 'i1', offerCardPayment: false, paymentLinkUrl: 'https://pay.example/manual', paymentLinkIsAutomatic: false })
  const putBody = (api: { calls: { method: string; path: string; body: unknown }[] }): Record<string, unknown> =>
    api.calls.find(c => `${c.method} ${c.path}` === PUT1)?.body as Record<string, unknown>
  const notes = (): Element | null => host.querySelector('textarea')

  it('Save changes on an invoice with an automatic link does not send the link, so it stays automatic', async () => {
    const api = await show({ [GET1]: () => json(200, auto), [PUT1]: () => json(200, { ...auto, notes: 'Thanks' }) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Edit and reissue'))
    await type(notes(), 'Thanks')
    await click(button(host, 'Save changes'))
    await settle(6)
    const body = putBody(api)
    expect(body).toMatchObject({ notes: 'Thanks' })
    expect(body).not.toHaveProperty('paymentLinkUrl')
  })

  it('Reissue with a new total does not send the link, so the API switches the old one off and issue makes a new one', async () => {
    const api = await show({
      [GET1]: () => json(200, auto),
      [PUT1]: () => json(200, { ...auto, paymentLinkUrl: '', paymentLinkIsAutomatic: false }),
      [ISSUE1]: () => json(200, { ...auto, paymentLinkUrl: 'https://buy.stripe.com/new', issuedCount: 2 }),
    }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Edit and reissue'))
    await fill('Unit price line 1', '20000')
    await click(button(host, 'Reissue'))
    await click(modalBtn('Reissue'))
    await settle(8)
    expect(api.calls.map(c => `${c.method} ${c.path}`).filter(k => k === PUT1 || k === ISSUE1)).toEqual([PUT1, ISSUE1])
    const body = putBody(api)
    expect(body).toMatchObject({ lineItems: [{ unitPriceCents: 2000000 }] })
    expect(body).not.toHaveProperty('paymentLinkUrl')
    expect(text()).not.toContain('payment link was')
  })

  it('Save changes with a new total says the automatic link was switched off, not that a pasted one was cleared', async () => {
    await show({ [GET1]: () => json(200, auto), [PUT1]: () => json(200, { ...auto, paymentLinkUrl: '', paymentLinkIsAutomatic: false }) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Edit and reissue'))
    await fill('Unit price line 1', '20000')
    await click(button(host, 'Save changes'))
    await settle(6)
    expect(text()).toContain('The total changed, so the card payment link was switched off.')
    expect(text()).not.toContain('pasted payment link')
  })

  it('a pasted link left as it is is not sent either', async () => {
    const api = await show({ [GET1]: () => json(200, manual), [PUT1]: () => json(200, manual) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Edit and reissue'))
    await type(notes(), 'Thanks')
    await click(button(host, 'Save changes'))
    await settle(6)
    expect(putBody(api)).not.toHaveProperty('paymentLinkUrl')
  })

  it('editing the link field sends it, trimmed', async () => {
    const api = await show({ [GET1]: () => json(200, auto), [PUT1]: () => json(200, { ...auto, paymentLinkUrl: 'https://pay.example/new', paymentLinkIsAutomatic: false }) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Edit and reissue'))
    await type(host.querySelector('input[type="url"]'), ' https://pay.example/new ')
    await click(button(host, 'Save changes'))
    await settle(6)
    expect(putBody(api)).toMatchObject({ paymentLinkUrl: 'https://pay.example/new' })
  })

  it('clearing the link field sends an empty link', async () => {
    const api = await show({ [GET1]: () => json(200, manual), [PUT1]: () => json(200, { ...manual, paymentLinkUrl: '' }) }, { page: 'invoice', id: 'i1' })
    await click(button(host, 'Edit and reissue'))
    await type(host.querySelector('input[type="url"]'), '')
    await click(button(host, 'Save changes'))
    await settle(6)
    expect(putBody(api)).toMatchObject({ paymentLinkUrl: '' })
  })

  it('a draft still sends its link as before', async () => {
    const draft = dto({ id: 'i1', status: 'draft', sentAt: null, issuedCount: 0, paymentLinkUrl: 'https://pay.example/manual' })
    const api = await show({ [GET1]: () => json(200, draft), [PUT1]: () => json(200, draft) }, { page: 'invoice', id: 'i1' })
    await type(notes(), 'Thanks')
    await click(button(host, 'Save draft'))
    await settle(6)
    expect(putBody(api)).toMatchObject({ paymentLinkUrl: 'https://pay.example/manual' })
  })
})

describe('paid invoice', () => {
  it('is read-only with only Download PDF, and shows how and when it was paid', async () => {
    const paid = dto({ id: 'i1', status: 'paid', payment: { method: 'bank-transfer', paidAt: '2026-10-06', amountCents: 1056000, reference: 'QSR 0610 PAYMENT' } })
    await show({ [GET1]: () => json(200, paid) }, { page: 'invoice', id: 'i1' })
    expect(button(host, 'Download PDF')).toBeDefined()
    for (const b of ['Mark paid', 'Edit and reissue', 'Save draft', 'Reissue', 'Delete draft']) expect(button(host, b)).toBeUndefined()
    expect(text()).toContain('This invoice is paid, so it is read-only')
    expect(text()).toContain('QSR 0610 PAYMENT')
    expect(text()).toContain('6 Oct 2026')
    expect(text()).toContain('$10,560.00')
  })
})

describe('load failures', () => {
  it('an invoice that does not exist says so', async () => {
    await show({ [GET1]: () => json(404, { error: 'Not found', code: 'NOT_FOUND' }) }, { page: 'invoice', id: 'i1' })
    expect(text()).toContain('Invoice not found')
  })
  it('a 403 shows the admins-only state', async () => {
    await show({ [GET1]: () => json(403, { error: 'no', code: 'ROLE_REQUIRED' }) }, { page: 'invoice', id: 'i1' })
    expect(text()).toContain('Invoices are for Ardorio admins')
  })
})

describe('milestones (once the billingPlans collection exists)', () => {
  const plan = { id: 'bp_dl1', dealId: 'dl1', businessId: 'ard', milestones: [
    { id: 'm1', label: 'Milestone 1: discovery', amountCents: 960000 },
    { id: 'm2', label: 'Milestone 2: core platform', amountCents: 1800000 },
    { id: 'm3', label: 'Milestone 3: handover', amountCents: 1440000 },
  ] }

  it('billingPlans() reads the synced collection: empty until a plan arrives', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    const { billingPlans } = await import('../../data/invoicing')
    expect(billingPlans()).toEqual([])
    m.bootstrap.hydrate(invoicingWorld({ billingPlans: [rec('bp_dl1', plan)] }))
    expect(billingPlans().map(p => p.id)).toEqual(['bp_dl1'])
  })

  it('lists the deal’s milestones with their derived status and fills a blank line from the one picked', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ billingPlans: [rec('bp_dl1', plan)] }))
    setArdRole(m, 'admin')
    fakeApi({
      ...base,
      [DEAL_LIST]: () => json(200, { invoices: [dto({ id: 'x', milestoneId: 'm1', status: 'paid' }), dto({ id: 'y', milestoneId: 'm2', status: 'sent' })] }),
    })
    const { Invoice } = await import('./Invoice')
    await act(async () => { root.render(<Invoice route={{ page: 'invoice', id: 'new' } as never} />) })
    await settle(8)
    await type(field(host, 'Customer (CRM company)'), 'co1')
    await type(field(host, 'Deal (optional)'), 'dl1')
    await settle(6)
    const ms = field(host, 'Milestone') as HTMLSelectElement
    expect([...ms.options].map(o => o.textContent)).toEqual([
      'No milestone',
      'Milestone 1: discovery: $9,600.00 ex GST (Paid)',
      'Milestone 2: core platform: $18,000.00 ex GST (Invoiced)',
      'Milestone 3: handover: $14,400.00 ex GST',
    ])
    await type(ms, 'm3')
    expect((host.querySelector('[aria-label="Description line 1"]') as HTMLInputElement).value).toBe('Milestone 3: handover')
    expect((host.querySelector('[aria-label="Unit price line 1"]') as HTMLInputElement).value).toBe('14400.00')
  })
})
