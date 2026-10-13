import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld } from '../../testing/fixtures'
import { settle } from '../../testing/dom'
import { loadSales } from '../../testing/load'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

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
    threads: [thread('th1', 'Legacy simulated'), thread('th2', 'Sent by hand'), thread('th3', 'Mixed')],
    messages: [
      // A reply written before the flag existed: every inbound message so far came from Simulate reply.
      msg('ms1', 'th1', { dir: 'in', status: 'received', from: 'sam@example.com', to: 'me@example.com' }),
      msg('ms2', 'th2', { dir: 'out', status: 'sent', manual: true }),
      msg('ms3', 'th3', { dir: 'out', status: 'sent', manual: true }),
      msg('ms4', 'th3', { dir: 'in', status: 'received', simulated: true, from: 'sam@example.com', to: 'me@example.com', ts: '2026-10-09T09:30' }),
    ],
  }))
  const { Inbox } = await import('./Inbox')
  await act(async () => { root.render(<Inbox route={{ page: 'inbox', id: sel }} />) })
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
})
