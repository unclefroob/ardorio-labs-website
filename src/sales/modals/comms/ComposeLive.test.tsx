import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse } from '../../api/contract'
import { appliedResult, changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const postBatch = vi.fn()
const getChanges = vi.fn(async () => changes([]))
vi.mock('../../api/records', () => ({ postBatch: (r: BatchRequest) => postBatch(r), getChanges: () => getChanges(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../api/ai', async orig => ({ ...(await orig<object>()), aiEnrichUsage: vi.fn(async () => ({ enabled: false, usage: { used: 0, limit: 0, resetsOn: '2099-11-01' } })) }))
const mailStatusApi = vi.fn()
const sendMailApi = vi.fn()
vi.mock('../../api/mailboxes', () => ({
  mailStatusApi: (...a: unknown[]) => mailStatusApi(...a), sendMailApi: (...a: unknown[]) => sendMailApi(...a),
  connectMailboxApi: vi.fn(), disconnectMailboxApi: vi.fn(), syncMailboxApi: vi.fn(), createMailboxApi: vi.fn(), setSendingApi: vi.fn(),
}))

let host: HTMLDivElement
let root: Root
let m: Sales
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const f of [postBatch, mailStatusApi, sendMailApi]) f.mockReset()
  postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({ serverNow: '2026-10-10T00:00:00.000Z', results: req.ops.map((op, i) => appliedResult(i, op.collection, op.id, 1, 'set' in op ? { ...op.set } : {})) }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

type Status = { configured: boolean } | 'loading' | Error
interface Opts { status: Status; canSend?: boolean; thread?: Record<string, unknown> }

async function open(o: Opts, props: Record<string, unknown> = {}) {
  if (o.status === 'loading') mailStatusApi.mockReturnValue(new Promise(() => undefined))
  else if (o.status instanceof Error) mailStatusApi.mockRejectedValue(o.status)
  else mailStatusApi.mockResolvedValue(o.status)
  m = await loadSales()
  const w = rosterioWorld({ contactEmail: 'jo@acme.test' })
  w.collections.mailboxes = [rec('mb_live', { address: 'me@example.com', name: 'Me', type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: o.canSend ?? true })]
  if (o.thread) w.collections.threads = [rec('th1', { businessId: 'ros', mailboxId: 'mb_live', subject: 'Quote', contactId: 'ct1', companyId: 'co1', dealId: null, visibility: 'private', ownerId: 'u-me', assigneeId: 'u-me', unread: false, archived: false, classification: null, needsReply: true, sharedWith: [], updatedAt: '2026-10-09T09:00', ...o.thread })]
  m.bootstrap.hydrate(w)
  setRole(m, 'sales')
  const { Compose } = await import('./Compose')
  await act(async () => { root.render(<Compose contactId="ct1" businessId="ros" subject="Hello" body="Hi Jo" {...props} />) })
  await settle(5)
}
const text = (): string => document.body.textContent ?? ''

describe('Send in Compose', () => {
  it('sends for real through the API when Gmail is live and sending is on, and writes no simulated message', async () => {
    sendMailApi.mockResolvedValue({ threadId: 'th_gm_x', messageId: 'ms_gm_x', gmailId: 'g', recorded: true })
    await open({ status: { configured: true } })
    expect(text()).toContain('Sends through Gmail')
    expect(text()).not.toContain('Sending is simulated')
    const before = m.store.S.messages.length
    await click(button(document.body, 'Send'))
    await settle(3)
    expect(sendMailApi).toHaveBeenCalledTimes(1)
    expect(sendMailApi.mock.calls[0][0]).toMatchObject({ mailboxId: 'mb_live', to: 'jo@acme.test', subject: 'Hello', businessId: 'ros', contactId: 'ct1' })
    expect(sendMailApi.mock.calls[0][0].threadId).toBeUndefined()
    expect(m.store.S.messages.length).toBe(before)
  })

  it('shows it is sending, and is done as soon as Gmail has it, without waiting for the sync', async () => {
    let sent!: (v: unknown) => void
    sendMailApi.mockReturnValue(new Promise(r => { sent = r }))
    await open({ status: { configured: true } })
    getChanges.mockReturnValue(new Promise(() => undefined)) // a sync that never answers
    await click(button(document.body, 'Send'))
    const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Sending…'))
    expect(b?.getAttribute('aria-busy')).toBe('true')
    expect(text()).not.toContain('Drafting…') // the AI draft button is not mistaken for busy
    await act(async () => { sent({ threadId: 'th_gm_x', messageId: 'ms_gm_x', gmailId: 'g', recorded: true }) })
    await settle(2)
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Email sent from me@example.com')
    getChanges.mockImplementation(async () => changes([]))
  })

  it('with sending off for the mailbox, Send is disabled, it says why, and nothing is sent', async () => {
    await open({ status: { configured: true }, canSend: false })
    expect(text()).toContain('Sending is off')
    expect(button(document.body, 'Send')?.disabled).toBe(true)
    await click(button(document.body, 'Send'))
    expect(sendMailApi).not.toHaveBeenCalled()
    expect(button(document.body, 'Save draft')?.disabled).toBe(false)
  })

  it('while the Gmail status is still loading Send is disabled, so it cannot fall back to a simulated send', async () => {
    await open({ status: 'loading' })
    expect(button(document.body, 'Send (simulated)')?.disabled).toBe(true)
  })

  it('when Gmail is not set up it is still the simulated send, and calls no API', async () => {
    await open({ status: { configured: false } })
    expect(text()).toContain('Sending is simulated')
    await click(button(document.body, 'Send (simulated)'))
    await settle(3)
    expect(sendMailApi).not.toHaveBeenCalled()
    expect(m.store.S.messages.some(x => x.simulated === true)).toBe(true)
  })

  it('shows the server\'s reason when it refuses, says nothing was sent, and keeps the email', async () => {
    await open({ status: { configured: true } })
    const { SalesHttpError } = await import('../../api/http')
    sendMailApi.mockRejectedValue(new SalesHttpError(409, { error: 'jo@acme.test is on the suppression list', code: 'SUPPRESSED' }))
    await click(button(document.body, 'Send'))
    await settle(3)
    expect(text()).toContain('jo@acme.test is on the suppression list')
    expect(document.querySelector('[role="dialog"], .modal')).not.toBeNull()
  })

  it('a network failure says nothing was sent', async () => {
    await open({ status: { configured: true } })
    sendMailApi.mockRejectedValue(new Error('offline'))
    await click(button(document.body, 'Send'))
    await settle(3)
    expect(text()).toContain('Nothing was sent')
  })

  it('a reply in a Gmail conversation goes into that thread; a conversation that is not in Gmail starts a new one', async () => {
    sendMailApi.mockResolvedValue({ threadId: 'th1', messageId: 'm', gmailId: 'g', recorded: true })
    await open({ status: { configured: true }, thread: { gmailThreadId: 'gt1' } }, { threadId: 'th1' })
    await click(button(document.body, 'Send'))
    await settle(3)
    expect(sendMailApi.mock.calls[0][0]).toMatchObject({ threadId: 'th1' })
    expect(sendMailApi.mock.calls[0][0].businessId).toBeUndefined()
  })

  it('a legacy (simulated) conversation is not replied into: a real one is started instead', async () => {
    sendMailApi.mockResolvedValue({ threadId: 'th_gm_new', messageId: 'm', gmailId: 'g', recorded: true })
    await open({ status: { configured: true }, thread: {} }, { threadId: 'th1' })
    await click(button(document.body, 'Send'))
    await settle(3)
    expect(sendMailApi.mock.calls[0][0].threadId).toBeUndefined()
    expect(sendMailApi.mock.calls[0][0]).toMatchObject({ businessId: 'ros' })
  })
})
