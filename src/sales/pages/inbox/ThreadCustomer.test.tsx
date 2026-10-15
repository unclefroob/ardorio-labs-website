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

describe('emails about a paying customer\'s account', () => {
  // rosterioWorld's company has a won Rosterio deal (dl2), so it is a customer.
  it('shows the company as a Customer and offers to link the email to their account instead of a deal', async () => {
    await open()
    expect(text()).toContain('Customer')
    await click(button(host, 'About their account, not a deal'))
    expect(m.store.S.threads[0]).toMatchObject({ relation: 'customer', dealId: null })
    expect(text()).toContain('Customer account')
    expect(text()).toContain('about their account with Rosterio, not a sale')
    expect(button(host, 'Link existing deal')).toBeUndefined()
  })

  it('linking it to the account clears a deal it had', async () => {
    await open('sales', 'dl1')
    await click(button(host, 'About their account, not a deal'))
    expect(m.store.S.threads[0]).toMatchObject({ relation: 'customer', dealId: null })
  })

  it('"Link a deal instead" undoes it and opens the deal picker; linking a deal clears the account link too', async () => {
    await open()
    await click(button(host, 'About their account, not a deal'))
    await click(button(host, 'Link a deal instead'))
    expect(m.store.S.threads[0].relation).toBeUndefined()
    expect(text()).toContain('Link to a deal')
    const { Act } = await import('../../data/Act')
    Act.linkThreadCustomer('th1', true)
    Act.linkThreadDeal('th1', 'dl1')
    expect(m.store.S.threads[0].relation).toBeUndefined()
  })

  it('a company that is not a customer has no such option', async () => {
    await open()
    m.store.S.deals.forEach(d => { d.status = 'open' })
    m.store.reindex()
    const { ThreadView } = await import('./parts/ThreadView')
    await act(async () => { root.render(<ThreadView t={m.store.S.threads[0]} onClose={() => undefined} />) })
    await settle(2)
    expect(button(host, 'About their account, not a deal')).toBeUndefined()
  })

  it('a viewer sees the customer standing but cannot change the link', async () => {
    await open('viewer')
    expect(button(host, 'About their account, not a deal')).toBeUndefined()
  })
})

describe('a company\'s emails', () => {
  it('the company page lists its conversations, newest first, marking account emails', async () => {
    await open()
    m.store.S.threads[0].relation = 'customer'
    m.store.reindex()
    const { CompanyEmails } = await import('../companies/CompanyEmails')
    await act(async () => { root.render(<CompanyEmails c={m.store.S.companies[0]} />) })
    await settle(2)
    expect(text()).toContain('Roster question')
    expect(text()).toContain('Customer account')
  })
})
