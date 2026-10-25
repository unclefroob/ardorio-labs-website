// Meeting lifecycle on screen: My Day counts only meetings still ahead and asks "What happened?" for overdue ones, the
// cancel and reschedule dialogs, the meeting form's statuses and in-page delete, the deal's Meetings card, the
// Dashboard's meetings KPI and the call outcome 'Meeting Booked' that must create a dated meeting.
// The app clock follows the bootstrap's serverNow: 2026-10-09T10:00Z, which is 21:00 on 9 Oct in Melbourne.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec, salesWorld } from '../testing/fixtures'
import { button, click, field, settle, type } from '../testing/dom'
import { loadSales, type Sales } from '../testing/load'
import { setRole } from '../testing/rosterioWorld'

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

const biz = (id: string, name: string) => rec(id, { name, short: id.toUpperCase(), accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl_' + id, industries: [], roles: [] })
const PIPE = rec('pl_ros', {
  businessId: 'ros', name: 'Sales', recurring: true, lostReasons: ['Price'], forecast: [], card: [], fields: [],
  stages: [
    { id: 's1', name: 'Lead', prob: 10, required: [], won: false, lost: false },
    { id: 's2', name: 'Closed Won', prob: 100, required: [], won: true, lost: false },
    { id: 's3', name: 'Closed Lost', prob: 0, required: [], won: false, lost: true },
  ],
})
const DEAL = rec('dl1', {
  name: 'dl1', title: 'Acme rollout', businessId: 'ros', companyId: 'co1', pipelineId: 'pl_ros', stageId: 's1', ownerId: 'u-me', type: 'New', value: 1000, mrr: null,
  recurring: false, contractMonths: 12, close: '2026-12-01', probability: 10, forecast: 'Pipeline', source: 'Outbound', contactIds: ['ct1'], primaryContact: 'ct1',
  next: '', description: '', lostReason: '', status: 'open', createdAt: '2026-10-01T09:00', stageChangedAt: '2026-10-01T09:00', lastActivity: '2026-10-01T09:00',
  closedAt: null, priority: 'Medium', fields: {}, stageHistory: [], notes: [],
})

function meeting(id: string, over: Record<string, unknown> = {}) {
  return rec(id, {
    title: `Meeting ${id}`, businessId: 'ros', companyId: 'co1', dealId: 'dl1', ownerId: 'u-me', participants: ['ct1'], start: '2026-10-12T10:00',
    duration: 30, type: 'Discovery', status: 'upcoming', sections: {}, summary: '', nextSteps: '', createdBy: 'u-me', ...over,
  })
}

/** future: still ahead · past: upcoming but its start has passed · off: cancelled · nope: no-show · done: completed */
const MEETINGS = [
  meeting('future'),
  meeting('past', { start: '2026-10-09T09:00' }),
  meeting('off', { start: '2026-10-13T10:00', status: 'cancelled', cancelledAt: '2026-10-08T10:00', cancelledBy: 'Pat Manager', cancelReason: 'Budget freeze' }),
  meeting('nope', { start: '2026-10-08T10:00', status: 'no-show' }),
  meeting('done', { start: '2026-10-07T10:00', status: 'completed' }),
]

async function hydrate(over: Parameters<typeof salesWorld>[0] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [biz('ros', 'Rosterio'), biz('pth', 'Pathways')], pipelines: [PIPE], deals: [DEAL], meetings: MEETINGS, ...over }))
  m.ui.bindNavigate(vi.fn())
}

/** Renders `page` the way PageView does: again on every store change. */
async function renderWithHosts(page: (() => React.ReactNode) | null) {
  const { Hosts } = await import('../shell/Hosts')
  const { useStore } = await import('../data/store')
  function Live() {
    useStore()
    return <>{page?.()}</>
  }
  await act(async () => { root.render(<><Live /><Hosts /></>) })
  await settle()
}

const dialog = (title: string): HTMLElement => {
  const d = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(x => x.getAttribute('aria-label') === title)
  if (!d) throw new Error(`no dialog "${title}"`)
  return d
}
const kpi = (label: string): string => {
  const b = [...host.querySelectorAll('button.kpi')].find(x => x.querySelector('.l')?.textContent === label)
  return b?.querySelector('.v')?.textContent ?? ''
}
const status = (id: string): string | undefined => m.store.S.meetings.find(x => x.id === id)?.status

