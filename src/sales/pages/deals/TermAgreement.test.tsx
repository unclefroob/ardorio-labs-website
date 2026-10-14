import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appliedResult, changes, rec } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { ardDeal, CLIENT, dto, invoicingWorld, SETTINGS, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'
import { formatCents } from '../../shared/money'
import { termSchedule } from '../../shared/termSchedule'
import type { TermInput } from '../../shared/term'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'

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

const fmt = formatCents
const text = (): string => host.textContent ?? ''

/**
 * Three years from 1 Oct 2025, quarterly in advance, $12,000 a year, CPI assumed 3%, break at each anniversary with 60
 * days notice, plus a $5,000 build fee. Year 1 quarters are $3,000, year 2 $3,090, year 3 $3,182.70. Today is 9 Oct 2026.
 */
const TERM: TermInput = { startDate: '2025-10-01', termMonths: 36, annualCents: 1200000, frequency: 'quarterly', timing: 'advance', escalation: 'cpi', escalationBp: 300, exit: 'break', breakNoticeDays: 60, autoDraft: true }
const SCHEDULE = termSchedule(TERM)
const BUILD = { id: 'b1', label: 'Build fee', amountCents: 500000, plannedDate: '2025-10-15' }
const PLAN = {
  dealId: 'dl1', businessId: 'ard', milestones: [BUILD, ...SCHEDULE], variations: [],
  contract: { baselineCents: 500000 + SCHEDULE.reduce((a, x) => a + x.amountCents, 0), engagementType: 'term-agreement', contractedOn: '2025-09-20', contractedBy: 'Me Myself', estimateAtWonCents: 4000000 },
  term: { ...TERM, draftFrom: '2025-09-20' },
}
const INVOICES = [
  dto({ id: 'q1', invoiceNumber: 'INV-0101', milestoneId: 'inst_1_1', status: 'paid', subtotalCents: 300000, source: 'term', payment: { method: 'bank-transfer', paidAt: '2025-10-20', amountCents: 330000, reference: '' } }),
  dto({ id: 'q2', invoiceNumber: 'INV-0102', milestoneId: 'inst_1_2', status: 'sent', overdue: true, subtotalCents: 300000, source: 'term', dueDate: '2026-02-15' }),
  dto({ id: 'q3', invoiceNumber: 'INV-0103', milestoneId: 'inst_1_3', status: 'sent', subtotalCents: 300000, source: 'term', dueDate: '2026-11-15' }),
  dto({ id: 'q4', invoiceNumber: 'INV-0104', milestoneId: 'inst_1_4', status: 'draft', subtotalCents: 300000, source: 'term', issuedCount: 0, sentAt: null }),
]

async function show(o: { plan?: Record<string, unknown>; role?: Parameters<typeof setArdRole>[1]; invoices?: unknown[] } = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', { ...PLAN, ...o.plan })] }))
  setArdRole(m, o.role ?? 'admin')
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const api = fakeApi({
    'GET /sales/invoices?dealId=dl1': () => json(200, { invoices: o.invoices ?? INVOICES }),
    'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }),
    'GET /sales/invoices/settings': () => json(200, SETTINGS),
  })
  const { BillingCard } = await import('./BillingCard')
  const { Q } = await import('../../data/Q')
  const { Hosts } = await import('../../shell/Hosts')
  const deal = Q.deal('dl1')!
  await act(async () => { root.render(<><BillingCard deal={deal} /><Hosts /></>) })
  await settle(8)
  return { api, nav, plan: () => m.store.S.billingPlans.find(p => p.dealId === 'dl1')! }
}

const termCard = (): HTMLElement => [...host.querySelectorAll('section.card')].find(s => s.querySelector('h3')?.textContent === 'Term agreement') as HTMLElement
const scheduleRows = (): string[] => [...host.querySelectorAll('table[aria-label="Term schedule"] tbody tr')].map(r => r.textContent ?? '')
const fact = (label: string): string => [...termCard().querySelectorAll('dl > div')].find(d => d.querySelector('dt')?.textContent === label)?.textContent ?? ''

describe('Billing tab: term agreement', () => {
  it('shows the term: start, end, ends in N days, annual fee, billing, rise, exit with next anniversary and notice-by', async () => {
    await show()
    expect(termCard()).toBeTruthy()
    expect(fact('Start')).toContain('1 Oct 2025')
    expect(fact('End')).toContain('30 Sep 2028')
    expect(fact('End')).toContain('Last day; ends in 723 days')
    expect(fact('Annual fee (ex GST)')).toContain(fmt(1200000))
    expect(fact('Annual fee (ex GST)')).toContain(`year 3 ${fmt(1273080)}`)
    expect(fact('Billed')).toContain('Quarterly, in advance')
    expect(fact('Yearly rise')).toContain('CPI, assumed 3% a year')
    expect(fact('Exit')).toContain('Break at each anniversary')
    expect(fact('Exit')).toContain('Next anniversary 1 Oct 2027; notice by 2 Aug 2027 (60 days)')
    expect(termCard().textContent).toContain('Ends in 723 days')
    // No MRR or ARR anywhere for Ardorio.
    expect(text()).not.toMatch(/\bMRR\b|\bARR\b/)
  })

  it('says when the notice window of the next anniversary has closed, and where the client can break next', async () => {
    // A year's notice: for 1 Oct 2027 it was due by 1 Oct 2026, before today (9 Oct 2026). 1 Oct 2028 is the term end.
    await show({ plan: { term: { ...TERM, breakNoticeDays: 365, draftFrom: '2025-09-20' } } })
    expect(fact('Exit')).toContain('Next anniversary 1 Oct 2027: the notice window closed on 1 Oct 2026, so the client cannot break there.')
    expect(fact('Exit')).toContain('No break is left in the term.')
    expect(fact('Exit')).not.toContain('notice by')
  })

  it('names the next break when the window for the next anniversary has closed and a later one is open', async () => {
    // Four years and a year's notice: 1 Oct 2027 closed on 1 Oct 2026; 1 Oct 2028 is still open until 2 Oct 2027.
    await show({ plan: { term: { ...TERM, termMonths: 48, breakNoticeDays: 365, draftFrom: '2025-09-20' } } })
    expect(fact('Exit')).toContain('the notice window closed on 1 Oct 2026')
    expect(fact('Exit')).toContain('Next break 1 Oct 2028; notice by 2 Oct 2027 (365 days)')
  })

  it('lists the schedule by year with invoice date, amount and invoice state linking to the invoice', async () => {
    const { nav } = await show()
    const rows = scheduleRows()
    expect(rows).toHaveLength(12 + 3)
    expect(rows[0]).toContain('Year 1 of 3, quarter 1')
    expect(rows[0]).toContain('1 Oct 2025 to 31 Dec 2025')
    expect(rows[0]).toContain(fmt(300000))
    expect(rows[0]).toContain('Paid')
    expect(rows[0]).toContain('INV-0101')
    expect(rows[1]).toContain('Overdue')
    expect(rows[2]).toContain('Sent')
    expect(rows[3]).toContain('Drafted')
    expect(rows[4]).toContain(`Year 1 total${fmt(1200000)}`)
    // Year 2 quarter 1 was due on 1 Oct 2026 and has no invoice; quarter 2 is not due yet.
    expect(rows[5]).toContain('Due')
    expect(rows[5]).toContain(fmt(309000))
    expect(rows[6]).toContain('Not yet due')
    expect(rows[14]).toContain(`Year 3 total${fmt(1273080)}`)
    // Each state is a word with an icon, never colour alone.
    const chip = host.querySelectorAll('table[aria-label="Term schedule"] tbody tr')[1].querySelector('.chip')
    expect(chip?.textContent).toBe('Overdue')
    expect(chip?.querySelector('svg')).not.toBeNull()
    await click([...host.querySelectorAll('table[aria-label="Term schedule"] a')].find(a => a.textContent === 'INV-0102'))
    expect(new URL((nav.mock.calls.at(-1) as [string])[0], 'https://x').pathname).toBe('/sales/invoices/q2')
    await click(button(host.querySelectorAll('table[aria-label="Term schedule"] tbody tr')[5], 'Create invoice'))
    const u = new URL((nav.mock.calls.at(-1) as [string])[0], 'https://x')
    expect([u.pathname, JSON.parse(u.searchParams.get('q') ?? '{}')]).toEqual(['/sales/invoices/new', { companyId: 'co1', dealId: 'dl1', milestoneId: 'inst_2_1' }])
  })

  it('keeps the build fee in Milestones, never the instalments, and does not bulk-invoice instalments', async () => {
    await show()
    const ms = [...host.querySelectorAll('table[aria-label="Milestones"] tbody tr')].map(r => r.textContent ?? '')
    expect(ms).toHaveLength(1)
    expect(ms[0]).toContain('Build fee')
    expect(host.querySelector('button[aria-label="Mark delivered: Year 1 of 3, quarter 1"]')).toBeNull()
    expect(host.querySelector('table[aria-label="Milestones"] tfoot')?.textContent).toContain('All scheduled')
  })

  it('earned counts instalments with an issued invoice and the delivered build fee, never a draft', async () => {
    await show({ plan: { milestones: [{ ...BUILD, deliveredOn: '2025-11-01' }, ...SCHEDULE] } })
    // Quarters 1 to 3 are paid or sent; quarter 4 only has a draft (as the server makes on its own), so it is not earned.
    expect(host.querySelector('[data-bar="Earned"]')?.getAttribute('aria-label')).toBe(`Earned ${fmt(500000 + 3 * 300000)} of ${fmt(PLAN.contract.baselineCents)} contracted`)
    // Earned never runs ahead of Invoiced on instalments: here both count the same three quarters.
    expect(host.querySelector('[data-bar="Invoiced"]')?.getAttribute('aria-label')).toContain(`Invoiced ${fmt(3 * 300000)} of`)
    expect(text()).toContain('Earned counts delivered milestones and instalments with an issued invoice; a draft is not earned until it is issued.')
  })

  it('toggles auto-draft and says what it does', async () => {
    const { plan } = await show()
    const box = termCard().querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(termCard().querySelector('[aria-label="Term automation"]')?.textContent).toContain('never sent automatically')
    await click(box)
    expect(plan().term?.autoDraft).toBe(false)
    expect(termCard().querySelector('[aria-label="Term automation"]')?.textContent).toContain('Off: no drafts are made')
  })

  it('Confirm CPI for year 2 shows the rate and its effect on the remaining instalments, then records it', async () => {
    const { plan } = await show()
    await click(button(termCard(), 'Confirm CPI for year 2'))
    const dlg = host.querySelector('[role="dialog"][aria-label="Confirm CPI for year 2"]') as HTMLElement
    expect(dlg).toBeTruthy()
    expect(dlg.textContent).toContain('Enter the CPI rate to see how the remaining instalments change.')
    await type(field(dlg, 'CPI rate (%)'), '3.5')
    const eff = dlg.querySelector('[aria-label="What confirming does"]')?.textContent ?? ''
    // Year 2 at 3.5%: $12,420 a year, $3,105 a quarter; year 3 then rises 3% to $12,792.60, $3,198.15 a quarter.
    expect(eff).toContain(`The year 2 fee changes from ${fmt(1236000)} to ${fmt(1242000)}, and the years after it rise from the new fee`)
    expect(eff).toContain('8 instalments not yet issued are re-priced')
    expect(eff).toContain('Drafts follow the change. None of the re-priced instalments has a draft invoice.')
    expect(eff).toContain(`Year 2 of 3, quarter 1 ${fmt(309000)} to ${fmt(310500)}`)
    expect(eff).toContain(`An approved variation of +${fmt(4 * 1500 + 4 * 1545)} is added: CPI year 2: 3.5% (assumed 3%)`)
    await click(button(dlg, 'Confirm CPI'))
    expect(plan().term?.cpiConfirmed).toEqual([{ year: 2, bp: 350, confirmedOn: '2026-10-09', confirmedBy: 'Me Myself' }])
    expect(m.ui.UI.get().modals).toEqual([])
    // Until the server re-prices, the card says the schedule is being updated; then year 3 is next.
    expect(termCard().textContent).toContain('Updating the schedule')
    expect(button(termCard(), 'Confirm CPI for year 3')).toBeTruthy()
  })

  it('refuses a CPI rate out of range in the dialog, on the rate field itself', async () => {
    const { plan } = await show()
    await click(button(termCard(), 'Confirm CPI for year 2'))
    const dlg = host.querySelector('[role="dialog"]') as HTMLElement
    const rate = field(dlg, 'CPI rate (%)') as HTMLInputElement
    await type(rate, '25')
    expect(rate.getAttribute('aria-invalid')).toBeNull()
    await click(button(dlg, 'Confirm CPI'))
    expect(dlg.querySelector('[role="alert"]')?.textContent).toContain('-10% to 20%')
    expect(rate.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(rate.getAttribute('aria-describedby') ?? '')?.textContent).toBe('The CPI rate is -10% to 20%, to two decimal places')
    expect(plan().term?.cpiConfirmed).toBeUndefined()
    // Fixed, the error goes.
    await type(rate, '3.5')
    expect(rate.getAttribute('aria-invalid')).toBeNull()
  })

  it('Confirm CPI re-prices a drafted instalment and says its draft takes the new amount', async () => {
    const draft = dto({ id: 'q5', invoiceNumber: 'INV-0105', milestoneId: 'inst_2_1', status: 'draft', subtotalCents: 309000, source: 'term', issuedCount: 0, sentAt: null, lineItems: [{ description: 'Q', qty: 1, unitPriceCents: 309000, amountCents: 309000 }] })
    await show({ invoices: [...INVOICES, draft] })
    await click(button(termCard(), 'Confirm CPI for year 2'))
    const dlg = host.querySelector('[role="dialog"][aria-label="Confirm CPI for year 2"]') as HTMLElement
    await settle(8)
    await type(field(dlg, 'CPI rate (%)'), '3.5')
    const eff = dlg.querySelector('[aria-label="What confirming does"]')?.textContent ?? ''
    expect(eff).toContain('8 instalments not yet issued are re-priced')
    expect(eff).not.toContain('Already issued')
    expect(eff).toContain(`Year 2 of 3, quarter 1: Its draft INV-0105 takes the new amount, ${fmt(310500)}.`)
  })

  it('End agreement early confirms in place: which instalments are removed or cut and the negative variation, irreversible', async () => {
    const { plan } = await show()
    await click(button(termCard(), 'End agreement early'))
    const panel = host.querySelector('[role="group"][aria-label="End agreement early"]') as HTMLElement
    expect(document.activeElement).toBe(panel)
    await type(field(panel, 'Ends on'), '2027-02-15')
    const eff = panel.querySelector('[aria-label="What ending does"]')?.textContent ?? ''
    // Quarter 1 Jan to 31 Mar 2027 is 90 days; 45 are kept: $3,090 becomes $1,545.
    expect(eff).toContain(`Cut: Year 2 of 3, quarter 2 from ${fmt(309000)} to ${fmt(154500)}, for 45 of 90 days. It now ends on 14 Feb 2027.`)
    expect(eff).toContain('Drafts follow the change. None of these instalments has a draft invoice.')
    expect(eff).toContain('Nothing is added to the schedule after this; what remains is still drafted on its invoice date while automatic drafting is on.')
    expect(eff).not.toContain('Automatic drafting stops')
    expect(eff).toContain('Removed: Year 2 of 3, quarter 3')
    expect(eff).toContain('Year 3 of 3, quarter 4')
    expect(eff).toContain(`An approved variation of −${fmt(2 * 309000 + 4 * 318270 + 154500)} is added: Ended early on 2027-02-15.`)
    expect(eff).toContain("This can't be undone.")
    await click(button(panel, 'End agreement'))
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain('Say why it ends')
    // The reason field carries its own error: invalid, and described by that message.
    const reason = panel.querySelector('textarea') as HTMLTextAreaElement
    expect(reason.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(reason.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Say why it ends, in 1 to 300 characters')
    expect(field(panel, 'Ends on')?.getAttribute('aria-invalid')).toBeNull()
    expect(plan().term?.ended).toBeUndefined()
    await type(panel.querySelector('textarea'), 'Client moved to an in-house team')
    await click(button(panel, 'End agreement'))
    expect(plan().term?.ended).toMatchObject({ endedOn: '2027-02-15', reason: 'Client moved to an in-house team', endedBy: 'Me Myself' })
    expect(host.querySelector('[role="group"][aria-label="End agreement early"]')).toBeNull()
    expect(termCard().textContent).toContain('Ended early on 15 Feb 2027.')
    expect(button(termCard(), 'End agreement early')).toBeUndefined()
    // Ended, what remains is still drafted while auto-draft is on, and it can still be switched.
    expect((termCard().querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(false)
    expect(termCard().querySelector('[aria-label="Term automation"]')?.textContent).toContain('The agreement has ended, so no instalment is added. The ones that remain are still drafted on their invoice dates')
  })

  it('End early: a drafted instalment is cut like any other and its draft follows; the end date gets its own error', async () => {
    await show()
    await click(button(termCard(), 'End agreement early'))
    const panel = host.querySelector('[role="group"][aria-label="End agreement early"]') as HTMLElement
    // Year 1 quarter 4 (1 Jul to 30 Sep 2026, 92 days) has only a draft: ending on 15 Aug keeps 45 days of it.
    await type(field(panel, 'Ends on'), '2026-08-15')
    const eff = panel.querySelector('[aria-label="What ending does"]')?.textContent ?? ''
    expect(eff).toContain(`Cut: Year 1 of 3, quarter 4 from ${fmt(300000)} to ${fmt(146739)}, for 45 of 92 days. It now ends on 14 Aug 2026.`)
    expect(eff).toContain(`Year 1 of 3, quarter 4: Its draft INV-0104 takes the new amount, ${fmt(146739)}.`)
    expect(eff).not.toContain('Kept, already issued')
    // A day after the term: the date field says so itself once End agreement is pressed.
    await type(field(panel, 'Ends on'), '2030-01-01')
    await type(panel.querySelector('textarea'), 'Client left')
    await click(button(panel, 'End agreement'))
    const day = field(panel, 'Ends on') as HTMLInputElement
    expect(day.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(day.getAttribute('aria-describedby') ?? '')?.textContent).toBe('The end date must be before the term ends on 2028-10-01')
    expect((panel.querySelector('textarea') as HTMLTextAreaElement).getAttribute('aria-invalid')).toBeNull()
  })

  it('End early in arrears says the cut instalment is invoiced on its new last day', async () => {
    const arrears = { ...TERM, timing: 'arrears' as const }
    await show({ plan: { term: { ...arrears, draftFrom: '2025-09-20' }, milestones: [BUILD, ...termSchedule(arrears)] }, invoices: [] })
    await click(button(termCard(), 'End agreement early'))
    const panel = host.querySelector('[role="group"][aria-label="End agreement early"]') as HTMLElement
    await type(field(panel, 'Ends on'), '2027-02-15')
    expect(panel.querySelector('[aria-label="What ending does"]')?.textContent).toContain('It now ends on 14 Feb 2027 and is invoiced that day.')
  })

  it('keeps Confirm CPI and End agreement early off until the invoices load, and says so when they fail', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', PLAN)] }))
    setArdRole(m, 'admin')
    let fail = true
    fakeApi({
      'GET /sales/invoices?dealId=dl1': () => (fail ? json(500, { error: 'Server error', code: 'INTERNAL' }) : json(200, { invoices: INVOICES })),
      'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }),
      'GET /sales/invoices/settings': () => json(200, SETTINGS),
    })
    const { BillingCard } = await import('./BillingCard')
    const { Q } = await import('../../data/Q')
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<><BillingCard deal={Q.deal('dl1')!} /><Hosts /></>) })
    await settle(8)
    const cpi = button(termCard(), 'Confirm CPI for year 2') as HTMLButtonElement
    const endBtn = button(termCard(), 'End agreement early') as HTMLButtonElement
    expect(cpi.disabled).toBe(true)
    expect(endBtn.disabled).toBe(true)
    expect(termCard().textContent).toContain("The deal's invoices did not load, so Confirm CPI and End agreement early wait until they do.")
    await click(endBtn)
    expect(host.querySelector('[role="group"][aria-label="End agreement early"]')).toBeNull()
    expect(m.ui.UI.get().modals).toEqual([])
    fail = false
    await click(button(termCard(), 'Try again'))
    await settle(8)
    expect((button(termCard(), 'Confirm CPI for year 2') as HTMLButtonElement).disabled).toBe(false)
    expect((button(termCard(), 'End agreement early') as HTMLButtonElement).disabled).toBe(false)
    expect(termCard().textContent).not.toContain('did not load')
  })

  it('Confirm CPI works from the invoices as they are when it opens, not a list handed to it earlier', async () => {
    let invoices = INVOICES
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', PLAN)] }))
    setArdRole(m, 'admin')
    const api = fakeApi({
      'GET /sales/invoices?dealId=dl1': () => json(200, { invoices }),
      'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }),
      'GET /sales/invoices/settings': () => json(200, SETTINGS),
    })
    const { BillingCard } = await import('./BillingCard')
    const { Q } = await import('../../data/Q')
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<><BillingCard deal={Q.deal('dl1')!} /><Hosts /></>) })
    await settle(8)
    // Year 2 quarter 1 is invoiced elsewhere after the card loaded.
    invoices = [...INVOICES, dto({ id: 'q5', invoiceNumber: 'INV-0105', milestoneId: 'inst_2_1', status: 'sent', subtotalCents: 309000, source: 'term', dueDate: '2026-11-30' })]
    const before = api.count('GET /sales/invoices?dealId=dl1')
    await click(button(termCard(), 'Confirm CPI for year 2'))
    const dlg = host.querySelector('[role="dialog"][aria-label="Confirm CPI for year 2"]') as HTMLElement
    await settle(8)
    expect(api.count('GET /sales/invoices?dealId=dl1')).toBe(before + 1)
    await type(field(dlg, 'CPI rate (%)'), '3.5')
    const eff = dlg.querySelector('[aria-label="What confirming does"]')?.textContent ?? ''
    expect(eff).toContain('7 instalments not yet issued are re-priced')
    expect(eff).toContain('Already issued, kept as they are: Year 2 of 3, quarter 1')
    expect(eff).toContain(`An approved variation of +${fmt(3 * 1500 + 4 * 1545)} is added`)
  })

  it('Confirm CPI waits for the invoices and says when they fail to load', async () => {
    await show()
    fakeApi({ 'GET /sales/invoices?dealId=dl1': () => json(500, { error: 'Server error', code: 'INTERNAL' }) })
    await click(button(termCard(), 'Confirm CPI for year 2'))
    const dlg = host.querySelector('[role="dialog"][aria-label="Confirm CPI for year 2"]') as HTMLElement
    await settle(8)
    expect(dlg.textContent).toContain("The deal's invoices did not load, so CPI cannot be confirmed until they do.")
    expect((button(dlg, 'Confirm CPI') as HTMLButtonElement).disabled).toBe(true)
    await type(field(dlg, 'CPI rate (%)'), '3.5')
    expect(dlg.querySelector('[aria-label="What confirming does"]')?.textContent).not.toContain('re-priced')
    expect(m.store.S.billingPlans.find(p => p.dealId === 'dl1')?.term?.cpiConfirmed).toBeUndefined()
  })

  it('is not shown to anyone but admins of Ardorio', async () => {
    const { api } = await show({ role: 'manager' })
    expect(text()).toBe('')
    expect(api.count('GET /sales/invoices?dealId=dl1')).toBe(0)
  })
})

