import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BootstrapRecord, InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { ardDeal, dto, invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
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
type Navigate = (to: string | number, opts?: { replace?: boolean }) => void
let nav: Mock<Navigate>

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

// The same Ritchies-shaped contract as the Ardorio forecast test (fixture clock 9 Oct 2026): the card must read the same numbers.
const LIST = 'GET /sales/invoices'
const ms = (id: string, dollars: number, plannedDate?: string) => ({ id, label: `Milestone ${id}`, amountCents: dollars * 100, ...(plannedDate ? { plannedDate } : {}) })
const paidInv = (id: string, milestoneId: string, dollars: number, issueDate: string, paidAt: string): InvoiceDto =>
  dto({ id, invoiceNumber: `INV-${id}`, dealId: 'rit', companyId: 'co1', milestoneId, status: 'paid', subtotalCents: dollars * 100, issueDate, payment: { method: 'bank_transfer', paidAt, amountCents: dollars * 110, reference: '' } as never })
const RIT_MS = [
  ms('p1', 50000, '2026-06-15'), ms('p2', 41455, '2026-08-01'),
  ms('a1', 70000, '2026-11-16'), ms('a2', 70000, '2027-01-15'), ms('a3', 70000, '2027-02-15'), ms('a4', 70000, '2027-03-15'), ms('a5', 70000, '2027-04-15'), ms('a6', 67409, '2027-06-15'),
  ms('b1', 60000, '2027-08-25'), ms('b2', 60000, '2027-10-15'), ms('b3', 60000, '2027-12-15'), ms('b4', 60000, '2028-02-15'), ms('b5', 60000, '2028-04-17'), ms('b6', 51136, '2028-06-15'),
  ms('c1', 50000, '2029-04-16'), ms('d1', 50000, '2030-04-15'),
]
const INVOICES: InvoiceDto[] = [paidInv('i1', 'p1', 50000, '2026-07-01', '2026-08-14'), paidInv('i2', 'p2', 41455, '2026-08-20', '2026-10-03')]

async function show(o: { role?: Parameters<typeof setArdRole>[1]; invoices?: InvoiceDto[]; status?: number; plans?: BootstrapRecord[]; noPlans?: boolean } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    pipelines: [rec('pl1', { businessId: 'ard', name: 'Ardorio', fields: [], stages: [{ id: 'sg1', name: 'Proposal', prob: 40, required: [], won: false, lost: false }] })],
    deals: [
      invoicingWorld().collections.deals[0],
      ardDeal('rit', { title: 'Ritchies platform', value: 970000 }),
      ardDeal('op2', { status: 'open', value: 100000, close: '', probability: 10 }),
    ],
    billingPlans: o.noPlans ? [] : [rec('bp_rit', { dealId: 'rit', businessId: 'ard', milestones: RIT_MS, contract: { baselineCents: 97000000, engagementType: 'fixed-price', contractedOn: '2026-06-01', contractedBy: 'Me', estimateAtWonCents: 97000000 } }), ...(o.plans ?? [])],
  }))
  setArdRole(m, o.role === undefined ? 'admin' : o.role)
  nav = vi.fn<Navigate>()
  m.ui.bindNavigate(nav)
  const api = fakeApi({ [LIST]: () => json(o.status ?? 200, o.status && o.status >= 400 ? { error: o.status === 403 ? 'Admins only' : 'Boom', code: o.status === 403 ? 'ROLE_REQUIRED' : 'SERVER' } : { invoices: o.invoices ?? INVOICES }) })
  const { Dashboard } = await import('./Dashboard')
  await act(async () => { root.render(<Dashboard />) })
  await settle(4)
  return api
}

const card = (): Element | null => [...host.querySelectorAll('section.card')].find(c => c.querySelector('.card-h h3')?.textContent === 'Revenue outlook') ?? null
const tile = (label: string): { v: string; s: string } | null => {
  const t = [...(card()?.querySelectorAll('.kpi') ?? [])].find(x => x.querySelector('.l')?.textContent === label)
  return t ? { v: t.querySelector('.v')?.textContent ?? '', s: t.querySelector('.s')?.textContent ?? '' } : null
}
const seg = (label: string): Element | null => card()?.querySelector(`[role="group"][aria-label="${label}"]`) ?? null
const chartRows = (): string[][] => [...(card()?.querySelectorAll('table.sr-only tbody tr') ?? [])].map(r => [...r.querySelectorAll('th,td')].map(c => c.textContent ?? ''))