describe('My Day: upcoming is still ahead; overdue asks what happened', () => {
  async function myDay() {
    await hydrate()
    const { MyDay } = await import('../pages/home/MyDay')
    await renderWithHosts(() => <MyDay />)
  }

  it('counts only the future upcoming meeting, never past, cancelled or no-show ones', async () => {
    await myDay()
    expect(kpi('Upcoming meetings')).toBe('1')
    const card = [...host.querySelectorAll('section.card')].find(c => c.textContent?.startsWith('Meetings & preparation'))
    expect(card?.textContent).toContain('Meeting future')
    expect(card?.textContent).not.toContain('Meeting off')
    expect(card?.textContent).not.toContain('Meeting nope')
  })

  it('shows a "What happened?" prompt for the overdue meeting, and No-show closes it out', async () => {
    await myDay()
    const prompt = host.querySelector('[role="group"][aria-label="What happened at Meeting past?"]')
    expect(prompt).not.toBeNull()
    expect([...(prompt?.querySelectorAll('button') ?? [])].map(b => b.textContent)).toEqual(['Completed', 'No-show', 'Cancelled', 'Reschedule'])
    expect(host.textContent).toContain('Outcome needed')
    await click(button(prompt as HTMLElement, 'No-show'))
    await settle()
    expect(status('past')).toBe('no-show')
    expect(host.querySelector('[aria-label="What happened at Meeting past?"]')).toBeNull()
  })

  it('Completed opens the meeting form already set to Completed', async () => {
    await myDay()
    const prompt = host.querySelector('[aria-label="What happened at Meeting past?"]') as HTMLElement
    await click(button(prompt, 'Completed'))
    const d = dialog('Edit meeting')
    const on = d.querySelector('[role="group"][aria-label="Status"] button[aria-pressed="true"]')
    expect(on?.textContent).toBe('Completed')
    await click(button(d, 'Save meeting'))
    await settle()
    expect(status('past')).toBe('completed')
    // Completing it logs the held meeting once.
    expect(m.store.S.activities.filter(a => a.type === 'meeting' && a.meetingId === 'past')).toHaveLength(1)
  })

  it('Reschedule moves it into the future and keeps the old start', async () => {
    await myDay()
    const prompt = host.querySelector('[aria-label="What happened at Meeting past?"]') as HTMLElement
    await click(button(prompt, 'Reschedule'))
    const d = dialog('Reschedule meeting')
    await type(field(d, 'New date'), '2026-10-20')
    await type(field(d, 'Time'), '14:30')
    await click(button(d, 'Reschedule'))
    await settle()
    const mt = m.store.S.meetings.find(x => x.id === 'past')
    expect(mt).toMatchObject({ status: 'upcoming', start: '2026-10-20T14:30', rescheduledFrom: ['2026-10-09T09:00'] })
    expect(kpi('Upcoming meetings')).toBe('2')
  })

  it('Reschedule refuses a time that has already passed', async () => {
    await myDay()
    await act(async () => { m.ui.UI.open('rescheduleMeeting', { id: 'past' }) })
    const d = dialog('Reschedule meeting')
    await type(field(d, 'New date'), '2026-10-09')
    await type(field(d, 'Time'), '08:00')
    await click(button(d, 'Reschedule'))
    expect(d.querySelector('[role="alert"]')?.textContent).toBe('Pick a date and time in the future.')
    expect(m.store.S.meetings.find(x => x.id === 'past')?.start).toBe('2026-10-09T09:00')
  })
})

describe('Cancel meeting dialog', () => {
  it('needs a reason, then cancels with it', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('cancelMeeting', { id: 'future' }) })
    const d = dialog('Cancel meeting')
    await click(button(d, 'Cancel meeting'))
    expect(d.querySelector('[role="alert"]')?.textContent).toBe('Say why the meeting was cancelled.')
    expect(status('future')).toBe('upcoming')
    await type(d.querySelector('textarea'), 'They hired in-house')
    await click(button(d, 'Cancel meeting'))
    await settle()
    expect(m.store.S.meetings.find(x => x.id === 'future')).toMatchObject({ status: 'cancelled', cancelReason: 'They hired in-house' })
    expect(document.querySelector('[aria-label="Cancel meeting"]')).toBeNull()
  })
})

