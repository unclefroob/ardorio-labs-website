import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld } from '../../testing/fixtures'
import { click, settle } from '../../testing/dom'
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

async function render(sel?: string) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({
    businesses: [ROS],
    messages: [rec('ms1', { threadId: 'th1', dir: 'in', status: 'received', from: 'jo@acme.test', to: ['me@example.com'], subject: 'Hello', body: 'Hi there', ts: '2026-10-09T09:00', mailboxId: 'mb1' })],
  }))
  const { Inbox } = await import('./Inbox')
  await act(async () => { root.render(<Inbox route={{ page: 'inbox', id: sel }} />) })
  await settle(2)
}
const inbox = (): HTMLElement => host.querySelector('.inbox') as HTMLElement
const reader = (): HTMLElement => host.querySelector('.ib-r') as HTMLElement

// The classes are what the narrow-screen CSS keys off. That the CSS then hides the right pane is
// checked in sales.layout.test.ts against the stylesheet text; how it looks was not checked in a browser.
describe('Inbox panes (narrow layout is driven by has-sel)', () => {
  it('starts on the list, with no conversation open', async () => {
    await render()
    expect(inbox().classList.contains('has-sel')).toBe(false)
    expect(host.textContent).toContain('Hello')
    expect(reader().textContent).toContain('Select a conversation')
  })

  it('opening a conversation marks the inbox as having one open, and the reader shows a back control', async () => {
    await render()
    await click([...host.querySelectorAll<HTMLElement>('.ib-m button')].find(b => b.textContent?.includes('Hello')))
    expect(inbox().classList.contains('has-sel')).toBe(true)
    const back = reader().querySelector<HTMLButtonElement>('button[aria-label="Back to conversations"]')
    expect(back).not.toBeNull()
    expect(back?.classList.contains('hamb')).toBe(true)
  })

  it('the back control returns to the list', async () => {
    await render('th1')
    expect(inbox().classList.contains('has-sel')).toBe(true)
    await click(reader().querySelector('button[aria-label="Back to conversations"]'))
    expect(inbox().classList.contains('has-sel')).toBe(false)
  })

  it('a private conversation that is not shared also has a way back', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(salesWorld({
      businesses: [ROS],
      threads: [rec('th9', {
        businessId: 'ros', mailboxId: 'mb1', subject: 'Secret', contactId: 'ct1', companyId: 'co1', dealId: null, visibility: 'private', ownerId: 'u-other',
        assigneeId: 'u-other', unread: false, archived: false, classification: null, needsReply: false, sharedWith: [], updatedAt: '2026-10-09T09:00',
      })],
    }))
    const { Inbox } = await import('./Inbox')
    await act(async () => { root.render(<Inbox route={{ page: 'inbox', id: 'th9' }} />) })
    await settle(2)
    expect(reader().textContent).toContain('Private conversation')
    const back = [...reader().querySelectorAll('button')].find(b => b.textContent === 'Back to conversations')
    expect(back).toBeDefined()
    await click(back)
    expect(inbox().classList.contains('has-sel')).toBe(false)
  })
})
