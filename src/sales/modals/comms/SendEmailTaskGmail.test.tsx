import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailTask, rec, salesWorld } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => ({ changes: [], cursor: 'c', more: false, serverNow: '', membersVersion: '', clockOffsetMinutes: 0 })), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const mailStatusApi = vi.fn()
const sendTaskApi = vi.fn()
vi.mock('../../api/mailboxes', () => ({ mailStatusApi: (...a: unknown[]) => mailStatusApi(...a), sendTaskApi: (...a: unknown[]) => sendTaskApi(...a) }))

let host: HTMLDivElement
let root: Root
let m: Sales
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mailStatusApi.mockReset(); sendTaskApi.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function open(o: { live: boolean; canSend?: boolean; ownerId?: string }) {
  mailStatusApi.mockResolvedValue({ configured: o.live })
  m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ tasks: [rec('tk_en1_0', emailTask())] }))
  const mb = m.store.S.mailboxes[0]
  mb.canSend = o.canSend ?? true
  if (o.ownerId) mb.ownerId = o.ownerId
  m.store.reindex()
  const { SendEmailTask } = await import('./SendEmailTask')
  await act(async () => { root.render(<SendEmailTask taskId="tk_en1_0" />) })
  await settle(5)
}
const text = (): string => host.textContent ?? ''

describe('sending a sequence email from SalesOS', () => {
  it('offers Send now through Gmail when it can, keeping "I sent it myself" for mail sent another way', async () => {
    await open({ live: true })
    expect(button(host, 'Send now')).toBeDefined()
    expect(button(host, 'I sent it myself')).toBeDefined()
    expect(button(host, 'Mark as sent')).toBeUndefined()
    expect(text()).toContain('through Gmail')
    expect(text()).not.toContain('Copy this into your own mail client')
  })

  it('Send now asks the server to send that task, and records nothing itself', async () => {
    sendTaskApi.mockResolvedValue({ threadId: 'th', messageId: 'ms', gmailId: 'g', recorded: true })
    await open({ live: true })
    const before = m.store.S.messages.length
    await click(button(host, 'Send now'))
    await settle(3)
    expect(sendTaskApi).toHaveBeenCalledWith('tk_en1_0')
    expect(m.store.S.messages.length).toBe(before)
    expect(m.store.S.tasks.find(t => t.id === 'tk_en1_0')?.status).toBe('Not Started') // the server completes it; the change arrives by sync
  })

  it('shows why when the server refuses, and nothing is marked sent', async () => {
    await open({ live: true })
    const { SalesHttpError } = await import('../../api/http')
    sendTaskApi.mockRejectedValue(new SalesHttpError(409, { error: 'This email is no longer waiting to be sent', code: 'CONFLICT' }))
    await click(button(host, 'Send now'))
    await settle(3)
    expect(text()).toContain('This email is no longer waiting to be sent')
    expect(button(host, 'Send now')?.disabled).toBe(false)
  })

  it('with sending off for the mailbox it is the copy-and-mark flow, and says sending is off', async () => {
    await open({ live: true, canSend: false })
    expect(button(host, 'Send now')).toBeUndefined()
    expect(button(host, 'Mark as sent')).toBeDefined()
    expect(text()).toContain('Sending is off for')
  })

  it('someone else\'s personal mailbox is never offered for Send now', async () => {
    await open({ live: true, ownerId: 'u-other' })
    expect(button(host, 'Send now')).toBeUndefined()
  })

  it('without real Gmail it is the copy-and-mark flow, with no call to the server', async () => {
    await open({ live: false })
    expect(button(host, 'Send now')).toBeUndefined()
    expect(button(host, 'Mark as sent')).toBeDefined()
    expect(sendTaskApi).not.toHaveBeenCalled()
  })
})
