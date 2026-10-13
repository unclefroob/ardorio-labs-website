import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangeEntry } from '../../api/contract'
import { change, changes, rec } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { ardDeal, CLIENT, dto, invoicingWorld, setArdRole, SETTINGS, SUMMARY } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
// What the server has changed since the last poll; a test sets it to have the scheduler act while the editor is open.
const remote = vi.hoisted(() => ({ changes: [] as ChangeEntry[] }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes(remote.changes)), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const DEAL_LIST = 'GET /sales/invoices?dealId=dl1'
const CLIENTS = 'GET /sales/invoices/clients'
const SET = 'GET /sales/invoices/settings'

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  remote.changes = []
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  sessionStorage.clear()
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
const note = (): string => host.querySelector('[role="note"][aria-label="Retainer automation"]')?.textContent ?? ''
const path = (nav: ReturnType<typeof vi.fn>): { pathname: string; q: Record<string, unknown> } => {
  const [p] = nav.mock.calls.at(-1) as [string]
  const u = new URL(p, 'https://x')
  return { pathname: u.pathname, q: JSON.parse(u.searchParams.get('q') ?? '{}') as Record<string, unknown> }
}

const plan = (retainer: Record<string, unknown>) => rec('bp_dl1', { dealId: 'dl1', businessId: 'ard', milestones: [], retainer: { amountCents: 450000, interval: 'monthly', ...retainer } })
const fromRetainer = dto({ id: 'r1', invoiceNumber: 'INV-0041', milestoneId: null, status: 'draft', issuedCount: 0, sentAt: null, source: 'retainer' })
const manual = dto({ id: 'r2', invoiceNumber: 'INV-0030', milestoneId: null, status: 'paid', source: 'manual' })
const base = { [DEAL_LIST]: () => json(200, { invoices: [fromRetainer, manual] }), [CLIENTS]: () => json(200, { clients: [CLIENT] }), [SET]: () => json(200, SETTINGS) }

async function showCard(retainer: Record<string, unknown>, dealOver: Record<string, unknown> = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', { ...ardDeal('dl1').data, ...dealOver })], billingPlans: [plan(retainer)] }))
  setArdRole(m, 'admin')
  m.ui.bindNavigate(vi.fn())
  const api = fakeApi(base)
  const { BillingCard } = await import('./BillingCard')
  const { Q } = await import('../../data/Q')
  const deal = Q.deal('dl1')!
  await act(async () => { root.render(<BillingCard deal={deal} />) })
  await settle(8)
  return api
}

describe('Deal billing card: retainer automation', () => {
  it('shows the next invoice date, the last drafted period and that the draft is made automatically, never sent', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01', lastDraftedFor: '2099-10-01' })
    expect(text()).toContain('Next invoice date1 Nov 2099')
    expect(text()).toContain('Last drafted periodOctober 2099')
    expect(text()).toContain('Drafted for 1 Oct 2099')
    expect(note()).toContain('A draft invoice for $4,500.00 is created automatically on 1 Nov 2099')
    expect(note()).toContain('never sent automatically')
  })

  it('says None yet before the first automatic draft', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01' })
    expect(text()).toContain('Last drafted periodNone yet')
  })

  it('a due date that has not been drafted says it is due and drafted on the next run', async () => {
    await showCard({ nextInvoiceDate: '2020-01-01', lastDraftedFor: '2019-12-01' })
    expect(note()).toContain('Due 1 Jan 2020')
    expect(note()).toContain('on the next run, as long as the company has a billing client')
    expect(note()).toContain('never sent automatically')
  })

  it('a date months behind says how many drafts the catch-up makes, one each run', async () => {
    await showCard({ nextInvoiceDate: '2020-01-01', lastDraftedFor: '2019-12-01' })
    expect(note()).toMatch(/The date is \d+ months behind, so \d+ drafts are made, one each run, for January 2020 to /)
    expect(note()).toContain('Move the date on if those months were billed already')
  })

  it('a date due this month alone says nothing about catching up', async () => {
    // The fixture clock is 9 Oct 2026: 1 Oct is due, and 1 Nov is still ahead.
    await showCard({ nextInvoiceDate: '2026-10-01' })
    expect(note()).toContain('on the next run')
    expect(note()).not.toContain('months behind')
  })

  it('the form warns that a past date drafts one invoice per month, and the save button says how many', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01' })
    await click(button(host, 'Edit retainer'))
    await type(host.querySelector('[aria-label="Retainer next invoice date"]'), '2020-01-01')
    expect(text()).toMatch(/This date is in the past, so \d+ draft invoices would be made, one each run, for January 2020 to /)
    const save = [...host.querySelectorAll('button')].find(b => /^Save and draft \d+ months$/.test(b.textContent ?? ''))
    expect(save).toBeTruthy()
    await type(host.querySelector('[aria-label="Retainer next invoice date"]'), '2099-12-01')
    expect(text()).not.toContain('This date is in the past')
    expect(button(host, 'Save retainer')).toBeTruthy()
  })

  it('the form refuses a date on or before the last drafted period', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01', lastDraftedFor: '2099-10-01' })
    await click(button(host, 'Edit retainer'))
    await type(host.querySelector('[aria-label="Retainer next invoice date"]'), '2099-10-01')
    expect(text()).toContain('The next invoice date must be after October 2099, the last period already drafted')
    await click(button(host, 'Save retainer'))
    expect(m.store.S.billingPlans[0].retainer?.nextInvoiceDate).toBe('2099-11-01')
  })

  it('without a next invoice date nothing is drafted, and it says so', async () => {
    await showCard({})
    expect(note()).toContain('No next invoice date, so no draft is created automatically')
  })

  it('marks retainer-drafted invoices with a From retainer chip, and only those', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01' })
    const rows = [...host.querySelectorAll('.rowx')].map(r => r.textContent ?? '')
    expect(rows.find(r => r.includes('INV-0041'))).toContain('From retainer')
    expect(rows.find(r => r.includes('INV-0030'))).not.toContain('From retainer')
  })

  it('editing the retainer keeps the server-owned last drafted period', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01', lastDraftedFor: '2099-10-01' })
    await click(button(host, 'Edit retainer'))
    await type(host.querySelector('[aria-label="Retainer amount"]'), '5000')
    await click(button(host, 'Save retainer'))
    expect(m.store.S.billingPlans[0].retainer).toEqual({ amountCents: 500000, interval: 'monthly', nextInvoiceDate: '2099-11-01', lastDraftedFor: '2099-10-01' })
  })
})

