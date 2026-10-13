import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { ardDeal, dto, invoicingWorld, PLAN_DATA, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'
import { EXTERNAL_DENIED_TITLE, PAID_IN_FULL_ERROR, PART_PAYMENT_HINT, REFERENCE_REQUIRED } from '../../shared/externalInvoices'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

// "Today" is the server clock the fixture bootstrap carries: 9 Oct 2026.
const POST = 'POST /sales/invoices/external'
const PUT = 'PUT /sales/invoices/x1/external'

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

const EXT = { source: 'xero' as const, reference: 'INV-0457', recordedBy: 'Ryan', recordedAt: '2026-10-09T02:00:00.000Z' }
const saved = (over: Partial<InvoiceDto> = {}): InvoiceDto => dto({
  id: 'x1', invoiceNumber: 'EXT:xero:INV-0457:ab12cd34', source: 'external', external: EXT, milestoneId: 'm1', issueDate: '2026-03-10',
  subtotalCents: 8_000_000, gstCents: 800_000, totalCents: 8_800_000, status: 'paid', payment: { method: 'bank-transfer', paidAt: '2026-04-09', amountCents: 8_800_000, reference: 'INV-0457' }, ...over,
})

const dialog = (): HTMLElement => {
  const d = host.querySelector<HTMLElement>('.modal')
  if (!d) throw new Error('no dialog')
  return d
}
const dtext = (): string => dialog().textContent ?? ''
const toasts = (): string[] => m.ui.UI.get().toasts.map(t => t.msg)
const modals = (): string[] => m.ui.UI.get().modals.map(x => x.name)
const fld = (label: string) => field(dialog(), label)
const paidBox = (): HTMLInputElement => {
  const l = [...dialog().querySelectorAll('label.ck')].find(x => x.textContent?.includes('It has been paid'))
  const i = l?.querySelector('input')
  if (!i) throw new Error('no paid checkbox')
  return i
}

async function open(props: Record<string, unknown>, routes: Parameters<typeof fakeApi>[0] = {}, role: Parameters<typeof setArdRole>[1] = 'admin') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    deals: [rec('dl1', ardDeal('dl1', { title: 'Fleet dashboard build', name: 'Fleet dashboard build' }).data), rec('dl3', ardDeal('dl3', { title: 'Data audit', name: 'Data audit', companyId: 'co2', status: 'open' }).data)],
    billingPlans: [rec('bp_dl1', PLAN_DATA)],
  }))
  setArdRole(m, role)
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const api = fakeApi(routes)
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('recordExternal', props) })
  await settle(4)
  return { api, nav }
}

/** Board 9 typed in: Xero INV-0457, A$80,000 ex GST issued 10 Mar 2026, paid 9 Apr 2026, against milestone 1. */
async function fillBoard(): Promise<void> {
  await type(fld('External reference (required)'), 'INV-0457')
  await type(fld('Issue date'), '2026-03-10')
  await type(fld('Amount (A$, ex GST)'), '80,000')
  await type(fld('Milestone (optional)'), 'm1')
  await click(paidBox())
  await type(fld('Paid date'), '2026-04-09')
}

