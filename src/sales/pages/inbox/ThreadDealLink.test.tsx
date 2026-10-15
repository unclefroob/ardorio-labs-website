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

async function open(role: 'sales' | 'viewer' = 'sales', dealId: string | null = null) {
  m = await loadSales()
  const w = rosterioWorld()
  w.collections.mailboxes = [rec('mb1', { address: 'me@example.com', name: 'Me', type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: false })]
  w.collections.threads = [rec('th1', { businessId: 'ros', mailboxId: 'mb1', subject: 'Roster question', contactId: 'ct1', companyId: 'co1', dealId, visibility: 'private', ownerId: 'u-me', assigneeId: 'u-me', unread: false, archived: false, classification: null, needsReply: false, sharedWith: [], updatedAt: '2026-10-09T09:00' })]
  w.collections.messages = [rec('ms1', { threadId: 'th1', dir: 'in', from: 'jo@acme.test', to: 'me@example.com', subject: 'Roster question', body: 'Hello', ts: '2026-10-09T09:00', status: 'received' })]
  m.bootstrap.hydrate(w)
  setRole(m, role)
  const { ThreadView } = await import('./parts/ThreadView')
  await act(async () => { root.render(<ThreadView t={m.store.S.threads[0]} onClose={() => undefined} />) })
  await settle(3)
}
const text = (): string => host.textContent ?? ''
const linked = (): string | null => m.store.S.threads[0].dealId

describe('linking an email conversation to an existing deal', () => {
  it('lists the contact\'s deals first, and linking one sets the deal and shows it', async () => {
    await open()
    expect(text()).toContain('No deal linked')
    await click(button(host, 'Link existing deal'))
    expect(text()).toContain('Link to a deal')
    expect(text()).toContain('Acme rostering')
    await click([...host.querySelectorAll<HTMLButtonElement>('button.ni')].find(b => b.textContent?.includes('Acme rostering')))
    await settle(2)
    expect(linked()).toBe('dl1')
    expect(text()).not.toContain('No deal linked')
    expect(button(host, 'Change deal')).toBeDefined()
    expect(m.store.S.audit.some(a => a.action === 'Email linked to deal')).toBe(true)
  })

  it('Unlink removes the link, and Change deal offers the others but not the current one', async () => {
    await open('sales', 'dl1')
    await click(button(host, 'Change deal'))
    const names = [...host.querySelectorAll<HTMLButtonElement>('button.ni')].map(b => b.textContent ?? '')
    expect(names.length).toBe(1) // dl2, not the linked dl1
    await click(button(host, 'Cancel'))
    await click(button(host, 'Unlink'))
    await settle(2)
    expect(linked()).toBeNull()
    expect(text()).toContain('No deal linked')
  })

  it('a viewer sees the link but no way to change it', async () => {
    await open('viewer', 'dl1')
    expect(button(host, 'Change deal')).toBeUndefined()
    expect(button(host, 'Unlink')).toBeUndefined()
    await open('viewer', null)
    expect(button(host, 'Link existing deal')).toBeUndefined()
  })

  it('a conversation can only be linked to a deal of its own business', async () => {
    await open()
    m.store.S.deals.push({ ...m.store.S.deals[0], id: 'dl_ard', businessId: 'ard', name: 'Ardorio deal' } as never)
    m.store.reindex()
    const { Act } = await import('../../data/Act')
    Act.linkThreadDeal('th1', 'dl_ard')
    expect(linked()).toBeNull()
    Act.linkThreadDeal('th1', 'nope')
    expect(linked()).toBeNull()
  })
})
