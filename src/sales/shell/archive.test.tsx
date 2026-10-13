import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, ME, rec, salesWorld } from '../testing/fixtures'
import { button, click, settle } from '../testing/dom'
import { loadSales, type Sales } from '../testing/load'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

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

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })
const PIPE = rec('pl1', {
  businessId: 'ros', name: 'Sales', recurring: true, lostReasons: ['Price'], forecast: [], card: [], fields: [],
  stages: [
    { id: 's1', name: 'Lead', prob: 10, required: [], won: false, lost: false },
    { id: 's2', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
    { id: 's3', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
  ],
})
const deal = (id: string, title: string, over: Record<string, unknown> = {}) => rec(id, {
  name: title, title, businessId: 'ros', companyId: 'co1', pipelineId: 'pl1', stageId: 's1', ownerId: 'u-me', type: 'New', value: 12000, mrr: null,
  recurring: false, contractMonths: 12, close: '2026-12-01', probability: 10, forecast: 'Pipeline', source: 'Outbound', contactIds: ['ct1'], primaryContact: 'ct1',
  next: '', description: '', lostReason: '', status: 'open', createdAt: '2026-10-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-01T09:00',
  closedAt: null, priority: 'Medium', fields: {}, stageHistory: [], notes: [], ...over,
})

async function setup(over: Parameters<typeof salesWorld>[0] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(salesWorld({
    businesses: [ROS], pipelines: [PIPE], deals: [deal('dl1', 'Roster rollout'), deal('dl2', 'Payroll add-on')],
    companies: [rec('co1', { name: 'Acme', tradingName: 'Acme', tags: [], notes: [], industry: '', hq: '', state: '', domain: 'acme.example' })],
    companyRels: [rec('cr1', { companyId: 'co1', businessId: 'ros', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [], createdAt: '2026-10-01T09:00' })],
    ...over,
  }))
  m.ui.bindNavigate(vi.fn())
  const { Act } = await import('../data/Act')
  const { Q } = await import('../data/Q')
  const { Hosts } = await import('./Hosts')
  return { Act, Q, Hosts }
}

function role(r: 'admin' | 'manager' | 'sales') {
  const u = m.store.S.users.find(x => x.id === ME.userId)
  if (!u) throw new Error('no user')
  u.super = false
  u.m = { ros: r }
  m.store.reindex()
}

async function show(page: ReactElement, Hosts: () => ReactElement) {
  await act(async () => { root.render(<>{page}<Hosts /></>) })
  await settle()
}

const dialog = (): HTMLElement | null => document.querySelector('[role="dialog"]')
const text = (): string => host.textContent ?? ''
const more = (): HTMLElement | null => host.querySelector('[aria-label="More actions"]')
const menuItem = (label: string) => [...host.querySelectorAll('[role="menuitem"]')].find(x => x.textContent?.trim() === label)
const escape = async () => { await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }) }

describe('Contact: archive and restore', () => {
  it('warns how many enrolments stop and that a restore will not restart them; starts on Keep; Escape keeps', async () => {
    const t = await setup()
    const { Contact } = await import('../pages/companies/Contact')
    await show(<Contact route={{ page: 'contact', id: 'ct1' }} />, t.Hosts)

    await click(more())
    await click(menuItem('Archive contact'))
    const d = dialog()
    expect(d?.getAttribute('aria-label')).toBe('Archive Sam Buyer?')
    expect(d?.textContent).toContain('1 active sequence enrolment will stop.')
    expect(d?.textContent).toContain('Enrolments do not restart if you restore Sam')
    expect(document.activeElement?.textContent).toBe('Keep contact')

    await escape()
    expect(dialog()).toBeNull()
    expect(t.Q.contact('ct1')?.archived).toBeFalsy()
    expect(t.Q.enrol('en1')?.status).toBe('awaiting_task')
  })

  it('archiving shows the archived state with Restore; restoring leaves enrolments stopped', async () => {
    const t = await setup()
    const { Contact } = await import('../pages/companies/Contact')
    await show(<Contact route={{ page: 'contact', id: 'ct1' }} />, t.Hosts)

    await click(more())
    await click(menuItem('Archive contact'))
    const d = dialog()
    if (!d) throw new Error('no dialog')
    await click(button(d, 'Archive contact'))
    expect(t.Q.contact('ct1')?.archived).toBe(true)
    expect(t.Q.enrol('en1')?.status).toBe('removed')
    expect(text()).toContain('This record is archived')
    expect(text()).toContain('Sequence enrolments it had stay stopped after a restore.')

    await click(button(host, 'Restore contact'))
    expect(dialog()).toBeNull()
    expect(t.Q.contact('ct1')?.archived).toBe(false)
    expect(t.Q.enrol('en1')?.status).toBe('removed')
    expect(text()).not.toContain('This record is archived')
    expect(document.querySelector('.toasts')?.textContent).toContain('Sam Buyer restored. Stopped sequence enrolments stay stopped.')
  })
})