describe('Record external invoice or payment (board 9)', () => {
  it('suggests GST and the amount paid, previews where it counts, and records it on the deal', async () => {
    const onDone = vi.fn()
    const { api } = await open({ dealId: 'dl1', onDone }, { [POST]: () => json(201, saved()) })
    expect(dialog().getAttribute('aria-label')).toBe('Record external invoice or payment')
    expect(dtext()).toContain('On Tidewater Foods, Fleet dashboard build.')
    // From the deal, the deal is known: no deal picker.
    expect(fld('Deal')).toBeNull()
    expect(button(dialog(), 'Xero')?.getAttribute('aria-pressed')).toBe('true')
    await fillBoard()
    expect((fld('GST') as HTMLInputElement).value).toBe('8000.00')
    expect((fld('Total inc GST') as HTMLInputElement).value).toBe('$88,000.00')
    // Paid in full: the amount paid is the total, shown, not typed.
    const paidAmt = fld('Amount paid (inc GST)') as HTMLInputElement
    expect(paidAmt.value).toBe('$88,000.00')
    expect(paidAmt.readOnly).toBe(true)
    expect(dtext()).toContain('Adds A$80,000 to Invoiced in March 2026 and to Collected in April 2026.')
    expect(dtext()).toContain('Marks Discovery and design as Paid.')
    expect(dtext()).toContain('Shown everywhere as Recorded externally with Xero INV-0457.')
    expect(dtext()).toContain('No SalesOS invoice number, PDF, card link or pay page is created.')

    await click(button(dialog(), 'Record'))
    await settle(4)
    expect(api.calls.filter(c => `${c.method} ${c.path}` === POST).map(c => c.body)).toEqual([{
      companyId: 'co1', dealId: 'dl1', milestoneId: 'm1', externalSource: 'xero', externalReference: 'INV-0457', issueDate: '2026-03-10',
      subtotalCents: 8_000_000, gstCents: 800_000, paidOn: '2026-04-09', paymentMethod: 'bank-transfer', paidAmountCents: 8_800_000, notes: '',
    }])
    expect(modals()).toEqual([])
    expect(toasts()).toContain('Xero INV-0457 recorded. A$80,000 added to Invoiced (March 2026) and Collected (April 2026).')
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'x1' }))
  })

  it('records an unpaid invoice from another system with GST typed over, and no payment', async () => {
    const { api } = await open({ dealId: 'dl1' }, { [POST]: () => json(201, saved({ status: 'sent', payment: null })) })
    await click(button(dialog(), 'Other system'))
    await type(fld('External reference (required)'), 'MYOB 2231')
    await type(fld('Issue date'), '2026-09-01')
    await type(fld('Amount (A$, ex GST)'), '1200')
    await type(fld('GST'), '0')
    expect(dtext()).toContain('Adds A$1,200 to Invoiced in September 2026. It counts as outstanding until it is paid.')
    await click(button(dialog(), 'Record'))
    await settle(4)
    const body = api.calls.find(c => `${c.method} ${c.path}` === POST)?.body as Record<string, unknown>
    expect(body).toMatchObject({ externalSource: 'other-system', externalReference: 'MYOB 2231', subtotalCents: 120_000, gstCents: 0, paidOn: null, paymentMethod: null, paidAmountCents: null, milestoneId: null })
  })
})

describe('Record external: a paid record is paid in full', () => {
  it('has no amount paid to type: it follows the total, and says how to record a part payment', async () => {
    const { api } = await open({ dealId: 'dl1' }, { [POST]: () => json(201, saved({ subtotalCents: 50_000, gstCents: 0, totalCents: 50_000 })) })
    await fillBoard()
    expect(dialog().querySelectorAll('#ext-paidamt:not([readonly])')).toHaveLength(0)
    expect(dialog().querySelector('[data-part-payment]')?.textContent).toBe(PART_PAYMENT_HINT)
    await type(fld('Amount (A$, ex GST)'), '500')
    await type(fld('GST'), '0')
    expect((fld('Amount paid (inc GST)') as HTMLInputElement).value).toBe('$500.00')
    // The live preview still counts the ex GST amount, invoiced and collected.
    expect(dtext()).toContain('Adds A$500 to Invoiced in March 2026 and to Collected in April 2026.')
    await click(button(dialog(), 'Record'))
    await settle(4)
    expect(api.calls.find(c => `${c.method} ${c.path}` === POST)?.body).toMatchObject({ subtotalCents: 50_000, gstCents: 0, paidAmountCents: 50_000 })
  })

  it('a paidAmountCents refusal from the server is shown on the amount paid, in words', async () => {
    await open({ dealId: 'dl1' }, {
      [POST]: () => json(400, { error: 'The amount paid must be the invoice total incl. GST (8800000 cents).', code: 'VALIDATION', details: { field: 'paidAmountCents' } }),
    })
    await fillBoard()
    await click(button(dialog(), 'Record'))
    await settle(4)
    expect(fld('Amount paid (inc GST)')?.getAttribute('aria-invalid')).toBe('true')
    expect(dtext()).toContain(PAID_IN_FULL_ERROR)
    expect(dtext()).not.toContain('8800000 cents')
    expect(modals()).toEqual(['recordExternal'])
  })

  it('editing an older part-paid record says saving makes it paid in full, and sends the total', async () => {
    const part = saved({ payment: { method: 'bank-transfer', paidAt: '2026-04-09', amountCents: 4_000_000, reference: 'INV-0457' } })
    const { api } = await open({ invoice: part }, { [PUT]: () => json(200, saved()) })
    expect(dtext()).toContain('This record was saved as paid $40,000.00, part of its total. Saving records it as paid in full ($88,000.00).')
    await click(button(dialog(), 'Save changes'))
    await settle(4)
    expect(api.calls.find(c => `${c.method} ${c.path}` === PUT)?.body).toMatchObject({ paidAmountCents: 8_800_000 })
  })
})