describe('Meeting form: statuses and delete', () => {
  it('offers the four statuses on an existing meeting and asks for a reason when cancelling', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('logMeeting', { id: 'future' }) })
    const d = dialog('Edit meeting')
    const seg = d.querySelector('[role="group"][aria-label="Status"]') as HTMLElement
    expect([...seg.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Upcoming', 'Completed', 'Cancelled', 'No-show'])
    await click(button(seg, 'Cancelled'))
    expect(field(d, 'Reason for cancelling')).not.toBeNull()
    await click(button(d, 'Save meeting'))
    expect(status('future')).toBe('upcoming')
    await type(field(d, 'Reason for cancelling'), 'Client postponed')
    await click(button(d, 'Save meeting'))
    await settle()
    expect(m.store.S.meetings.find(x => x.id === 'future')).toMatchObject({ status: 'cancelled', cancelReason: 'Client postponed', cancelledAt: expect.any(String) })
  })

  it('a new meeting offers only Upcoming and Completed', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('logMeeting', { dealId: 'dl1' }) })
    const seg = dialog('Log meeting').querySelector('[role="group"][aria-label="Status"]') as HTMLElement
    expect([...seg.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Upcoming', 'Completed'])
  })

  it('a cancelled meeting shows who cancelled it and why, and cannot be revived from the form', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('logMeeting', { id: 'off' }) })
    const d = dialog('Edit meeting')
    expect(d.textContent).toContain('by Pat Manager: Budget freeze')
    const seg = d.querySelector('[role="group"][aria-label="Status"]') as HTMLElement
    expect([...seg.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Cancelled'])
  })

  it('a completed meeting offers only Completed and points to marking its activity as a mistake', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('logMeeting', { id: 'done' }) })
    const d = dialog('Edit meeting')
    const seg = d.querySelector('[role="group"][aria-label="Status"]') as HTMLElement
    expect([...seg.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Completed'])
    expect(d.textContent).toContain('If it did not happen, mark its activity as a mistake.')
  })

  it('changing the date of an upcoming meeting in the form says it moves the meeting and keeps the old start', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('logMeeting', { id: 'past' }) })
    const d = dialog('Edit meeting')
    expect(d.textContent).not.toContain('Saving moves the meeting.')
    await type(field(d, 'Date'), '2026-10-16')
    expect(d.textContent).toContain('Saving moves the meeting. The earlier time stays in its history.')
    await click(button(d, 'Save meeting'))
    await settle()
    expect(m.store.S.meetings.find(x => x.id === 'past')).toMatchObject({ status: 'upcoming', start: '2026-10-16T09:00', rescheduledFrom: ['2026-10-09T09:00'] })
  })

  it('Delete asks in-page first, then removes the meeting', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('logMeeting', { id: 'done' }) })
    await click(button(dialog('Edit meeting'), 'Delete'))
    const c = dialog('Delete meeting?')
    expect(m.store.S.meetings.some(x => x.id === 'done')).toBe(true)
    await click(button(c, 'Delete meeting'))
    await settle()
    expect(m.store.S.meetings.some(x => x.id === 'done')).toBe(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('Delete is offered to the owner and to managers, not to another sales user', async () => {
    await hydrate({ meetings: [meeting('theirs', { ownerId: 'u-other', status: 'completed' })] })
    setRole(m, 'sales')
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('logMeeting', { id: 'theirs' }) })
    expect(button(dialog('Edit meeting'), 'Delete')).toBeUndefined()
    act(() => m.ui.UI.closeAll())
    setRole(m, 'manager')
    await act(async () => { m.ui.UI.open('logMeeting', { id: 'theirs' }) })
    expect(button(dialog('Edit meeting'), 'Delete')).toBeDefined()
  })
})

describe('Meeting briefing', () => {
  it('an overdue meeting reads "Outcome needed" and asks what happened; its actions menu offers the lifecycle actions', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('meetingBrief', { id: 'past' }) })
    const d = dialog('Briefing: Meeting past')
    expect(d.textContent).toContain('Outcome needed')
    expect(d.querySelector('[aria-label="What happened at Meeting past?"]')).not.toBeNull()
    await click(d.querySelector('[aria-label="Actions for Meeting past"]'))
    const labels = [...d.querySelectorAll('[role="menuitem"], .menu button')].map(x => x.textContent?.trim())
    expect(labels).toEqual(expect.arrayContaining(['Record outcome', 'Reschedule', 'Mark no-show', 'Cancel meeting', 'Delete meeting']))
  })

  it('a future meeting has no prompt', async () => {
    await hydrate()
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('meetingBrief', { id: 'future' }) })
    const d = dialog('Briefing: Meeting future')
    expect(d.textContent).toContain('Upcoming')
    expect(d.querySelector('[role="group"][aria-label^="What happened"]')).toBeNull()
  })
})

