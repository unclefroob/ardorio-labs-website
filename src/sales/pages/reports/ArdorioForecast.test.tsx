import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
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

// The fixture clock is 9 Oct 2026 (Melbourne): the forecast starts in October 2026.
const LIST = 'GET /sales/invoices'
const FC_ROUTE = { page: 'reports', q: { tab: 'ardorio', view: 'forecast' } }
const ms = (id: string, dollars: number, plannedDate?: string) => ({ id, label: `Milestone ${id}`, amountCents: dollars * 100, ...(plannedDate ? { plannedDate } : {}) })
const CONTRACT = (cents: number) => ({ baselineCents: cents, engagementType: 'fixed-price', contractedOn: '2026-06-01', contractedBy: 'Me Myself', estimateAtWonCents: cents })
const paidInv = (id: string, milestoneId: string, dollars: number, issueDate: string, paidAt: string): InvoiceDto =>
  dto({ id, invoiceNumber: `INV-${id}`, dealId: 'rit', companyId: 'co1', milestoneId, status: 'paid', subtotalCents: dollars * 100, issueDate, payment: { method: 'bank_transfer', paidAt, amountCents: dollars * 110, reference: '' } as never })

// Ritchies-shaped: $970,000 contracted, two paid milestones, 14 planned, and $10,000 not in milestones.
const RIT_MS = [
  ms('p1', 50000, '2026-06-15'), ms('p2', 41455, '2026-08-01'),
  ms('a1', 70000, '2026-11-16'), ms('a2', 70000, '2027-01-15'), ms('a3', 70000, '2027-02-15'), ms('a4', 70000, '2027-03-15'), ms('a5', 70000, '2027-04-15'), ms('a6', 67409, '2027-06-15'),
  ms('b1', 60000, '2027-08-25'), ms('b2', 60000, '2027-10-15'), ms('b3', 60000, '2027-12-15'), ms('b4', 60000, '2028-02-15'), ms('b5', 60000, '2028-04-17'), ms('b6', 51136, '2028-06-15'),
  ms('c1', 50000, '2029-04-16'), ms('d1', 50000, '2030-04-15'),
]
const INVOICES: InvoiceDto[] = [
  paidInv('i1', 'p1', 50000, '2026-07-01', '2026-08-14'),
  paidInv('i2', 'p2', 41455, '2026-08-20', '2026-10-03'),
  // Cancelled and test invoices never count.
  dto({ id: 'v', invoiceNumber: 'INV-v', dealId: 'rit', companyId: 'co1', milestoneId: 'a1', status: 'void', subtotalCents: 7000000 }),
  dto({ id: 't', invoiceNumber: 'INV-t', dealId: 'rit', companyId: 'co1', milestoneId: 'a2', status: 'paid', subtotalCents: 7000000, test: { markedAt: '2026-09-01', markedBy: 'u', reason: 'demo' } }),
]

async function show(o: { role?: Parameters<typeof setArdRole>[1]; route?: unknown; invoices?: InvoiceDto[]; status?: number } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    pipelines: [rec('pl1', { businessId: 'ard', name: 'Ardorio', fields: [], stages: [{ id: 'sg1', name: 'Proposal', prob: 40, required: [], won: false, lost: false }] })],
    deals: [
      // Open, $50,000 at stage probability 40% (its own probability is 50): $20,000 weighted, closing 1 Dec 2026.
      // op2: $100,000 at the same stage, no close date: $40,000 weighted in No date.
      invoicingWorld().collections.deals[0],
      ardDeal('rit', { title: 'Ritchies platform', value: 970000 }),
      ardDeal('op2', { status: 'open', value: 100000, close: '', probability: 10 }),
      ardDeal('nc', { title: 'No contract deal', value: 5000 }),
    ],
    billingPlans: [
      rec('bp_rit', { dealId: 'rit', businessId: 'ard', milestones: RIT_MS, contract: CONTRACT(97000000) }),
    ],
  }))
  setArdRole(m, o.role === undefined ? 'admin' : o.role)
  nav = vi.fn<Navigate>()
  m.ui.bindNavigate(nav)
  const api = fakeApi({ [LIST]: () => json(o.status ?? 200, o.status && o.status >= 400 ? { error: 'Admins only', code: 'ROLE_REQUIRED' } : { invoices: o.invoices ?? INVOICES }) })
  const { Reports } = await import('./Reports')
  const route = (o.route === undefined ? FC_ROUTE : o.route) as never
  await act(async () => { root.render(<Reports route={route} />) })
  await settle(4)
  return api
}