describe('Record external: the company is billed under more than one client', () => {
  const CONFLICT = () => json(409, {
    error: 'This company’s earlier invoices bill more than one billing client: link the right one to the company first, then record this.',
    code: 'CONFLICT', details: { field: 'companyId', clientSlugs: ['tidewater-foods', 'tidewater-group'], needsBillingLink: true },
  })

  it('names the clients, saves nothing, and Open billing details goes to the company’s billing link', async () => {
    const { api, nav } = await open({ dealId: 'dl1' }, { [POST]: CONFLICT })
    await fillBoard()
    await click(button(dialog(), 'Record'))
    await settle(4)
    const note = dialog().querySelector('[data-needs-billing-link]')
    expect(note?.getAttribute('role')).toBe('alert')
    expect(note?.textContent).toContain('This company is billed under more than one client: tidewater-foods, tidewater-group. Link the right one to the company first.')
    expect(toasts()).toEqual([])
    expect(modals()).toEqual(['recordExternal'])
    expect(api.count(POST)).toBe(1)
    await click(button(dialog(), 'Open billing details'))
    expect(modals()).toEqual([])
    const url = String(nav.mock.calls.at(-1)?.[0])
    expect(url).toContain('co1')
    expect(url).toContain('billing-details')
  })

  it('on edit (PUT) says the same', async () => {
    await open({ invoice: saved() }, { [PUT]: CONFLICT })
    await click(button(dialog(), 'Save changes'))
    await settle(4)
    expect(dialog().querySelector('[data-needs-billing-link]')?.textContent).toContain('tidewater-foods, tidewater-group')
  })
})