describe('Deal billing card: a deal the scheduler skips', () => {
  // The API drafts a retainer only for a won deal that is not archived.
  const manualNote = (): string => host.querySelector('[aria-label="Create invoice by hand"]')?.textContent ?? ''

  for (const status of ['open', 'lost'] as const) {
    it(`an ${status} deal says nothing is drafted until it is won, and Create invoice claims no period`, async () => {
      await showCard({ nextInvoiceDate: '2026-10-01', lastDraftedFor: '2026-09-01' }, { status })
      expect(note()).toContain('The deal is not won, so no retainer invoice is drafted automatically')
      expect(note()).toContain('once the deal is won')
      expect(note()).not.toContain('on the next run')
      expect(manualNote()).toContain('An invoice created here is an extra one and leaves the next invoice date as it is')
      expect(manualNote()).not.toContain('bills October 2026 by hand')
      const nav = vi.fn()
      m.ui.bindNavigate(nav)
      await click(button(host, 'Create invoice'))
      expect(path(nav).q).toEqual({ companyId: 'co1', dealId: 'dl1', retainer: true })
    })
  }

  it('an archived won deal says drafting is paused until it is restored', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01' }, { archived: true })
    expect(note()).toContain('The deal is archived, so no retainer invoice is drafted automatically')
    expect(note()).toContain('when the deal is restored')
    expect(note()).not.toContain('is created automatically on 1 Nov 2099')
  })

  it('a won deal still gets the automatic-draft note', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01' }, { status: 'won' })
    expect(note()).toContain('A draft invoice for $4,500.00 is created automatically on 1 Nov 2099')
  })
})

