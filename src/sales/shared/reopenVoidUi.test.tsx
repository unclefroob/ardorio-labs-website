// On screen: the deal page's Reopen asks first and says what it does; 'Logged in error' on activity rows (deal timeline
// and the Activities page) voids with a reason, strikes the row through and drops it from the totals; and the Ardorio
// revenue report links land on the report even when the workspace hides Ardorio.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { changes, rec, salesWorld, user } from '../testing/fixtures'
import { button, click, settle, type } from '../testing/dom'
import { loadSales, type Sales } from '../testing/load'
import { fakeApi, setRole } from '../testing/rosterioWorld'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let m: Sales
let navigate: Mock<(to: string | number, opts?: { replace?: boolean }) => void>

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

const biz = (id: string, name: string) => rec(id, { name, short: id.toUpperCase(), accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl_' + id, industries: [], roles: [] })
const PIPE = rec('pl_ros', {
  businessId: 'ros', name: 'Sales', recurring: true, lostReasons: ['Price'], forecast: [], card: [], fields: [],
  stages: [
    { id: 's1', name: 'Lead', prob: 10, required: [], won: false, lost: false },
    { id: 's2', name: 'Proposal', prob: 50, required: [], won: false, lost: false },
    { id: 'sw', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
    { id: 'sl', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
  ],
})
const DEAL = rec('dl1', {
  name: 'dl1', title: 'Acme rollout', businessId: 'ros', companyId: 'co1', pipelineId: 'pl_ros', stageId: 'sw', ownerId: 'u-me', type: 'New', value: 1000, mrr: null,
  recurring: false, contractMonths: 12, close: '2026-10-01', probability: 100, forecast: 'Closed', source: 'Outbound', contactIds: ['ct1'], primaryContact: 'ct1',
  next: '', description: '', lostReason: '', status: 'won', createdAt: '2026-09-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-09T08:00',
  closedAt: '2026-10-01T09:00', priority: 'Medium', fields: {}, notes: [], wonNotes: 'Signed',
  stageHistory: [{ stageId: 's1', ts: '2026-09-01T09:00' }, { stageId: 's2', ts: '2026-09-10T09:00' }, { stageId: 'sw', ts: '2026-10-01T09:00' }],
})
const activity = (id: string, over: Record<string, unknown> = {}) =>
  rec(id, { type: 'call', businessId: 'ros', actorId: 'u-me', ts: '2026-10-09T08:00', visibility: 'business', contactId: 'ct1', companyId: 'co1', dealId: 'dl1', subject: `Call ${id}`, outcome: 'Connected', ...over })
const ACTS = [
  activity('ac1'),
  activity('ac2', { ts: '2026-10-08T08:00' }),
  activity('ac3', { ts: '2026-10-07T08:00', voided: true, voidedAt: '2026-10-08T09:00', voidedBy: 'Pat Manager', voidReason: 'Wrong contact' }),
  activity('ac4', { ts: '2026-10-06T08:00', actorId: 'u-other' }),
]

async function hydrate(over: Parameters<typeof salesWorld>[0] = {}) {
  m = await loadSales()
  const w = salesWorld({ businesses: [biz('ros', 'Rosterio'), biz('ard', 'Ardorio Labs')], pipelines: [PIPE], deals: [DEAL], activities: ACTS, ...over })
  w.users.push(user('u-other', 'Olive Other'))
  m.bootstrap.hydrate(w)
  navigate = vi.fn<(to: string | number, opts?: { replace?: boolean }) => void>()
  m.ui.bindNavigate(navigate)
}

async function render(page: () => React.ReactNode) {
  const { Hosts } = await import('../shell/Hosts')
  const { useStore } = await import('../data/store')
  function Live() {
    useStore()
    return <>{page()}</>
  }
  await act(async () => { root.render(<><Live /><Hosts /></>) })
  await settle()
}

const dialog = (title: string): HTMLElement => {
  const d = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(x => x.getAttribute('aria-label') === title)
  if (!d) throw new Error(`no dialog "${title}"`)
  return d
}
const deal = () => m.store.S.deals.find(x => x.id === 'dl1')
const tabBtn = (label: RegExp) => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => label.test(b.textContent ?? ''))

describe('Deal page: Reopen', () => {
  async function dealPage() {
    await hydrate({ companyRels: [rec('cr1', { companyId: 'co1', businessId: 'ros', ownerId: 'u-me', status: 'Customer', priority: 'Medium', tags: [] })] })
    const { Deal } = await import('../pages/deals/Deal')
    await render(() => <Deal route={{ page: 'deal', id: 'dl1' }} />)
  }

  it('asks first, listing the stage it returns to and what is cleared; Cancel changes nothing', async () => {
    await dealPage()
    await click(button(host, 'Reopen'))
    const dlg = dialog('Reopen deal?')
    const items = [...dlg.querySelectorAll('li')].map(li => li.textContent)
    expect(items).toContain('It goes back to Proposal (50%), the stage it was in before it closed.')
    expect(items).toContain('Its won date and won notes are cleared.')
    expect(items).toContain('Acme is no longer a Rosterio customer; it shows as an active opportunity.')
    await click(button(dlg, 'Cancel'))
    expect(deal()?.status).toBe('won')
  })

  it('confirming reopens it to Proposal and the page offers Mark won / Mark lost again', async () => {
    await dealPage()
    await click(button(host, 'Reopen'))
    await click(button(dialog('Reopen deal?'), 'Reopen'))
    await settle()
    expect(deal()).toMatchObject({ status: 'open', stageId: 's2', closedAt: null })
    expect(button(host, 'Mark won')).toBeDefined()
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Deal reopened · back in Proposal')
  })
})

describe('Logged in error on the deal timeline', () => {
  async function activityTab(role?: 'sales') {
    await hydrate()
    if (role) setRole(m, role)
    const { Deal } = await import('../pages/deals/Deal')
    await render(() => <Deal route={{ page: 'deal', id: 'dl1', q: { tab: 'activity' } }} />)
  }

  it('the tab and filter totals leave out the voided one, which is struck through with who, when and why', async () => {
    await activityTab()
    expect(tabBtn(/^Activity/)?.textContent).toMatch(/3$/)
    expect(host.querySelector('[aria-label="Filter activity by type"]')?.textContent).toContain('All 3')
    const row = [...host.querySelectorAll('.tl-i')].find(x => x.textContent?.includes('Call ac3'))
    expect(row?.classList.contains('voided')).toBe(true)
    expect(row?.querySelector('.b.strike')?.textContent).toBe('Call ac3')
    expect(row?.textContent).toContain('Logged in error by Pat Manager on')
    expect(row?.textContent).toContain(': Wrong contact')
    expect(row?.querySelector('button')).toBeNull()
  })

  it('a sales rep sees the action on their own activity only', async () => {
    await activityTab('sales')
    expect(host.querySelector('[aria-label="Mark “Call ac1” as logged in error"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="Mark “Call ac4” as logged in error"]')).toBeNull()
  })

  it('asks for a reason, then voids it: struck through, out of the totals', async () => {
    await activityTab()
    await click(host.querySelector('[aria-label="Mark “Call ac1” as logged in error"]'))
    const dlg = dialog('Logged in error')
    await click(button(dlg, 'Mark as logged in error'))
    expect(dlg.textContent).toContain('Say what was wrong with it.')
    expect(m.store.S.activities.find(a => a.id === 'ac1')?.voided).toBeUndefined()
    await type(dlg.querySelector('textarea'), 'Logged twice')
    await click(button(dlg, 'Mark as logged in error'))
    await settle()
    expect(m.store.S.activities.find(a => a.id === 'ac1')).toMatchObject({ voided: true, voidReason: 'Logged twice' })
    expect(tabBtn(/^Activity/)?.textContent).toMatch(/2$/)
    const row = [...host.querySelectorAll('.tl-i')].find(x => x.textContent?.includes('Call ac1'))
    expect(row?.classList.contains('voided')).toBe(true)
    expect(row?.textContent).toContain('Logged twice')
  })
})

describe('Activities page', () => {
  async function page() {
    await hydrate()
    const { Activities } = await import('../pages/inbox/Activities')
    await render(() => <Activities route={{ page: 'activities' }} />)
  }

  it('counts only standing activity and says how many were logged in error', async () => {
    await page()
    expect(host.textContent).toContain('3 interactions (1 logged in error, not counted)')
    const row = [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes('Call ac3'))
    expect(row?.querySelector('.strike')?.textContent).toBe('Call ac3')
    expect(row?.textContent).toContain('Logged in error by Pat Manager')
  })

  it('the row action opens the dialog without opening the record', async () => {
    await page()
    navigate.mockClear()
    await click(host.querySelector('[aria-label="Mark “Call ac2” as logged in error"]'))
    expect(dialog('Logged in error')).toBeDefined()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('Ardorio revenue report links', () => {
  const lastPath = (): string => decodeURIComponent(String(navigate.mock.calls.at(-1)?.[0] ?? ''))

  it('Customers: from the Rosterio workspace it switches to Ardorio Labs and lands on the report', async () => {
    await hydrate()
    m.store.S.session.ws = 'ros'
    fakeApi({})
    const { Customers } = await import('../pages/customers/Customers')
    await render(() => <Customers route={{ page: 'customers', q: { product: 'ard' } }} />)
    await click(button(host, 'Ardorio revenue report'))
    expect(m.store.S.session.ws).toBe('ard')
    expect(lastPath()).toContain('"tab":"ardorio"')
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Switched to Ardorio Labs to show its revenue report')
  })

  it('Customers: in a workspace that already shows Ardorio it only navigates', async () => {
    await hydrate()
    m.store.S.session.ws = 'all'
    fakeApi({})
    const { Customers } = await import('../pages/customers/Customers')
    await render(() => <Customers route={{ page: 'customers', q: { product: 'ard' } }} />)
    await click(button(host, 'Ardorio revenue report'))
    expect(m.store.S.session.ws).toBe('all')
    expect(lastPath()).toContain('"tab":"ardorio"')
  })

  it('Reports: a link to the Ardorio tab in a workspace that hides it says so and offers the switch', async () => {
    await hydrate()
    m.store.S.session.ws = 'ros'
    fakeApi({})
    const { Reports } = await import('../pages/reports/Reports')
    await render(() => <Reports route={{ page: 'reports', q: { tab: 'ardorio' } }} />)
    expect(host.textContent).toContain('The Ardorio revenue report isn’t shown in the Rosterio workspace.')
    await click(button(host, 'Switch to Ardorio Labs'))
    await settle()
    expect(m.store.S.session.ws).toBe('ard')
    expect(host.textContent).not.toContain('isn’t shown in the')
  })

  it('Reports: no notice for someone who may not see Ardorio money', async () => {
    await hydrate()
    setRole(m, 'admin', { ard: 'sales' })
    m.store.S.session.ws = 'ros'
    const { Reports } = await import('../pages/reports/Reports')
    await render(() => <Reports route={{ page: 'reports', q: { tab: 'ardorio' } }} />)
    expect(host.textContent).not.toContain('Ardorio revenue report')
  })
})