describe('Record external: guards and errors (board 12)', () => {
  it('A: a missing reference is said next to the field, focus goes there, and nothing is sent', async () => {
    const { api } = await open({ dealId: 'dl1' })
    await type(fld('Amount (A$, ex GST)'), '500')
    await click(button(dialog(), 'Record'))
    await settle(2)
    const ref = fld('External reference (required)')
    expect(ref?.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(ref)
    expect(dtext()).toContain(REFERENCE_REQUIRED)
    expect(api.calls.filter(c => c.method === 'POST')).toEqual([])
  })

  it('a future issue date and a payment before the issue date are said at once, in words', async () => {
    await open({ dealId: 'dl1' })
    await type(fld('Issue date'), '2026-11-20')
    expect(dtext()).toContain('The issue date can’t be in the future. Use today or an earlier date.')
    await type(fld('Issue date'), '2026-03-10')
    await click(paidBox())
    await type(fld('Paid date'), '2026-03-02')
    expect(dtext()).toContain('The paid date (2 Mar 2026) is before the issue date (10 Mar 2026). Check the dates.')
    expect(fld('Paid date')?.getAttribute('aria-invalid')).toBe('true')
  })

  it('B: a reference already recorded names the deal, who and when, and Open it goes there', async () => {
    const { api, nav } = await open({ dealId: 'dl1' }, {
      [POST]: () => json(409, { error: 'That reference is already recorded', code: 'DUPLICATE_EXTERNAL_REFERENCE', details: { invoiceId: 'x9', dealId: 'dl1' } }),
      'GET /sales/invoices/x9': () => json(200, saved({ id: 'x9', external: { ...EXT, recordedAt: '2026-10-08T02:00:00.000Z', recordedBy: 'Ryan' } })),
    })
    await fillBoard()
    await click(button(dialog(), 'Record'))
    await settle(6)
    expect(dtext()).toContain('Xero INV-0457 is already recorded on Tidewater Foods, Fleet dashboard build (8 Oct 2026, Ryan). Recording it again would count it twice.')
    // Record is replaced by a way out; focus lands on Open it.
    expect(button(dialog(), 'Record')?.disabled).toBe(true)
    expect(button(dialog(), 'Change reference')).toBeTruthy()
    expect(document.activeElement).toBe(button(dialog(), 'Open it'))
    expect(api.count(POST)).toBe(1)
    await click(button(dialog(), 'Open it'))
    expect(modals()).toEqual([])
    expect(String(nav.mock.calls.at(-1)?.[0])).toContain('/sales/invoices/x9')
  })

  it('changing the reference clears the duplicate warning', async () => {
    await open({ dealId: 'dl1' }, { [POST]: () => json(409, { error: 'dup', code: 'DUPLICATE_EXTERNAL_REFERENCE', details: { invoiceId: '', dealId: null } }) })
    await fillBoard()
    await click(button(dialog(), 'Record'))
    await settle(4)
    expect(dtext()).toContain('is already recorded on another invoice')
    await type(fld('External reference (required)'), 'INV-0458')
    expect(dtext()).not.toContain('already recorded')
    expect(button(dialog(), 'Record')?.disabled).toBe(false)
  })

  it('E: someone who is not an Ardorio admin is told to ask an admin, and nothing is shown to fill in', async () => {
    const { api } = await open({ dealId: 'dl1' }, {}, 'sales')
    const d = host.querySelector('[role="alertdialog"]')
    expect(d?.getAttribute('aria-label')).toBe(EXTERNAL_DENIED_TITLE)
    expect(d?.textContent).toContain('You can still record a won deal.')
    expect(fld('External reference (required)')).toBeNull()
    await click(button(d as HTMLElement, 'OK'))
    expect(modals()).toEqual([])
    expect(api.calls).toEqual([])
  })

  it('E: a 403 from the server shows the same', async () => {
    await open({ dealId: 'dl1' }, { [POST]: () => json(403, { error: 'Forbidden', code: 'ROLE_REQUIRED' }) })
    await fillBoard()
    await click(button(dialog(), 'Record'))
    await settle(4)
    expect(host.querySelector('[role="alertdialog"]')?.getAttribute('aria-label')).toBe(EXTERNAL_DENIED_TITLE)
  })

  it('a validation error from the server is shown next to its field', async () => {
    await open({ dealId: 'dl1' }, { [POST]: () => json(400, { error: 'The issue date cannot be in the future', code: 'VALIDATION', details: { field: 'issueDate' } }) })
    await fillBoard()
    await click(button(dialog(), 'Record'))
    await settle(4)
    expect(fld('Issue date')?.getAttribute('aria-invalid')).toBe('true')
    expect(dtext()).toContain('The issue date cannot be in the future')
  })
})

describe('Record external: from the Invoices list, and editing', () => {
  it('asks for the deal when opened without one, and records against that deal’s company', async () => {
    const { api } = await open({}, { [POST]: () => json(201, saved({ dealId: 'dl3', companyId: 'co2', milestoneId: null })) })
    const pick = fld('Deal') as HTMLSelectElement
    expect([...pick.options].map(o => o.textContent)).toEqual(['Choose a deal…', 'Tidewater Foods, Fleet dashboard build', 'Banksia Advisory, Data audit (open)'])
    await type(fld('External reference (required)'), 'INV-0457')
    await type(fld('Amount (A$, ex GST)'), '100')
    await click(button(dialog(), 'Record'))
    await settle(2)
    expect(dtext()).toContain('Choose the deal this money belongs to')
    expect(api.count(POST)).toBe(0)
    await type(pick, 'dl3')
    // Banksia's deal has no billing plan, so there is no milestone to pick.
    expect(dtext()).toContain('This deal has no milestones.')
    await click(button(dialog(), 'Record'))
    await settle(4)
    expect(api.calls.find(c => `${c.method} ${c.path}` === POST)?.body).toMatchObject({ companyId: 'co2', dealId: 'dl3', milestoneId: null })
  })

  it('edits an external record in place with PUT, starting from what is stored', async () => {
    const onDone = vi.fn()
    const { api } = await open({ invoice: saved(), onDone }, { [PUT]: () => json(200, saved({ gstCents: 0, totalCents: 8_000_000 })) })
    expect(dialog().getAttribute('aria-label')).toBe('Edit Xero INV-0457')
    expect((fld('External reference (required)') as HTMLInputElement).value).toBe('INV-0457')
    expect((fld('GST') as HTMLInputElement).value).toBe('8000.00')
    expect(paidBox().checked).toBe(true)
    await type(fld('GST'), '0')
    await click(button(dialog(), 'Save changes'))
    await settle(4)
    // The stored payment was the full total, so it still follows the total: A$80,000 now GST is zero.
    expect(api.calls.find(c => `${c.method} ${c.path}` === PUT)?.body).toMatchObject({ companyId: 'co1', dealId: 'dl1', milestoneId: 'm1', gstCents: 0, paidOn: '2026-04-09', paidAmountCents: 8_000_000 })
    expect(api.count(POST)).toBe(0)
    expect(toasts()).toContain('Xero INV-0457 saved')
    expect(onDone).toHaveBeenCalled()
  })
})
