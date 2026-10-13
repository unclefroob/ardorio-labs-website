import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, CLIENT, dto, invoicingWorld, PLAN_DATA, setArdRole, SETTINGS, SUMMARY } from '../../testing/invoicingWorld'
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
  vi.restoreAllMocks()
})

const HIDDEN = 'EXT:xero:INV-0457:ab12cd34'
const EXT = { source: 'xero' as const, reference: 'INV-0457', recordedBy: 'Ryan', recordedAt: '2026-10-09T02:00:00.000Z' }
/** Kestrel's Xero INV-0457 of board 10: A$80,000 ex GST issued 10 Mar 2026, paid 9 Apr 2026, against milestone 1. */
const ext = (over: Partial<InvoiceDto> = {}): InvoiceDto => dto({
  id: 'x1', invoiceNumber: HIDDEN, source: 'external', external: EXT, milestoneId: 'm1', issueDate: '2026-03-10', dueDate: '2026-04-24', sentAt: null, issuedCount: 0,
  lineItems: [{ description: 'Xero: INV-0457', qty: 1, unitPriceCents: 8_000_000, amountCents: 8_000_000 }], publicToken: 'tok', hostedUrl: 'https://ardorio.co/invoice/tok',
  subtotalCents: 8_000_000, gstCents: 800_000, totalCents: 8_800_000, status: 'paid', payment: { method: 'bank-transfer', paidAt: '2026-04-09', amountCents: 8_800_000, reference: 'INV-0457' }, ...over,
})

const text = (): string => host.textContent ?? ''
const modals = (): Array<{ name: string; props: Record<string, unknown> }> => m.ui.UI.get().modals.map(x => ({ name: x.name, props: (x.props ?? {}) as Record<string, unknown> }))

async function mount(node: () => Promise<React.ReactNode>, routes: Parameters<typeof fakeApi>[0], world: Parameters<typeof invoicingWorld>[0] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', PLAN_DATA)], ...world }))
  setArdRole(m, 'admin')
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const api = fakeApi(routes)
  const { Hosts } = await import('../../shell/Hosts')
  const el = await node()
  await act(async () => { root.render(<>{el}<Hosts /></>) })
  await settle(8)
  return { api, nav }
}

