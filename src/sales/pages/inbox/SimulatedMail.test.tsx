import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld } from '../../testing/fixtures'
import { settle } from '../../testing/dom'
import { loadSales } from '../../testing/load'
import { routedInbox } from '../../testing/routed'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
// Gmail is not connected here: the server says so (an unanswered status check would hold message bodies back while it waits).
vi.mock('../../api/mailboxes', () => ({ mailStatusApi: vi.fn().mockResolvedValue({ configured: false }), messageHtmlApi: vi.fn() }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: '', industries: [], roles: [] })
const thread = (id: string, subject: string) => rec(id, {
  businessId: 'ros', mailboxId: 'mb1', subject, contactId: 'ct1', companyId: 'co1', dealId: null, visibility: 'shared', ownerId: 'u-me',
  assigneeId: 'u-me', unread: false, archived: false, classification: null, needsReply: false, sharedWith: [], updatedAt: '2026-10-09T09:00',
})
const msg = (id: string, threadId: string, o: Record<string, unknown>) => rec(id, {
  threadId, from: 'me@example.com', to: 'sam@example.com', subject: 'Hi', body: 'Body', ts: '2026-10-09T09:00', mailboxId: 'mb1', ...o,
})

async function render(sel?: string) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({
    businesses: [ROS],
    threads: [thread('th1', 'Legacy simulated'), thread('th2', 'Sent by hand'), thread('th3', 'Mixed'), thread('th4', 'Real Gmail')],
    messages: [
      // A reply written before the flag existed: every inbound message so far came from Simulate reply.
      msg('ms1', 'th1', { dir: 'in', status: 'received', from: 'sam@example.com', to: 'me@example.com' }),
      msg('ms2', 'th2', { dir: 'out', status: 'sent', manual: true }),
      msg('ms3', 'th3', { dir: 'out', status: 'sent', manual: true }),
      msg('ms4', 'th3', { dir: 'in', status: 'received', simulated: true, from: 'sam@example.com', to: 'me@example.com', ts: '2026-10-09T09:30' }),
      // Mail read from Gmail: no `simulated` flag at all, but it carries its Gmail id, so the legacy "every inbound is simulated" guess must not apply.
      msg('ms5', 'th4', { dir: 'in', status: 'received', from: 'sam@example.com', to: 'me@example.com', gmailId: '18f3a', body: 'See https://calendar.google.com/calendar/event?action=VIEW&eid=NXVxYWszc2hrcWx1cjJzbWVkMHA1NjdpZzQgcnlhbkBhcmRvcmlvLmNv' }),
    ],
  }))
  const { Page } = await routedInbox(m, { id: sel })
  await act(async () => { root.render(<Page />) })
  await settle(2)
}
const row = (subject: string): HTMLElement => [...host.querySelectorAll<HTMLElement>('.ib-m button')].find(b => b.textContent?.includes(subject)) as HTMLElement
const chip = (el: ParentNode, text: string): HTMLElement | undefined => [...el.querySelectorAll<HTMLElement>('.chip')].find(c => c.textContent === text)

describe('Simulated mail in the Inbox', () => {
  it('marks simulated and mixed threads in the list with an icon and text, and leaves real ones alone', async () => {
    await render()
    const sim = chip(row('Legacy simulated'), 'Simulated')
    expect(sim).toBeDefined()
    expect(sim?.querySelector('svg')).not.toBeNull()
    expect(sim?.getAttribute('title')).toContain('No real email')
    expect(chip(row('Mixed'), 'Includes simulated')).toBeDefined()
    expect(row('Sent by hand').textContent).not.toContain('imulated')
    expect(host.querySelector('.ib-l')?.textContent).toContain('No real email is sent or received yet')
  })

  it('marks each simulated message and explains that nothing was really sent', async () => {
    await render('th3')
    const r = host.querySelector('.ib-r') as HTMLElement
    expect(chip(r, 'Includes simulated mail')).toBeDefined()
    expect(chip(r, 'Received (simulated)')).toBeDefined()
    expect(chip(r, 'Sent by hand')).toBeDefined()
    expect(chip(r, 'Sent (simulated)')).toBeUndefined()
    expect(r.textContent).toContain('No real email is sent or received yet')
  })

  it('shows no simulated note on a conversation that is all real', async () => {
    await render('th2')
    const r = host.querySelector('.ib-r') as HTMLElement
    expect(r.textContent).not.toContain('imulated conversation')
    expect(r.textContent).not.toContain('No real email is sent or received yet')
  })

  it('real Gmail mail is never marked simulated, in the list or in the reader, and its header and links are built to wrap', async () => {
    await render('th4')
    expect(chip(row('Real Gmail'), 'Simulated')).toBeUndefined()
    expect(host.textContent).not.toContain('Received (simulated)')
    expect(host.textContent).not.toContain('No real email is sent or received yet. Simulated messages')
    const card = host.querySelector('.ib-r .msg') as HTMLElement
    expect(card.querySelector('.msg-h .msg-w .msg-top')).not.toBeNull()
    expect(card.querySelector('.msg-to')?.textContent).toContain('to me@example.com')
    expect(card.querySelector('.msg-b')?.textContent).toContain('calendar.google.com')
  })
})
