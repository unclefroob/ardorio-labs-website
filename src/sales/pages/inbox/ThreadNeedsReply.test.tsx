import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../api/mailboxes', () => ({ mailStatusApi: vi.fn(async () => ({ configured: false })), messageHtmlApi: vi.fn() }))

let host: HTMLDivElement
let root: Root
let m: Sales
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

async function press(key: string, target: EventTarget = document.body, o: KeyboardEventInit = {}): Promise<void> {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o })) })
}

async function open(role: 'sales' | 'viewer' = 'sales', dealId: string | null = null, needsReply = true) {
  m = await loadSales()
  const w = rosterioWorld()
  w.collections.mailboxes = [rec('mb1', { address: 'me@example.com', name: 'Me', type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: false })]
  w.collections.threads = [rec('th1', { businessId: 'ros', mailboxId: 'mb1', subject: 'Roster question', contactId: 'ct1', companyId: 'co1', dealId, visibility: 'private', ownerId: 'u-me', assigneeId: 'u-me', unread: false, archived: false, classification: null, needsReply, sharedWith: [], updatedAt: '2026-10-09T09:00' })]
  w.collections.messages = [rec('ms1', { threadId: 'th1', dir: 'in', from: 'jo@acme.test', to: 'me@example.com', subject: 'Roster question', body: 'Hello', ts: '2026-10-09T09:00', status: 'received' })]
  m.bootstrap.hydrate(w)
  setRole(m, role)
  const { ThreadView } = await import('./parts/ThreadView')
  await act(async () => { root.render(<ThreadView t={m.store.S.threads[0]} onClose={() => undefined} />) })
  await settle(3)
}

describe('needs reply, by hand', () => {
  it('a conversation that needs a reply has a one-click way to say it does not, showing its key', async () => {
    await open()
    const b = button(host, /^Doesn't need a replyD$/)!
    expect(b.querySelector('kbd')?.textContent).toBe('D')
    expect(b.getAttribute('aria-keyshortcuts')).toBe('D')
    await click(b)
    expect(m.store.S.threads[0].needsReply).toBe(false)
    expect(button(host, /^Doesn't need a reply/)).toBeUndefined()
    expect(button(host, /^Needs a replyD$/)).toBeDefined() // and the way back, with the same key
  })

  it('a viewer gets neither button, and D does nothing for them', async () => {
    await open('viewer')
    expect(button(host, /need a reply|Needs a reply/)).toBeUndefined()
    await press('d')
    expect(m.store.S.threads[0].needsReply).toBe(true)
  })
})

describe('the D shortcut', () => {
  it('marks it as not needing a reply, and again as needing one, each with Undo', async () => {
    await open()
    await press('d')
    expect(m.store.S.threads[0].needsReply).toBe(false)
    expect(m.ui.UI.get().toasts.at(-1)?.action?.label).toBe('Undo')
    await press('D')
    expect(m.store.S.threads[0].needsReply).toBe(true)
    expect(m.ui.UI.get().toasts.at(-1)?.msg).toBe('Marked as needing a reply.')
  })

  it('is just a letter while typing, with a modifier, or under a dialog', async () => {
    await open()
    const field = document.createElement('input')
    host.appendChild(field)
    await press('d', field)
    await press('d', document.body, { ctrlKey: true })
    expect(m.store.S.threads[0].needsReply).toBe(true)
    m.ui.UI.open('compose')
    await press('d')
    expect(m.store.S.threads[0].needsReply).toBe(true)
    m.ui.UI.close()
  })
})