describe('Billing tab: "Updating the schedule" only while the server has not answered', () => {
  it('shows after Confirm CPI and goes once the server stores it', async () => {
    const { plan } = await show()
    const { postBatch } = await import('../../api/records')
    vi.mocked(postBatch).mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({
      serverNow: '2026-10-09T10:00:00.000Z',
      results: req.ops.map((op, i): OpResult => {
        // The server re-prices year 2 and later and records the variation.
        const t = { ...PLAN.term, cpiConfirmed: [{ year: 2, bp: 350, confirmedOn: '2026-10-09', confirmedBy: 'Me Myself' }] }
        return appliedResult(i, op.collection, op.id, 2, { ...PLAN, term: t, milestones: [BUILD, ...termSchedule(t)] })
      }),
    }))
    await click(button(termCard(), 'Confirm CPI for year 2'))
    const dlg = host.querySelector('[role="dialog"][aria-label="Confirm CPI for year 2"]') as HTMLElement
    await settle(8)
    await type(field(dlg, 'CPI rate (%)'), '3.5')
    await click(button(dlg, 'Confirm CPI'))
    expect(termCard().textContent).toContain('Updating the schedule')
    await act(async () => { await m.sync.flush() })
    await settle(4)
    expect(plan().milestones.find(x => x.id === 'inst_2_1')?.amountCents).toBe(310500)
    expect(termCard().textContent).not.toContain('Updating the schedule')
  })

  it('never shows for an instalment kept at its old amount whose invoice was later cancelled', async () => {
    // CPI for year 2 was confirmed while year 2 quarter 1 had an issued invoice, so the server kept it at $3,090. That
    // invoice was then cancelled: the instalment now has no issued invoice and differs from the schedule, for good.
    const t = { ...TERM, draftFrom: '2025-09-20', cpiConfirmed: [{ year: 2, bp: 350, confirmedOn: '2026-10-01', confirmedBy: 'Ryan' }] }
    const kept = termSchedule(t).map(x => (x.id === 'inst_2_1' ? { ...x, amountCents: 309000 } : x))
    const voided = dto({ id: 'q5', invoiceNumber: 'INV-0105', milestoneId: 'inst_2_1', status: 'void', subtotalCents: 309000, source: 'term' })
    await show({ plan: { term: t, milestones: [BUILD, ...kept] }, invoices: [...INVOICES, voided] })
    expect(termCard().textContent).not.toContain('Updating the schedule')
    // The same for an ended agreement that kept an issued instalment after the end, since cancelled.
    const ended = { ...TERM, draftFrom: '2025-09-20', ended: { endedOn: '2026-11-01', reason: 'Left', endedBy: 'Ryan', recordedAt: '2026-10-01T00:00:00Z' } }
    act(() => root.unmount())
    root = createRoot(host)
    await show({ plan: { term: ended }, invoices: [...INVOICES, dto({ id: 'q6', invoiceNumber: 'INV-0106', milestoneId: 'inst_2_2', status: 'void', subtotalCents: 309000, source: 'term' })] })
    expect(termCard().textContent).not.toContain('Updating the schedule')
  })
})