describe('A retainer invoice made by hand', () => {
  const manualNote = (): string => host.querySelector('[aria-label="Create invoice by hand"]')?.textContent ?? ''

  it('while a period is due, Create invoice bills it and says the automatic draft is skipped', async () => {
    await showCard({ nextInvoiceDate: '2026-10-01', lastDraftedFor: '2026-09-01' })
    expect(manualNote()).toContain('Create invoice bills October 2026 by hand')
    expect(manualNote()).toContain('the automatic draft for October 2026 is skipped')
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(button(host, 'Create invoice'))
    expect(path(nav).q).toEqual({ companyId: 'co1', dealId: 'dl1', retainer: true, retainerFor: '2026-10-01' })
  })

  it('before the date, an invoice made here is an extra one and the card says the draft still comes', async () => {
    await showCard({ nextInvoiceDate: '2099-11-01' })
    expect(manualNote()).toContain('An invoice created here is an extra one: the November 2099 draft is still made automatically on 1 Nov 2099')
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(button(host, 'Create invoice'))
    expect(path(nav).q).toEqual({ companyId: 'co1', dealId: 'dl1', retainer: true })
  })

  it('says nothing extra without a next invoice date', async () => {
    await showCard({})
    expect(host.querySelector('[aria-label="Create invoice by hand"]')).toBeNull()
  })

  async function openEditor(retainer: Record<string, unknown>, retainerFor: string, over: Parameters<typeof fakeApi>[0] = {}, deal: Record<string, unknown> = {}) {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', { ...ardDeal('dl1').data, ...deal })], billingPlans: [plan(retainer)] }))
    setArdRole(m, 'admin')
    m.ui.bindNavigate(vi.fn())
    const api = fakeApi({ ...base, 'POST /sales/invoices': () => json(201, dto({ id: 'n1', invoiceNumber: 'INV-0050', status: 'draft', issuedCount: 0, sentAt: null })), ...over })
    const { Invoice } = await import('../invoices/Invoice')
    await act(async () => { root.render(<Invoice route={{ page: 'invoice', id: 'new', q: { companyId: 'co1', dealId: 'dl1', retainer: true, retainerFor } }} />) })
    await settle(10)
    return api
  }

  it('saving it claims the period: the next invoice date moves on a month, so the scheduler does not draft it again', async () => {
    const api = await openEditor({ nextInvoiceDate: '2026-10-01', lastDraftedFor: '2026-09-01' }, '2026-10-01')
    expect((host.querySelector('[aria-label="Description line 1"]') as HTMLInputElement).value).toBe('Retainer, October 2026')
    expect(text()).toContain('This invoice bills the October 2026 retainer.')
    expect(text()).toContain('Saving it moves the automatic draft on to 1 Nov 2026')
    await click(button(host, 'Save draft'))
    await settle(6)
    expect(api.count('POST /sales/invoices')).toBe(1)
    expect(m.store.S.billingPlans[0].retainer).toMatchObject({ nextInvoiceDate: '2026-11-01', lastDraftedFor: '2026-09-01' })
    // anchorDay is the server's: it drops a client's value, so the claim never writes one.
    expect(m.store.S.billingPlans[0].retainer).not.toHaveProperty('anchorDay')
  })

  it('a claim into a shorter month with no anchor stored says the later drafts move to the shorter day', async () => {
    await openEditor({ nextInvoiceDate: '2026-08-31' }, '2026-08-31')
    expect(text()).toContain('Saving it moves the automatic draft on to 30 Sep 2026')
    expect(text()).toContain('Later drafts then fall on the 30th of each month, not the 31st')
    await click(button(host, 'Save draft'))
    await settle(6)
    expect(m.store.S.billingPlans[0].retainer).toEqual({ amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-09-30' })
  })

  it('with the anchor the server stored, a claim into a shorter month says nothing about later dates', async () => {
    await openEditor({ nextInvoiceDate: '2026-08-31', lastDraftedFor: '2026-07-31', anchorDay: 31 }, '2026-08-31')
    expect(text()).toContain('Saving it moves the automatic draft on to 30 Sep 2026')
    expect(text()).not.toContain('Later drafts then fall')
  })

  // The scheduler drafts October and moves the plan on, the way it does within 30 seconds of the date coming due.
  const serverDrafted = (): ChangeEntry[] => [change('billingPlans', 'bp_dl1', 2, plan({ nextInvoiceDate: '2026-11-01', lastDraftedFor: '2026-10-01' }).data, 'system')]
  const octoberDraft = { ...fromRetainer, dealId: 'dl1', companyId: 'co1', lineItems: [{ description: 'Retainer, October 2026', qty: 1, unitPriceCents: 450000, amountCents: 450000 }] }

  it('when the server drafts the period while the editor is open, saving stops and offers the automatic draft', async () => {
    const api = await openEditor({ nextInvoiceDate: '2026-10-01', lastDraftedFor: '2026-09-01' }, '2026-10-01', { [DEAL_LIST]: () => json(200, { invoices: [octoberDraft, manual] }) })
    expect(text()).toContain('This invoice bills the October 2026 retainer.')
    remote.changes = serverDrafted()
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(api.count('POST /sales/invoices')).toBe(0)
    const alert = host.querySelector('[role="alert"][aria-label="Retainer already drafted"]')?.textContent ?? ''
    expect(alert).toContain('The October 2026 retainer was drafted automatically while this was open as INV-0041')
    expect(alert).toContain('Nothing was saved')
    expect(text()).not.toContain('Saving it moves the automatic draft on')
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(button(host, 'Open INV-0041'))
    expect(path(nav).pathname).toBe('/sales/invoices/r1')
    // Choosing to keep it as an extra invoice saves it, and claims nothing.
    await click(button(host, 'Save as an extra invoice'))
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(api.count('POST /sales/invoices')).toBe(1)
    expect(m.store.S.billingPlans[0].retainer).toMatchObject({ nextInvoiceDate: '2026-11-01', lastDraftedFor: '2026-10-01' })
  })

  it('when the server drafts the period while the invoice is being created, it says there are two and does not move on', async () => {
    const created = dto({ id: 'n1', invoiceNumber: 'INV-0050', status: 'draft', issuedCount: 0, sentAt: null })
    const api = await openEditor({ nextInvoiceDate: '2026-10-01', lastDraftedFor: '2026-09-01' }, '2026-10-01', {
      [DEAL_LIST]: () => json(200, { invoices: [octoberDraft, manual] }),
      'POST /sales/invoices': () => { remote.changes = serverDrafted(); return json(201, created) },
    })
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(api.count('POST /sales/invoices')).toBe(1)
    const alert = host.querySelector('[role="alert"][aria-label="Two invoices for one retainer month"]')?.textContent ?? ''
    expect(alert).toContain('There are now two invoices for the October 2026 retainer')
    expect(alert).toContain('also drafted automatically as INV-0041')
    expect(alert).toContain('Delete one of the two drafts')
    // It stays on the warning rather than moving to the new invoice, and the plan keeps the server's dates.
    expect(nav).not.toHaveBeenCalled()
    expect(m.store.S.billingPlans[0].retainer).toEqual({ amountCents: 450000, interval: 'monthly', nextInvoiceDate: '2026-11-01', lastDraftedFor: '2026-10-01' })
    await click(button(host, 'Open INV-0041'))
    expect(path(nav).pathname).toBe('/sales/invoices/r1')
    await click(button(host, 'Open INV-0050'))
    expect(path(nav).pathname).toBe('/sales/invoices/n1')
  })

  it('issuing stops at the same warning, so the second invoice is never issued', async () => {
    const created = dto({ id: 'n1', invoiceNumber: 'INV-0050', status: 'draft', issuedCount: 0, sentAt: null })
    const api = await openEditor({ nextInvoiceDate: '2026-10-01', lastDraftedFor: '2026-09-01' }, '2026-10-01', {
      [DEAL_LIST]: () => json(200, { invoices: [octoberDraft, manual] }),
      'POST /sales/invoices': () => { remote.changes = serverDrafted(); return json(201, created) },
      'POST /sales/invoices/n1/issue': () => json(200, { ...created, status: 'sent' }),
    })
    await click(button(host, 'Issue invoice'))
    const confirm = m.ui.UI.get().modals.at(-1)
    expect(confirm?.name).toBe('confirm')
    await act(async () => { (confirm?.props.onConfirm as () => void)() })
    await settle(8)
    expect(api.count('POST /sales/invoices')).toBe(1)
    expect(api.count('POST /sales/invoices/n1/issue')).toBe(0)
    expect(text()).toContain('There are now two invoices for the October 2026 retainer')
  })

  it('claims nothing for a deal that is not won, even when the link names a due period', async () => {
    const api = await openEditor({ nextInvoiceDate: '2026-10-01', lastDraftedFor: '2026-09-01' }, '2026-10-01', {}, { status: 'open' })
    expect(text()).not.toContain('This invoice bills the')
    await click(button(host, 'Save draft'))
    await settle(6)
    expect(api.count('POST /sales/invoices')).toBe(1)
    expect(m.store.S.billingPlans[0].retainer?.nextInvoiceDate).toBe('2026-10-01')
  })

  it('claims nothing when the period has moved on since the card offered it', async () => {
    const api = await openEditor({ nextInvoiceDate: '2026-11-01', lastDraftedFor: '2026-10-01' }, '2026-10-01')
    expect(text()).not.toContain('This invoice bills the')
    expect((host.querySelector('[aria-label="Description line 1"]') as HTMLInputElement).value).toBe('Monthly retainer')
    await click(button(host, 'Save draft'))
    await settle(6)
    expect(api.count('POST /sales/invoices')).toBe(1)
    expect(m.store.S.billingPlans[0].retainer?.nextInvoiceDate).toBe('2026-11-01')
  })
})

describe('From retainer chip', () => {
  it('shows in the invoice list on retainer invoices only', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices': () => json(200, { invoices: [fromRetainer, manual] }), 'GET /sales/invoices/summary': () => json(200, SUMMARY) })
    const { Invoices } = await import('../invoices/Invoices')
    await act(async () => { root.render(<Invoices />) })
    await settle(8)
    const rows = [...host.querySelectorAll('tbody tr')].map(r => r.textContent ?? '')
    expect(rows.find(r => r.includes('INV-0041'))).toContain('From retainer')
    expect(rows.find(r => r.includes('INV-0030'))).not.toContain('From retainer')
  })

  async function openInvoice(inv: ReturnType<typeof dto>) {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ ...base, 'GET /sales/invoices/r1': () => json(200, inv) })
    const { Invoice } = await import('../invoices/Invoice')
    await act(async () => { root.render(<Invoice route={{ page: 'invoice', id: 'r1' }} />) })
    await settle(10)
    return [...host.querySelectorAll('.chip')].find(c => c.textContent === 'From retainer')
  }

  it('shows in the header of a retainer draft, which opens in the editor', async () => {
    const chip = await openInvoice({ ...fromRetainer, dealId: 'dl1', companyId: 'co1' })
    expect(text()).toContain('INV-0041')
    expect(chip).toBeTruthy()
    expect(chip?.querySelector('svg')).toBeTruthy()
  })

  it('stays on the invoice view once issued, and is absent on a manual invoice', async () => {
    expect(await openInvoice({ ...fromRetainer, status: 'sent', issuedCount: 1, sentAt: '2026-10-13T01:00:00.000Z', dealId: 'dl1', companyId: 'co1' })).toBeTruthy()
    act(() => root.unmount())
    root = createRoot(host)
    expect(await openInvoice({ ...fromRetainer, id: 'r1', source: 'manual', status: 'sent', issuedCount: 1 })).toBeUndefined()
  })
})