describe("Deal page Meetings card", () => {
  it('shows each status in words, the cancel reason, and the prompt for the overdue meeting', async () => {
    await hydrate()
    const { Deal } = await import('../pages/deals/Deal')
    await renderWithHosts(() => <Deal route={{ page: 'deal', id: 'dl1', q: {} } as never} />)
    const card = [...host.querySelectorAll('section.card')].find(c => c.querySelector('.card-h, h3, header')?.textContent?.startsWith('Meetings') || c.textContent?.startsWith('Meetings'))
    expect(card).toBeDefined()
    const txt = card?.textContent ?? ''
    expect(txt).toContain('Outcome needed')
    expect(txt).toContain('Cancelled')
    expect(txt).toContain('Budget freeze')
    expect(txt).toContain('No-show')
    expect(card?.querySelector('[aria-label="What happened at Meeting past?"]')).not.toBeNull()
    expect(card?.querySelector('[aria-label="What happened at Meeting future?"]')).toBeNull()
  })
})

describe('Dashboard: the meetings KPI counts upcoming meetings still ahead', () => {
  it('Pathways "Meetings scheduled" leaves out past, cancelled and no-show meetings', async () => {
    const pth = (id: string, over: Record<string, unknown> = {}) => meeting(id, { businessId: 'pth', dealId: null, ...over })
    await hydrate({
      pipelines: [PIPE, rec('pl_pth', { ...PIPE.data, businessId: 'pth' })],
      deals: [DEAL, rec('dl2', { ...DEAL.data, businessId: 'pth', pipelineId: 'pl_pth' })],
      meetings: [pth('a'), pth('b', { start: '2026-10-15T09:00' }), pth('c', { start: '2026-10-09T09:00' }), pth('d', { status: 'cancelled' }), pth('e', { status: 'no-show' })],
    })
    m.store.S.session.ws = 'pth'
    const { Dashboard } = await import('../pages/home/Dashboard')
    await renderWithHosts(() => <Dashboard />)
    expect(kpi('Meetings scheduled')).toBe('2')
  })
})

describe("Call outcome 'Meeting Booked'", () => {
  async function logCall() {
    await hydrate({ meetings: [], activities: [] })
    await renderWithHosts(null)
    await act(async () => { m.ui.UI.open('logCall', { contactId: 'ct1', businessId: 'ros', dealId: 'dl1' }) })
    const d = dialog('Log call')
    await click(button(d.querySelector('[aria-label="Call outcome"]') as HTMLElement, 'Meeting Booked'))
    return d
  }

  it('requires the meeting date: nothing is logged without it', async () => {
    const d = await logCall()
    expect(field(d, 'Meeting date')).not.toBeNull()
    await click(button(d, 'Save call'))
    expect(d.querySelector('[role="alert"]')?.textContent).toBe('Enter the date and time of the meeting you booked.')
    expect(m.store.S.activities).toHaveLength(0)
    expect(m.store.S.meetings).toHaveLength(0)
  })

  it('refuses a meeting time that has already passed', async () => {
    const d = await logCall()
    await type(field(d, 'Meeting date'), '2026-10-09')
    await type(field(d, 'Time'), '08:00')
    await click(button(d, 'Save call'))
    expect(d.querySelector('[role="alert"]')?.textContent).toBe('A booked meeting is in the future. Pick a later date or time.')
    expect(m.store.S.meetings).toHaveLength(0)
  })

  it('with a date, creates an upcoming meeting on the contact, company and deal, booked once', async () => {
    const d = await logCall()
    await type(field(d, 'Meeting date'), '2026-10-14')
    await type(field(d, 'Time'), '11:15')
    await click(button(d, 'Save call'))
    await settle()
    const S = m.store.S
    expect(S.meetings).toHaveLength(1)
    expect(S.meetings[0]).toMatchObject({ status: 'upcoming', start: '2026-10-14T11:15', companyId: 'co1', dealId: 'dl1', participants: ['ct1'], ownerId: 'u-me' })
    const booked = S.activities.filter(a => a.type === 'meeting_booked')
    expect(booked).toHaveLength(1)
    expect(booked[0].meetingId).toBe(S.meetings[0].id)
    // The prep follow-up is due no later than the meeting.
    const prep = S.tasks.find(t => t.type === 'Meeting Preparation')
    expect((prep?.due ?? '').slice(0, 10) <= '2026-10-14' && !!prep).toBe(true)
  })
})