describe('Set contract on a won deal with none: term agreement', () => {
  it('sets a term agreement with the same fields and preview as the Won dialog', async () => {
    const { plan } = await show({ plan: { contract: undefined, term: undefined, milestones: [], variations: undefined }, invoices: [] })
    await click(button(host, 'Set contract'))
    await type(field(host, 'Engagement type'), 'term-agreement')
    expect(field(host, 'Contracted amount (A$, ex GST)')).toBeNull()
    // Starts on the day the deal was won.
    expect((field(host, 'Start date') as HTMLInputElement).value).toBe('2026-12-01')
    await type(field(host, 'Annual fee (A$, ex GST)'), '6000')
    await type(host.querySelector('[aria-label="Term years"]'), '2')
    expect(host.querySelector('[aria-label="Contract baseline"]')?.textContent).toContain(`Contract ${fmt(1200000)} ex GST`)
    await click(button(host, 'Save term agreement'))
    // The won date is in the future for this fixture, so the contract date is refused as the API would.
    expect(text()).toContain('The contract date cannot be in the future')
    expect(plan().contract).toBeUndefined()
  })

  it('saves when the deal was won on or before today', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1', { close: '2026-10-01' }).data)], billingPlans: [] }))
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices?dealId=dl1': () => json(200, { invoices: [] }), 'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }), 'GET /sales/invoices/settings': () => json(200, SETTINGS) })
    const { BillingCard } = await import('./BillingCard')
    const { Q } = await import('../../data/Q')
    await act(async () => { root.render(<BillingCard deal={Q.deal('dl1')!} />) })
    await settle(8)
    await click(button(host, 'Set contract'))
    await type(field(host, 'Engagement type'), 'term-agreement')
    await type(field(host, 'Annual fee (A$, ex GST)'), '6000')
    await type(host.querySelector('[aria-label="Term years"]'), '2')
    await click(button(host, 'Save term agreement'))
    const p = m.store.S.billingPlans.find(x => x.dealId === 'dl1')!
    expect(p.contract).toMatchObject({ baselineCents: 1200000, engagementType: 'term-agreement', contractedOn: '2026-10-01' })
    expect(p.term).toMatchObject({ startDate: '2026-10-01', termMonths: 24, annualCents: 600000, autoDraft: true, draftFrom: '2026-10-09' })
    expect(p.milestones.map(x => x.id)).toEqual(['inst_1_1', 'inst_2_1'])
    expect(termCard()).toBeTruthy()
  })
})