describe('Dashboard › Revenue outlook (Ardorio admin)', () => {
  it('reads the same numbers as the Ardorio forecast report and keeps the pipeline apart', async () => {
    const api = await show()
    expect(api.count(LIST)).toBe(1)
    expect(tile('Contracted backlog')?.v).toBe('$878,545')
    expect(tile('To invoice, next 12 months')).toEqual({ v: '$477,409', s: 'Milestones $477,409 · instalments and retainers $0' })
    expect(tile('Recurring run-rate')?.v).toContain('$0')
    expect(tile('Weighted pipeline')?.v).toBe('$20,000')
    expect(tile('Weighted pipeline')?.s).toContain('never added to the totals')
    expect(host.textContent).not.toMatch(/\bMRR\b|\bARR\b/)
  })

  it('draws a bar a month for 12 months, 6 for six months, and a financial year each for the fy range', async () => {
    await show()
    expect(chartRows()).toHaveLength(12)
    expect(chartRows()[0][0]).toBe('Oct')
    await click(button(seg('Range')!, '6 months'))
    expect(chartRows()).toHaveLength(6)
    expect(tile('To invoice, next 6 months')?.v).toBe('$280,000')
    await click(button(seg('Range')!, 'Financial year'))
    expect(chartRows().length).toBeGreaterThanOrEqual(2)
    expect(chartRows()[0][0]).toMatch(/^FY27/)
  })

  it('switches to what is expected to be collected, using the median days to pay', async () => {
    await show()
    await click(button(seg('Basis')!, 'Collected'))
    // 44 days to pay: the 25 Aug 2027 milestone lands after the 12 months.
    expect(tile('To collect, next 12 months')?.v).toBe('$417,409')
  })

  it('lists the next items to invoice and what needs attention, linking to the full forecast', async () => {
    await show()
    const next = card()?.querySelector('table[aria-label="Next to invoice"]')
    expect(next?.querySelector('tbody tr')?.textContent).toContain('Ritchies platform')
    expect(next?.querySelector('tbody tr')?.textContent).toContain('$70,000')
    expect(card()?.textContent).toContain('Not yet in milestones')
    expect(card()?.textContent).toContain('$10,000')
    await click(button(card()!, 'Open full forecast'))
    const to = decodeURIComponent(String(nav.mock.calls.at(-1)?.[0]))
    expect(to).toContain('/reports')
    expect(to).toContain('"tab":"ardorio"')
    expect(to).toContain('"view":"forecast"')
  })

  it('says nothing is contracted yet, and still shows the pipeline', async () => {
    await show({ noPlans: true })
    expect(card()?.textContent).toContain('No contracted revenue yet')
    expect(card()?.textContent).toContain('$20,000')
  })

  it('shows an error with Try again when the invoices cannot be loaded, and the pipeline still shows', async () => {
    const api = await show({ status: 500 })
    expect(card()?.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded')
    expect(card()?.textContent).toContain('$60,000')
    expect(api.count(LIST)).toBe(1)
    await click(button(card()!, 'Try again'))
    await settle(4)
    expect(api.count(LIST)).toBe(2)
  })
})

describe('Dashboard › Revenue outlook (not an Ardorio admin)', () => {
  it('shows the weighted pipeline and a note, and never asks for invoices', async () => {
    const api = await show({ role: 'sales' })
    expect(api.count(LIST)).toBe(0)
    expect(card()?.textContent).toContain('shown to Ardorio admins')
    expect(card()?.textContent).toContain('$60,000')
    expect(tile('Contracted backlog')).toBeNull()
  })

  it('falls back to the same view when the server refuses the invoice list', async () => {
    await show({ status: 403 })
    expect(card()?.textContent).toContain('shown to Ardorio admins')
    expect(card()?.textContent).toContain('$60,000')
  })
})