const section = (): Element | null => host.querySelector('section[data-ard-forecast]')
const tile = (label: string): { v: string; s: string } | null => {
  const t = [...(section()?.querySelectorAll('.kpi') ?? [])].find(x => x.querySelector('.l')?.textContent === label)
  return t ? { v: t.querySelector('.v')?.textContent ?? '', s: t.querySelector('.s')?.textContent ?? '' } : null
}
const table = (name: string): HTMLTableElement | null => host.querySelector(`table[aria-label="${name}"]`)
const rowOf = (t: HTMLTableElement | null, start: string): string[] => {
  const tr = [...(t?.querySelectorAll('tbody tr') ?? [])].find(r => r.querySelector('th')?.textContent?.startsWith(start))
  return tr ? [...tr.querySelectorAll('th,td')].map(c => c.textContent ?? '') : []
}
const seg = (label: string): Element | null => host.querySelector(`[role="group"][aria-label="${label}"]`)

describe('Reports › Ardorio revenue › Forecast', () => {
  it('is a View next to the report: the report stays the default and the forecast reads the invoice list', async () => {
    const api = await show({ route: { page: 'reports', q: { tab: 'ardorio' } } })
    expect(section()).toBeNull()
    expect([...(seg('View')?.querySelectorAll('button') ?? [])].map(b => b.textContent)).toEqual(['Report', 'Forecast'])
    expect(seg('View')?.querySelector('[aria-pressed="true"]')?.textContent).toBe('Report')
    expect(api.count(LIST)).toBe(0)
    await click(button(seg('View')!, 'Forecast'))
    await settle(4)
    expect(section()).not.toBeNull()
    expect(api.count(LIST)).toBe(1)
    expect(m.ui.UI.get().route.q).toEqual({ tab: 'ardorio', view: 'forecast' })
  })

  it('shows the tiles, and the backlog reconciles: in range + later + no date + unscheduled', async () => {
    await show()
    expect(tile('Contracted backlog')).toEqual({ v: '$878,545', s: 'Contracted minus invoiced · 1 deal' })
    // Next 12 months, October 2026 to September 2027: all of FY27 and August 2027.
    expect(tile('Forecast invoiced')?.v).toBe('$477,409')
    expect(tile('Unscheduled')?.v).toBe('$10,000')
    expect(tile('No date')?.v).toBe('$0')
    expect(tile('Weighted pipeline')?.v).toBe('$20,000')
    expect(tile('Weighted pipeline')?.s).toContain('$60,000 of $150,000 unweighted in all')
    expect(host.querySelector('[data-reconcile]')?.textContent).toBe('Backlog $878,545 = $477,409 in range + $391,136 later + $0 no date + $10,000 unscheduled.')
    expect(host.textContent).toContain('1 won deal has no contract yet and is not in the forecast')
  })

  it('assumes 30 days to pay with only two paid invoices, and lets the viewer set the days for this view', async () => {
    await show()
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!
    const label = host.querySelector(`label[for="${input.id}"]`)
    expect(label?.textContent).toBe('Days to pay')
    expect(input.value).toBe('30')
    expect(host.textContent).toContain('Collected assumes 30 days to pay (the default: fewer than 3 invoices paid in the last 24 months, 2 so far)')
    // 25 Aug 2027 + 30 days is 24 Sep 2027, in range; + 44 days is 8 Oct 2027, Later.
    expect(tile('Forecast collected')?.v).toBe('$477,409')
    await type(input, '44')
    expect(tile('Forecast collected')?.v).toBe('$417,409')
    expect(host.textContent).toContain('Collected assumes 44 days to pay (set for this view')
    expect(localStorage.length).toBe(0)
    await click(button(host, 'Reset'))
    expect(input.value).toBe('30')
  })

  it('tables by month and by financial year carry headers and rows that expand to the deal’s milestones, linking to its Billing tab', async () => {
    await show()
    const byMonth = table('Ardorio forecast by month')
    expect([...(byMonth?.querySelectorAll('thead th') ?? [])].map(t => t.textContent)).toEqual(['Month', 'Forecast invoiced', 'Forecast collected', 'Retainer invoiced', 'Retainer collected', 'Weighted pipeline'])
    expect(byMonth?.querySelectorAll('thead th[scope="col"]').length).toBe(6)
    expect(rowOf(byMonth, 'Nov 2026').slice(1)).toEqual(['$70,000', '$0', '$0', '$0', '$0'])
    expect(rowOf(byMonth, 'Dec 2026').slice(1)).toEqual(['$0', '$70,000', '$0', '$0', '$20,000'])
    expect(rowOf(byMonth, 'Later')[1]).toBe('$391,136')
    expect(rowOf(byMonth, 'No date').slice(1)).toEqual(['$0', '$0', '$0', '$0', '$40,000'])

    const exp = byMonth?.querySelector<HTMLButtonElement>('button[aria-label="Expand Nov 2026"]')
    expect(exp?.getAttribute('aria-expanded')).toBe('false')
    await click(exp)
    expect(exp?.getAttribute('aria-expanded')).toBe('true')
    expect(exp?.getAttribute('aria-label')).toBe('Collapse Nov 2026')
    const panel = host.querySelector(`[id="${exp?.getAttribute('aria-controls')}"]`)
    expect(panel?.textContent).toContain('Ritchies platform')
    expect(panel?.textContent).toContain('Milestone a1')
    const link = panel?.querySelector('a')
    expect(link?.getAttribute('href')).toContain('rit')
    await click(link)
    expect(nav).toHaveBeenCalled()

    const byFy = table('Ardorio forecast by financial year')
    expect([...(byFy?.querySelectorAll('tbody th') ?? [])].map(t => t.textContent)).toEqual(['FY27 (Oct 2026 to Jun 2027)', 'FY28 (Jul 2027 to Sep 2027)', 'Later (after Sep 2027)', 'No date', 'Unscheduled (contract not in milestones)'])
    expect(rowOf(byFy, 'FY27')[1]).toBe('$417,409')
    expect(byFy?.querySelector('button[aria-label="Expand FY27 (Oct 2026 to Jun 2027)"]')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('By financial year reaches the last planned milestone, and slippage moves planned milestones later', async () => {
    await show()
    await click(button(seg('Range')!, 'By financial year'))
    const byFy = table('Ardorio forecast by financial year')
    const fys = (): string[] => [...(byFy?.querySelectorAll('tbody th') ?? [])].map(t => t.textContent ?? '')
    expect(fys().slice(0, 4)).toEqual(['FY27 (Oct 2026 to Jun 2027)', 'FY28', 'FY29', 'FY30'])
    expect(rowOf(byFy, 'FY27')[1]).toBe('$417,409')
    expect(rowOf(byFy, 'FY28')[1]).toBe('$351,136')
    expect(rowOf(byFy, 'FY29')[1]).toBe('$50,000')
    expect(rowOf(byFy, 'FY30')[1]).toBe('$50,000')

    const slip = seg('Assume planned milestones slip by, in months')
    expect([...(slip?.querySelectorAll('button') ?? [])].map(b => b.textContent)).toEqual(['0', '1', '2', '3'])
    await click(button(slip!, '1'))
    // 15 Jun 2027 slips into July: FY28.
    expect(rowOf(byFy, 'FY27')[1]).toBe('$350,000')
    expect(host.textContent).toContain('Planned milestones not yet delivered are moved 1 month later')
    expect(host.querySelector('[data-reconcile]')?.textContent).toContain('Backlog $878,545 = ')
  })

  it('draws the chart with the pipeline named and hatched, never by colour alone', async () => {
    await show()
    const chart = host.querySelector('[role="group"][aria-label^="Ardorio forecast by month"]')
    expect([...(chart?.querySelectorAll('table.sr-only thead th') ?? [])].map(t => t.textContent)).toEqual(['Item', 'Forecast invoiced', 'Forecast collected', 'Weighted pipeline'])
    expect(chart?.querySelector('title')?.textContent).toBe('Oct 2026: Forecast invoiced $0, Forecast collected $0, Weighted pipeline $0')
    expect(chart?.querySelector('rect[fill="url(#ard-fc-hatch)"]')).not.toBeNull()
    expect(host.querySelector('pattern#ard-fc-hatch')).not.toBeNull()
    expect(host.textContent).toContain('Weighted pipeline (hatched, apart)')
  })

  it('is not there for anyone but Ardorio admins (or super): no tab, no View, no invoice read', async () => {
    for (const role of ['manager', 'sales', 'viewer', null] as const) {
      const api = await show({ role })
      expect(section()).toBeNull()
      expect(seg('View')).toBeNull()
      expect([...host.querySelectorAll('[role="tab"]')].map(t => t.textContent)).not.toContain('Ardorio revenue')
      expect(api.count(LIST)).toBe(0)
      act(() => root.unmount())
      root = createRoot(host)
    }
    await show({ role: 'super' })
    expect(section()).not.toBeNull()
  })

  it('says so when the invoice list is refused', async () => {
    await show({ status: 403 })
    expect(section()?.textContent).toContain('The Ardorio forecast is for Ardorio admins')
  })
})
