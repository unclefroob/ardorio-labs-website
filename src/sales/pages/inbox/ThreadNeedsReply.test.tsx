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
  it('a conversation that needs a reply has a one-click way to say it does not', async () => {
    await open()
    await click(button(host, "Doesn't need a reply"))
    expect(m.store.S.threads[0].needsReply).toBe(false)
    expect(button(host, "Doesn't need a reply")).toBeUndefined()
  })

  it('the button is not there when nothing is needed, or for a viewer', async () => {
    await open('sales', null, false)
    expect(button(host, "Doesn't need a reply")).toBeUndefined()
    await open('viewer')
    expect(button(host, "Doesn't need a reply")).toBeUndefined()
  })
})