describe('Notifications: retainer kinds', () => {
  const drafted = rec('nt1', {
    userId: 'u-me', ts: '2026-10-13T09:00:00', read: false, type: 'Retainer invoice drafted', kind: 'retainer-invoice-drafted',
    title: 'Draft invoice INV-0041 ready', body: 'The October 2026 retainer invoice is drafted.', link: { page: 'deal', id: 'dl1' },
    data: { invoiceId: 'r1', invoiceNumber: 'INV-0041', dealId: 'dl1' },
  })
  const needs = rec('nt2', {
    userId: 'u-me', ts: '2026-10-13T08:00:00', read: false, type: 'Retainer needs a billing client', kind: 'retainer-needs-billing-client',
    title: 'Retainer due: Platform build has no billing client', body: 'Link one to draft the invoice.', link: { page: 'deal', id: 'dl1' },
    data: { dealId: 'dl1', companyId: 'co1' },
  })

  async function showNotifs(role: Parameters<typeof setArdRole>[1]) {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], notifications: [drafted, needs] }))
    setArdRole(m, role)
    const nav = vi.fn()
    m.ui.bindNavigate(nav)
    fakeApi({})
    const { Notifications } = await import('../home/Notifications')
    await act(async () => { root.render(<Notifications />) })
    await settle(4)
    return nav
  }

  it('the drafted notification opens the invoice, and marks it read', async () => {
    const nav = await showNotifs('admin')
    expect(text()).toContain('Draft invoice INV-0041 ready')
    await click(button(host, 'Open draft INV-0041'))
    expect(path(nav).pathname).toBe('/sales/invoices/r1')
    expect(m.store.S.notifications.find(n => n.id === 'nt1')?.read).toBe(true)
  })

  it('clicking the drafted row itself also opens the invoice', async () => {
    const nav = await showNotifs('admin')
    const row = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(r => r.textContent?.includes('INV-0041 ready'))
    await click(row)
    expect(path(nav).pathname).toBe('/sales/invoices/r1')
  })

  it('the needs-billing-client notification goes to the company billing details', async () => {
    const nav = await showNotifs('admin')
    await click(button(host, 'Add billing details'))
    const p = path(nav)
    expect(p.pathname).toContain('co1')
    expect(p.q).toEqual({ tab: 'overview', focus: 'billing-details' })
  })

  it('both offer Open deal', async () => {
    const nav = await showNotifs('admin')
    const deals = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Open deal')
    expect(deals).toHaveLength(2)
    await click(deals[0])
    expect(path(nav).pathname).toContain('dl1')
  })

  it('someone who cannot bill gets the deal and company, never the invoice or billing details', async () => {
    const nav = await showNotifs('sales')
    expect(button(host, 'Open draft INV-0041')).toBeUndefined()
    expect(button(host, 'Add billing details')).toBeUndefined()
    await click(button(host, 'Open company'))
    expect(path(nav).q).toEqual({ tab: 'overview' })
    const row = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(r => r.textContent?.includes('INV-0041 ready'))
    await click(row)
    expect(path(nav).pathname).toContain('dl1')
  })
})

describe('Company billing details focus', () => {
  it('scrolls to and focuses Billing details when routed with focus billing-details', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices?companyId=co1': () => json(200, { invoices: [] }), [CLIENTS]: () => json(200, { clients: [] }) })
    const { CompanyBilling } = await import('../companies/BillingCard')
    const { Q } = await import('../../data/Q')
    const company = Q.company('co1')!
    await act(async () => { root.render(<CompanyBilling company={company} focusDetails />) })
    await settle(8)
    const region = host.querySelector('[role="region"][aria-label="Billing details"]')
    expect(region).toBeTruthy()
    expect(document.activeElement).toBe(region)
  })

  it('does not move focus without the route asking', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices?companyId=co1': () => json(200, { invoices: [] }), [CLIENTS]: () => json(200, { clients: [] }) })
    const { CompanyBilling } = await import('../companies/BillingCard')
    const { Q } = await import('../../data/Q')
    const company = Q.company('co1')!
    await act(async () => { root.render(<CompanyBilling company={company} />) })
    await settle(8)
    expect(document.activeElement).not.toBe(host.querySelector('[role="region"][aria-label="Billing details"]'))
  })
})
