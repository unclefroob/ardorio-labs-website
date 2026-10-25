import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, dto, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales } from '../../testing/load'
import { account, accountsOf, fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root

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

// The Ritchies-shaped Ardorio contract of the forecast tests (fixture clock 9 Oct 2026): next 12 months to invoice $477,409.
const ms = (id: string, dollars: number, plannedDate?: string) => ({ id, label: `Milestone ${id}`, amountCents: dollars * 100, ...(plannedDate ? { plannedDate } : {}) })
const paidInv = (id: string, milestoneId: string, dollars: number, issueDate: string, paidAt: string): InvoiceDto =>
  dto({ id, invoiceNumber: `INV-${id}`, dealId: 'rit', companyId: 'co1', milestoneId, status: 'paid', subtotalCents: dollars * 100, issueDate, payment: { method: 'bank_transfer', paidAt, amountCents: dollars * 110, reference: '' } as never })
const MS = [
  ms('p1', 50000, '2026-06-15'), ms('p2', 41455, '2026-08-01'),
  ms('a1', 70000, '2026-11-16'), ms('a2', 70000, '2027-01-15'), ms('a3', 70000, '2027-02-15'), ms('a4', 70000, '2027-03-15'), ms('a5', 70000, '2027-04-15'), ms('a6', 67409, '2027-06-15'),
  ms('b1', 60000, '2027-08-25'), ms('b2', 60000, '2027-10-15'), ms('b3', 60000, '2027-12-15'), ms('b4', 60000, '2028-02-15'), ms('b5', 60000, '2028-04-17'), ms('b6', 51136, '2028-06-15'),
  ms('c1', 50000, '2029-04-16'), ms('d1', 50000, '2030-04-15'),
]
const INVOICES: InvoiceDto[] = [paidInv('i1', 'p1', 50000, '2026-07-01', '2026-08-14'), paidInv('i2', 'p2', 41455, '2026-08-20', '2026-10-03')]
const biz = (id: string, name: string) => rec(id, { name, short: id.toUpperCase(), accent: '#654321', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl2', industries: [], roles: [] })

async function show(o: { ard?: 'admin' | 'sales'; ros?: 'admin' | 'sales'; accounts?: ReturnType<typeof account>[] | null; invoices?: InvoiceDto[] } = {}) {
  const m = await loadSales()
  const w = invoicingWorld()
  m.bootstrap.hydrate(invoicingWorld({
    businesses: [w.collections.businesses[0], biz('ros', 'Rosterio'), biz('adv', 'Advantage')],
    pipelines: [rec('pl1', { businessId: 'ard', name: 'Ardorio', fields: [], stages: [{ id: 'sg1', name: 'Proposal', prob: 40, required: [], won: false, lost: false }] })],
    deals: [
      invoicingWorld().collections.deals[0],
      ardDeal('rit', { title: 'Ritchies platform', value: 970000 }),
      ardDeal('av1', { businessId: 'adv', recurring: true, value: 12000, pipelineId: 'pl2' }),
      ardDeal('rd1', { businessId: 'ros', recurring: true, value: 30000, pipelineId: 'pl2' }),
    ],
    billingPlans: [rec('bp_rit', { dealId: 'rit', businessId: 'ard', milestones: MS, contract: { baselineCents: 97000000, engagementType: 'fixed-price', contractedOn: '2026-06-01', contractedBy: 'Me', estimateAtWonCents: 97000000 } })],
  }))
  setArdRole(m, o.ard ?? 'admin', { ros: o.ros ?? 'admin', adv: 'sales' })
  m.ui.bindNavigate(vi.fn())
  const api = fakeApi({
    'GET /sales/invoices': () => json(200, { invoices: o.invoices ?? INVOICES }),
    'GET /sales/rosterio/accounts': () => (o.accounts === null ? json(500, { error: 'down', code: 'SERVER' }) : json(200, accountsOf(o.accounts ?? [account({ id: 'a', name: 'A', monthlyCost: 1000 }), account({ id: 'b', name: 'B', monthlyCost: 500 }), account({ id: 'c', name: 'C' })]))),
  })
  const { Reports } = await import('./Reports')
  await act(async () => { root.render(<Reports route={{ page: 'reports', q: { tab: 'revenue' } } as never} />) })
  await settle(6)
  return api
}

const section = (): Element | null => host.querySelector('section[data-revenue-all]')
const tile = (label: string): string => [...(section()?.querySelectorAll('.kpi') ?? [])].find(x => x.querySelector('.l')?.textContent?.includes(label))?.querySelector('.v')?.textContent ?? ''
const row = (name: string): string[] => {
  const tr = [...(section()?.querySelectorAll('table[aria-label="Revenue by business"] tbody tr') ?? [])].find(r => r.querySelector('td b')?.textContent === name)
  return tr ? [...tr.querySelectorAll('td')].slice(1).map(c => c.textContent ?? '') : []
}

describe('Reports › Revenue (all businesses)', () => {
  it('is a tab for everyone, and the Ardorio revenue tab stays for Ardorio admins', async () => {
    await show()
    expect([...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)).toEqual(['Overview', 'Revenue', 'Ardorio revenue'])
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Revenue')
    expect(host.querySelector('h1')?.textContent).toBe('Revenue')
  })

  it('shows each business from its own source, and adds up only what is shown', async () => {
    await show()
    // Ardorio: the forecast's $477,409 over 12 months; Rosterio: $1,500 a month × 12; Advantage: a $12,000 yearly deal.
    expect(row('Ardorio')[1]).toBe('$477,409')
    expect(row('Rosterio')[0]).toBe('$18,000')
    expect(row('Rosterio')[1]).toBe('$18,000')
    expect(row('Rosterio')[3]).toContain('1 without a price')
    expect(row('Advantage')[0]).toBe('$12,000')
    expect(tile('Recurring revenue (ARR)')).toBe('$30,000')
    expect(tile('Contracted')).toBe('$507,409')
    expect(host.textContent).toContain('Total')
    expect(host.textContent).not.toContain('Total of the businesses shown')
  })

  it('keeps the pipeline apart, and leaves Rosterio\'s won deal out because its accounts are the source', async () => {
    await show()
    expect(tile('Weighted pipeline')).toBeDefined()
    expect(tile('Recurring revenue (ARR)')).not.toBe('$60,000')
  })

  it('says Rosterio\'s prices are for Rosterio admins and leaves it out of the totals', async () => {
    const api = await show({ ros: 'sales' })
    expect(row('Rosterio')[3]).toContain('Rosterio prices are shown to Rosterio admins')
    expect(row('Rosterio')[0]).toBe('Not shown')
    expect(tile('Recurring revenue (ARR)')).toBe('$12,000')
    expect(host.textContent).toContain('Total of the businesses shown')
    expect(api.count('GET /sales/invoices')).toBe(1)
  })

  it('does not ask for invoices when the person is not an Ardorio admin, and shows Ardorio locked', async () => {
    const api = await show({ ard: 'sales' })
    expect(api.count('GET /sales/invoices')).toBe(0)
    expect(row('Ardorio')[3]).toContain('Ardorio contracts are shown to Ardorio admins')
    expect(row('Ardorio')[0]).toBe('Not shown')
    expect(host.textContent).toContain('Total of the businesses shown')
  })

  it('shows a row that failed with Try again, and the other rows stay', async () => {
    const api = await show({ accounts: null })
    expect(row('Rosterio')[3]).toContain('could not be read')
    expect(row('Advantage')[0]).toBe('$12,000')
    const before = api.count('GET /sales/rosterio/accounts')
    await click(button(section()!, 'Try again'))
    await settle(4)
    expect(api.count('GET /sales/rosterio/accounts')).toBeGreaterThan(before)
  })

  it('draws a bar a month and a financial year each', async () => {
    await show()
    const rows = (): number => section()?.querySelectorAll('table.sr-only tbody tr').length ?? 0
    expect(rows()).toBe(12)
    await click(button(section()!, 'Next 24 months'))
    expect(rows()).toBe(24)
    await click(button(section()!, 'By financial year'))
    expect(rows()).toBeGreaterThanOrEqual(2)
  })
})