describe('External invoice: the invoice view', () => {
  const view = async (inv: InvoiceDto) => mount(async () => {
    const { Invoice } = await import('./Invoice')
    return <Invoice route={{ page: 'invoice', id: 'x1' }} />
  }, { 'GET /sales/invoices/x1': () => json(200, inv) })

  it('shows the reference and the chip, never the hidden number, with its details read-only', async () => {
    await view(ext())
    expect(host.querySelector('h1')?.textContent).toContain('Xero INV-0457')
    expect(text()).toContain('Recorded externally')
    expect(text()).not.toContain(HIDDEN)
    expect(text()).toContain('Recorded externally from Xero.')
    expect(text()).toContain('9 Oct 2026 by Ryan')
    expect(text()).toContain('No SalesOS invoice number, PDF, card link or pay page.')
    // No editor fields: it is read-only, edited only through its own dialog.
    expect(host.querySelector('input:not([readonly])')).toBeNull()
  })

  it('hides PDF, hosted link, issue, reissue, mark paid, duplicate and card controls; keeps Edit, Cancel and Mark as test', async () => {
    await view(ext({ status: 'sent', payment: null }))
    for (const b of ['Download PDF', 'Edit and reissue', 'Mark paid', 'Duplicate as new draft', 'Issue', 'Copy link']) expect(button(host, b)).toBeUndefined()
    expect(text()).not.toContain('Public invoice link')
    expect(text()).not.toContain('Card payment')
    await click(button(host, 'More'))
    expect([...host.querySelectorAll('[role="menuitem"]')].map(i => i.textContent?.trim())).toEqual(['Cancel invoice…', 'Mark as test invoice…'])
  })

  it('a paid external record can still be cancelled, and Edit opens the record dialog for it', async () => {
    await view(ext())
    await click(button(host, 'More'))
    const cancel = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(i => i.textContent?.trim() === 'Cancel invoice…')
    expect(cancel?.getAttribute('aria-disabled')).toBeNull()
    await click(button(host, 'More'))
    await click(button(host, 'Edit'))
    await settle(2)
    expect(modals().map(x => x.name)).toEqual(['recordExternal'])
    expect((modals()[0].props.invoice as InvoiceDto).id).toBe('x1')
    expect(host.querySelector('.modal')?.getAttribute('aria-label')).toBe('Edit Xero INV-0457')
  })

  it('cancelling names it by reference and lists no client page or card link', async () => {
    await view(ext())
    await click(button(host, 'More'))
    await click([...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(i => i.textContent?.trim() === 'Cancel invoice…'))
    await settle(2)
    const d = host.querySelector('[role="alertdialog"]')
    expect(d?.getAttribute('aria-label')).toBe('Cancel invoice Xero INV-0457?')
    expect(d?.textContent).toContain('leaves Invoiced and Collected')
    expect(d?.textContent).not.toContain('card payment link')
    expect(d?.textContent).not.toContain(HIDDEN)
  })
})

describe('External invoice: the Invoices list', () => {
  const list = async () => mount(async () => {
    const { Invoices } = await import('./Invoices')
    return <Invoices />
  }, { 'GET /sales/invoices': () => json(200, { invoices: [ext({ status: 'sent', payment: null }), dto({ id: 'b', invoiceNumber: 'INV-0034' })] }), 'GET /sales/invoices/summary': () => json(200, SUMMARY) })

  it('lists it by reference with the chip, and offers no Mark paid, PDF or link for it', async () => {
    await list()
    const rows = [...host.querySelectorAll('tbody tr')]
    const row = rows.find(r => r.textContent?.includes('Xero INV-0457'))
    expect(row?.textContent).toContain('Recorded externally')
    expect(text()).not.toContain(HIDDEN)
    expect(button(row as HTMLElement, 'Mark paid')).toBeUndefined()
    // The SalesOS invoice keeps its Mark paid.
    expect(button(rows.find(r => r.textContent?.includes('INV-0034')) as HTMLElement, 'Mark paid')).toBeTruthy()
    await click(row?.querySelector('[aria-label="More actions for Xero INV-0457"]'))
    expect([...host.querySelectorAll('[role="menuitem"]')].map(i => i.textContent?.trim())).toEqual(['Open'])
  })

  it('the header action opens the dialog with a deal picker', async () => {
    await list()
    await click(button(host, 'Record external invoice or payment'))
    await settle(2)
    expect(modals().map(x => x.name)).toEqual(['recordExternal'])
    expect(modals()[0].props.dealId).toBeUndefined()
    expect([...host.querySelectorAll('.modal label')].some(l => l.textContent?.startsWith('Deal'))).toBe(true)
  })
})

describe('External invoice: the deal Billing tab (board 10)', () => {
  const deal = async (invoices: InvoiceDto[]) => mount(async () => {
    const { BillingCard } = await import('../deals/BillingCard')
    const { Q } = await import('../../data/Q')
    return <BillingCard deal={Q.deal('dl1')!} />
  }, {
    'GET /sales/invoices?dealId=dl1': () => json(200, { invoices }),
    'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }),
    'GET /sales/invoices/settings': () => json(200, SETTINGS),
    'POST /sales/invoices/external': () => json(201, ext()),
  })

  it('counts it in Invoiced and Collected and shows it on its milestone by reference, with the chip and no Mark paid', async () => {
    await deal([ext()])
    const fig = (l: string): string => host.querySelector(`[data-fig="${l}"] .v`)?.textContent ?? ''
    expect([fig('Invoiced'), fig('Collected'), fig('Outstanding')]).toEqual(['$80,000.00', '$80,000.00', '$0.00'])
    const row = [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes('Discovery and design'))
    expect(row?.textContent).toContain('Xero INV-0457')
    expect(row?.textContent).toContain('Recorded externally')
    expect(row?.textContent).toContain('Paid')
    expect(text()).not.toContain(HIDDEN)

    await deal([ext({ status: 'sent', payment: null })])
    const sentRow = [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes('Discovery and design'))
    expect(button(sentRow as HTMLElement, 'Mark paid')).toBeUndefined()
  })

  it('an external record with no milestone is project money, listed with the chip', async () => {
    await deal([ext({ milestoneId: null })])
    expect(text()).toContain('Project invoices without a milestone')
    expect(text()).toContain('Xero INV-0457')
    expect(text()).toContain('paid 9 Apr 2026')
  })

  it('Record external invoice or payment opens the dialog for this deal and confirms what was added', async () => {
    const { api } = await deal([])
    await click(button(host, 'Record external invoice or payment'))
    await settle(2)
    expect(modals()).toEqual([expect.objectContaining({ name: 'recordExternal', props: expect.objectContaining({ dealId: 'dl1' }) })])
    // Record it through the dialog's own callback, as the dialog does on success.
    await act(async () => { (modals()[0].props.onDone as (i: InvoiceDto) => void)(ext()) })
    await settle(4)
    expect(text()).toContain('Xero INV-0457 recorded. A$80,000 added to Invoiced (March 2026) and Collected (April 2026).')
    expect(api.count('GET /sales/invoices?dealId=dl1')).toBe(2)
  })
})

describe('External invoice: company Billing card and Customers', () => {
  it('the company Billing card names it by reference with the chip', async () => {
    await mount(async () => {
      const { CompanyBilling } = await import('../companies/BillingCard')
      const { Q } = await import('../../data/Q')
      return <CompanyBilling company={Q.company('co1')!} />
    }, { 'GET /sales/invoices?companyId=co1': () => json(200, { invoices: [ext()] }), 'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }) })
    expect(text()).toContain('Xero INV-0457')
    expect(text()).toContain('Recorded externally')
    expect(text()).not.toContain(HIDDEN)
  })

  it('the Customers Ardorio tab marks the customer with the chip and the reference', async () => {
    await mount(async () => {
      const { ArdorioCustomers } = await import('../customers/ArdorioCustomers')
      return <ArdorioCustomers />
    }, {
      'GET /sales/invoices/summary': () => json(200, { ...SUMMARY, byCompany: [{ companyId: 'co1', invoicedCents: 8_000_000, paidCents: 8_000_000, outstandingCents: 0, overdueCents: 0, lastPaymentAt: '2026-04-09', lastPaymentMethod: 'bank-transfer' }] }),
      'GET /sales/invoices': () => json(200, { invoices: [ext(), ext({ id: 'x2', status: 'void', external: { ...EXT, reference: 'INV-0001' } })] }),
    })
    const row = [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes('Tidewater Foods'))
    expect(row?.textContent).toContain('Recorded externally')
    expect(row?.textContent).toContain('Xero INV-0457')
    // A cancelled record is not named.
    expect(row?.textContent).not.toContain('INV-0001')
  })
})
