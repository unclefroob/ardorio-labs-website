import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { boardInvoices, invoicingWorld, setArdRole, SUMMARY } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

// "Today" is the server clock the fixture bootstrap carries: 9 Oct 2026.
const LIST = 'GET /sales/invoices'
const SUM = 'GET /sales/invoices/summary'
const CSV = 'GET /sales/invoices/export.csv'

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
const rowsText = (): string[] => [...host.querySelectorAll('tbody tr')].map(r => r.textContent ?? '')

async function show(routes: Parameters<typeof fakeApi>[0], role: Parameters<typeof setArdRole>[1] = 'admin') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, role)
  const api = fakeApi(routes)
  const { Invoices } = await import('./Invoices')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><Invoices /><Hosts /></>) })
  await settle(8)
  return api
}

describe('Invoices list', () => {
  const ok = { [LIST]: () => json(200, { invoices: boardInvoices() }), [SUM]: () => json(200, SUMMARY) }

  it('shows ex-GST tiles with GST in faint text underneath', async () => {
    await show(ok)
    expect(text()).toContain('$22,500')
    expect(text()).toContain('$24,750 inc GST')
    expect(text()).toContain('$4,500')
    expect(text()).toContain('1 overdue')
    expect(text()).toContain('Banksia Advisory, 7 days late')
    expect(text()).toContain('$9,600')
    expect(text()).toContain('$12,540 inc GST · 2 invoices')
    expect(text()).toContain('$18,000')
    expect(text()).toContain('Not yet issued')
  })

  it('has status tabs with counts and the static Xero chip', async () => {
    await show(ok)
    const tabs = [...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)
    expect(tabs).toEqual(['All5', 'Drafts1', 'Sent2', 'Overdue1', 'Paid2'])
    expect(text()).toContain('Xero: not connected')
    expect(button(host, 'Xero: not connected')).toBeUndefined()
  })

  it('lists newest first, with total and ex-GST amounts, due dates and the overdue note', async () => {
    await show(ok)
    const r = rowsText()
    expect(r).toHaveLength(5)
    expect(r[0]).toContain('INV-0035')
    expect(r[0]).toContain('Not issued')
    expect(r[0]).toContain('45-day terms')
    expect(r[0]).toContain('$19,800.00')
    expect(r[0]).toContain('$18,000.00 ex GST')
    expect(r[2]).toContain('INV-0033')
    expect(r[2]).toContain('2 Oct 2026')
    expect(r[2]).toContain('7 days overdue')
    expect(r[2]).toContain('Overdue')
    expect(r[3]).toContain('Paid')
    expect(r[3]).toContain('Bank transfer')
    expect(r[3]).toContain('6 Oct 2026')
    expect(r[4]).toContain('PayID')
  })

  it('links the customer to the CRM company and the deal to the deal, and shows No deal otherwise', async () => {
    await show(ok)
    const links = [...host.querySelectorAll('tbody a')].map(a => [a.textContent, a.getAttribute('href')])
    expect(links).toContainEqual(['Tidewater Foods', '/sales/companies/co1'])
    expect(links).toContainEqual(['Platform build, phase 2', '/sales/deals/dl1'])
    expect(rowsText()[2]).toContain('No deal')
  })

  it('the Overdue tab shows only late sent invoices; Sent includes them', async () => {
    await show(ok)
    await click([...host.querySelectorAll('[role="tab"]')].find(t => t.textContent?.startsWith('Overdue')))
    expect(rowsText().map(r => r.slice(0, 8))).toEqual(['INV-0033'])
    await click([...host.querySelectorAll('[role="tab"]')].find(t => t.textContent?.startsWith('Sent')))
    expect(rowsText().map(r => r.slice(0, 8))).toEqual(['INV-0034', 'INV-0033'])
    await click([...host.querySelectorAll('[role="tab"]')].find(t => t.textContent?.startsWith('Drafts')))
    expect(rowsText().map(r => r.slice(0, 8))).toEqual(['INV-0035'])
  })

  it('searches by number, customer or deal', async () => {
    await show(ok)
    const box = host.querySelector<HTMLInputElement>('input[aria-label="Search number, customer or deal"]')
    await type(box, 'larch')
    expect(rowsText()).toHaveLength(1)
    expect(rowsText()[0]).toContain('INV-0031')
    await type(box, 'platform build')
    expect(rowsText().map(r => r.slice(0, 8))).toEqual(['INV-0035', 'INV-0034'])
    await type(box, 'zzz')
    expect(text()).toContain('No invoices match')
  })

  it('shows the right row actions per status', async () => {
    await show(ok)
    const r = [...host.querySelectorAll('tbody tr')]
    const has = (i: number, label: string): boolean => [...r[i].querySelectorAll('button')].some(b => b.textContent === label)
    expect(has(0, 'Edit')).toBe(true)
    expect(has(0, 'Mark paid')).toBe(false)
    expect(has(1, 'Mark paid')).toBe(true)
    expect(has(3, 'Mark paid')).toBe(false)
  })

  it('Mark paid on a row opens the dialog for that invoice', async () => {
    await show(ok)
    await click([...host.querySelectorAll('tbody tr')][1].querySelectorAll('button')[0])
    expect(m.ui.UI.get().modals.map(x => x.name)).toEqual(['markPaid'])
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Mark INV-0034 as paid')
  })

  it('Export CSV downloads from the authenticated endpoint', async () => {
    const api = await show({ ...ok, [CSV]: () => new Response('a,b', { headers: { 'Content-Type': 'text/csv' } }) })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }))
    const click_ = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await click(button(host, 'Export CSV'))
    await settle(4)
    expect(api.count(CSV)).toBe(1)
    expect(click_).toHaveBeenCalled()
  })

  it('empty state offers New invoice and Go to Deals', async () => {
    await show({ [LIST]: () => json(200, { invoices: [] }), [SUM]: () => json(200, { ...SUMMARY, tiles: { outstandingCents: 0, overdueCents: 0, paidThisMonthCents: 0, draftCount: 0, draftCents: 0 } }) })
    expect(text()).toContain('No invoices yet')
    expect(button(host, 'New invoice')).toBeDefined()
    expect(button(host, 'Go to Deals')).toBeDefined()
    expect(text()).toContain('Nothing overdue')
  })

  it('a 403 from the API shows the admins-only state, not a table', async () => {
    await show({ [LIST]: () => json(403, { error: 'Forbidden', code: 'ROLE_REQUIRED' }), [SUM]: () => json(403, { error: 'Forbidden', code: 'ROLE_REQUIRED' }) })
    expect(text()).toContain('Invoices are for Ardorio admins')
    expect(host.querySelector('table')).toBeNull()
  })

  it('a server failure offers a retry', async () => {
    const api = await show({ [LIST]: () => json(500, { error: 'Database down', code: 'INTERNAL' }), [SUM]: () => json(500, { error: 'Database down', code: 'INTERNAL' }) })
    expect(text()).toContain("Couldn't load invoices")
    expect(text()).toContain('Database down')
    const before = api.count(LIST)
    await click(button(host, 'Try again'))
    await settle(4)
    expect(api.count(LIST)).toBe(before + 1)
  })
})