describe('Contacts and Companies lists: Archived filter', () => {
  it('Contacts lists archived people only under Archived, labelled in words, with a Restore button', async () => {
    const t = await setup()
    t.Act.archiveContact('ct1')
    const { Contacts } = await import('../pages/companies/Contacts')
    await show(<Contacts route={{ page: 'contacts' }} />, t.Hosts)
    expect(text()).not.toContain('Sam Buyer')
    const seg = host.querySelector('[role="group"][aria-label="Show contacts"]')
    expect(seg).not.toBeNull()

    await click(button(host, 'Archived'))
    expect(text()).toContain('Sam Buyer')
    expect(host.querySelector('tbody')?.textContent).toContain('Archived')
    await click(host.querySelector('[aria-label="Restore Sam Buyer"]'))
    expect(t.Q.contact('ct1')?.archived).toBe(false)
    expect(text()).toContain('No archived contacts')
  })

  it('Companies opens on the Archived filter from a link and restores from the row', async () => {
    const t = await setup()
    t.Act.archiveCompany('co1')
    const { Companies } = await import('../pages/companies/Companies')
    await show(<Companies route={{ page: 'companies', q: { archived: '1' } }} />, t.Hosts)
    expect(button(host, 'Archived')?.getAttribute('aria-pressed')).toBe('true')
    expect(text()).toContain('1 archived companies')
    await click(host.querySelector('[aria-label="Restore Acme"]'))
    expect(t.Q.company('co1')?.archived).toBe(false)
  })

  it('an archived company page says so instead of not found, with Restore', async () => {
    const t = await setup()
    t.Act.archiveCompany('co1')
    const { Company } = await import('../pages/companies/Company')
    await show(<Company route={{ page: 'company', id: 'co1' }} />, t.Hosts)
    expect(text()).toContain('This record is archived')
    await click(button(host, 'Restore company'))
    expect(t.Q.company('co1')?.archived).toBe(false)
  })
})

describe('Deals: admins only, excluded from the board, findable under Archived', () => {
  it('a manager gets no Archive action on the deal page', async () => {
    const t = await setup()
    role('manager')
    const { Deal } = await import('../pages/deals/Deal')
    await show(<Deal route={{ page: 'deal', id: 'dl1' }} />, t.Hosts)
    expect(more()).toBeNull()
  })

  it('an admin archives after a confirm that starts on Keep, and restores from the Archived list after a confirm', async () => {
    const t = await setup()
    role('admin')
    const { Deal } = await import('../pages/deals/Deal')
    await show(<Deal route={{ page: 'deal', id: 'dl1' }} />, t.Hosts)
    await click(more())
    await click(menuItem('Archive deal'))
    expect(dialog()?.textContent).toContain('leaves the pipeline board, forecasts, reports and goals')
    expect(document.activeElement?.textContent).toBe('Keep deal')
    const d = dialog()
    if (!d) throw new Error('no dialog')
    await click(button(d, 'Archive deal'))
    expect(t.Q.deal('dl1')).toMatchObject({ archived: true, archivedBy: 'u-me' })
    expect(text()).toContain('This record is archived')

    const { Deals } = await import('../pages/deals/Deals')
    await show(<Deals route={{ page: 'deals' }} />, t.Hosts)
    const board = host.querySelector('.kb')?.textContent ?? ''
    expect(board).toContain('Payroll add-on')
    expect(board).not.toContain('Roster rollout')
    expect(text()).toContain('1 open')

    await click(button(host, 'Archived (1)'))
    expect(text()).toContain('Roster rollout')
    expect(text()).not.toContain('Payroll add-on')
    await click(host.querySelector('[aria-label="Restore Roster rollout"]'))
    expect(dialog()?.getAttribute('aria-label')).toBe('Restore Roster rollout?')
    expect(document.activeElement?.textContent).toBe('Keep archived')
    const r = dialog()
    if (!r) throw new Error('no dialog')
    await click(button(r, 'Restore deal'))
    expect(t.Q.deal('dl1')?.archived).toBe(false)
  })

  it('a manager sees archived deals but cannot restore them', async () => {
    const t = await setup({ deals: [deal('dl1', 'Roster rollout', { archived: true, archivedAt: '2026-10-08T10:00', archivedBy: 'u-me' })] })
    role('manager')
    const { Deals } = await import('../pages/deals/Deals')
    await show(<Deals route={{ page: 'deals', q: { view: 'list', status: 'archived' } }} />, t.Hosts)
    expect(text()).toContain('Roster rollout')
    expect(text()).toContain('Admins only')
    expect(host.querySelector('[aria-label="Restore Roster rollout"]')).toBeNull()
  })
})

describe('Sequences: admins only', () => {
  it('admins archive from the row menu after a confirm; managers have no Archive item', async () => {
    const t = await setup()
    role('manager')
    const { Sequences } = await import('../pages/sequences/Sequences')
    await show(<Sequences route={{ page: 'sequences' }} />, t.Hosts)
    await click(host.querySelector('[aria-label="Actions for Cold"]'))
    expect(menuItem('Archive')).toBeUndefined()
    await escape()

    role('admin')
    await show(<Sequences route={{ page: 'sequences' }} />, t.Hosts)
    await click(host.querySelector('[aria-label="Actions for Cold"]'))
    await click(menuItem('Archive'))
    expect(dialog()?.textContent).toContain('1 enrolment in progress will stop moving.')
    expect(document.activeElement?.textContent).toBe('Keep sequence')
    const d = dialog()
    if (!d) throw new Error('no dialog')
    await click(button(d, 'Archive sequence'))
    expect(t.Q.seq('sq1')).toMatchObject({ archived: true, status: 'archived' })
    expect(host.querySelector('tbody')?.textContent ?? '').not.toContain('Cold')
    expect(text()).toContain('No sequences match')

    await click(button(host, 'Archived'))
    expect(text()).toContain('Cold')
    await click(host.querySelector('[aria-label="Actions for Cold"]'))
    await click(menuItem('Restore'))
    const r = dialog()
    if (!r) throw new Error('no dialog')
    expect(r.textContent).toContain('comes back paused')
    await click(button(r, 'Restore sequence'))
    expect(t.Q.seq('sq1')).toMatchObject({ archived: false, status: 'paused' })
  })
})
