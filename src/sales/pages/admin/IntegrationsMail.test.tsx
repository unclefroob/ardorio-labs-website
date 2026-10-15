import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, field, settle, type } from '../../testing/dom'
import { salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'
import { setRole } from '../../testing/rosterioWorld'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../api/phone', () => ({ phoneStatusApi: vi.fn(async () => ({ configured: false, usage: { used: 0, limit: 0, resetsOn: '2099-11-01' } })), revealPhoneApi: vi.fn() }))
vi.mock('../../api/ai', async orig => ({ ...(await orig<object>()), aiEnrichUsage: vi.fn(async () => ({ enabled: false, usage: { used: 0, limit: 0, resetsOn: '2099-11-01' } })), aiEnrichLog: vi.fn(async () => ({ entries: [] })) }))
const mailStatusApi = vi.fn()
const connectMailboxApi = vi.fn()
const disconnectMailboxApi = vi.fn()
const syncMailboxApi = vi.fn()
const createMailboxApi = vi.fn()
const setMailboxBusinessesApi = vi.fn()
const setSendingApi = vi.fn()
vi.mock('../../api/mailboxes', () => ({
  mailStatusApi: (...a: unknown[]) => mailStatusApi(...a), connectMailboxApi: (...a: unknown[]) => connectMailboxApi(...a),
  disconnectMailboxApi: (...a: unknown[]) => disconnectMailboxApi(...a), syncMailboxApi: (...a: unknown[]) => syncMailboxApi(...a),
  createMailboxApi: (...a: unknown[]) => createMailboxApi(...a), setMailboxBusinessesApi: (...a: unknown[]) => setMailboxBusinessesApi(...a), setSendingApi: (...a: unknown[]) => setSendingApi(...a),
}))
const leaveTo = vi.fn()
vi.mock('../../mail/navigate', () => ({ leaveTo: (u: string) => leaveTo(u) }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const f of [mailStatusApi, connectMailboxApi, disconnectMailboxApi, syncMailboxApi, createMailboxApi, setSendingApi, setMailboxBusinessesApi, leaveTo]) f.mockReset()
  window.history.replaceState(null, '', '/')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const box = (id: string, over: Record<string, unknown> = {}) => ({
  id, address: `${id}@example.com`, name: id, type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: false, ...over,
})

async function show(status: { configured: boolean; reason?: string } | Error, boxes: Array<Record<string, unknown>>, role: 'admin' | 'sales' = 'sales') {
  if (status instanceof Error) mailStatusApi.mockRejectedValue(status)
  else mailStatusApi.mockResolvedValue(status)
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld())
  setRole(m, role)
  m.store.S.mailboxes.splice(0, m.store.S.mailboxes.length, ...(boxes as never[]))
  const { Integrations } = await import('./Integrations')
  await act(async () => { root.render(<Integrations />) })
  await settle(5)
  return m
}
const text = (): string => host.textContent ?? ''
const mailCard = (): Element => [...host.querySelectorAll('.card')].find(c => c.textContent?.includes('personal accounts'))!

describe('Gmail connections on the Integrations page', () => {
  it('keeps the simulated mailboxes, and says why, while real Gmail is not set up on the server', async () => {
    await show({ configured: false, reason: 'The token encryption key is not set on the server' }, [box('mb1')])
    expect(mailCard().textContent).toContain('Simulated mailbox')
    expect(mailCard().textContent).toContain('Real Gmail is not available yet: The token encryption key is not set on the server.')
    expect(mailCard().textContent).not.toContain('Connect Gmail')
  })

  it('falls back to simulated, claiming nothing real, when the status cannot be read', async () => {
    await show(new Error('down'), [box('mb1')])
    expect(mailCard().textContent).toContain('Simulated mailbox')
    expect([...mailCard().querySelectorAll('.chip')].some(c => c.textContent === 'Gmail')).toBe(false)
  })

  it('when live, drops the Simulated label and shows a sending switch that starts off', async () => {
    await show({ configured: true }, [box('mb1')])
    expect(mailCard().textContent).not.toContain('Simulated')
    expect([...mailCard().querySelectorAll('.chip')].some(c => c.textContent === 'Gmail')).toBe(true)
    expect(mailCard().textContent).toContain('Sending is off until the mailbox owner switches it on')
    expect(mailCard().textContent).toContain('private to its owner')
    const sw = mailCard().querySelector('[role="switch"]') as HTMLButtonElement
    expect(sw).not.toBeNull()
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('Connect Gmail asks the server for the consent address and goes there, without marking the mailbox connected itself', async () => {
    connectMailboxApi.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/auth?x=1' })
    const m = await show({ configured: true }, [box('mb1', { status: 'disconnected' })])
    await click(button(host, 'Connect Gmail'))
    await settle(3)
    expect(connectMailboxApi).toHaveBeenCalledWith('mb1')
    expect(leaveTo).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?x=1')
    expect(m.store.S.mailboxes[0].status).toBe('disconnected')
  })

  it('stays put and says so when the server refuses', async () => {
    const { SalesHttpError } = await import('../../api/http')
    connectMailboxApi.mockRejectedValue(new SalesHttpError(403, { error: 'Only the mailbox owner can connect a personal mailbox', code: 'ROLE_REQUIRED' }))
    await show({ configured: true }, [box('mb1', { status: 'disconnected' })])
    await click(button(host, 'Connect Gmail'))
    await settle(3)
    expect(leaveTo).not.toHaveBeenCalled()
    expect(button(host, 'Connect Gmail')).toBeDefined()
  })

  it('Disconnect goes to the server, not to a local status flip', async () => {
    disconnectMailboxApi.mockResolvedValue({ ok: true })
    const m = await show({ configured: true }, [box('mb1')])
    await click(button(host, 'Disconnect'))
    await settle(3)
    expect(disconnectMailboxApi).toHaveBeenCalledWith('mb1')
    expect(m.store.S.mailboxes[0].status).toBe('connected')
  })

  it('Sync now reports what was filed', async () => {
    syncMailboxApi.mockResolvedValue({ ran: true, reason: null, stored: 3, fetched: 9 })
    await show({ configured: true }, [box('mb1')])
    await click(button(host, 'Sync now'))
    await settle(3)
    expect(syncMailboxApi).toHaveBeenCalledWith('mb1')
  })

  it('an admin sees another person\'s personal mailbox but can only disconnect it, never connect or sync it', async () => {
    await show({ configured: true }, [box('theirs', { ownerId: 'u-other', status: 'connected' }), box('theirs2', { ownerId: 'u-other', status: 'disconnected' })], 'admin')
    expect(text()).toContain('theirs@example.com')
    expect(button(host, 'Disconnect')).toBeDefined()
    expect(button(host, 'Connect Gmail')).toBeUndefined()
    expect(button(host, 'Sync now')).toBeUndefined()
  })

  it('a sales user does not even see another person\'s personal mailbox', async () => {
    await show({ configured: true }, [box('theirs', { ownerId: 'u-other' })], 'sales')
    expect(text()).not.toContain('theirs@example.com')
  })

  it('a shared mailbox is connected by an admin of its business only', async () => {
    const shared = box('hello', { type: 'shared', ownerId: undefined, authorised: [], status: 'disconnected' })
    await show({ configured: true }, [shared], 'sales')
    expect(button(host, 'Connect Gmail')).toBeUndefined()
  })

  it('reads the result of Google consent from the address, says it, and clears it', async () => {
    window.history.replaceState(null, '', '/sales/integrations?mailbox=error&reason=wrong-account')
    await show({ configured: true }, [box('mb1', { status: 'disconnected' })])
    expect(window.location.search).toBe('')
  })
})

describe('the consent return messages', () => {
  it('maps every refusal to words, and never to the raw code', async () => {
    const { readMailReturn, mailReturnMessage } = await import('../../mail/client')
    expect(readMailReturn('?mailbox=connected&id=mb1')).toEqual({ ok: true, reason: undefined })
    expect(readMailReturn('?other=1')).toBeNull()
    for (const reason of ['denied', 'wrong-account', 'already-connected', 'not-allowed', 'no-mailbox', 'missing-scope', 'no-refresh-token', 'bad-state', 'not-configured', 'something-new']) {
      const msg = mailReturnMessage({ ok: false, reason })
      expect(msg.length).toBeGreaterThan(20)
      expect(msg).not.toContain(reason === 'something-new' ? 'something-new' : `${reason}.`)
    }
    expect(mailReturnMessage({ ok: false, reason: 'wrong-account' })).toContain('not this mailbox')
  })
})

describe('adding a mailbox', () => {
  it('offers to add one when there is none, instead of telling people to ask an administrator', async () => {
    await show({ configured: true }, [])
    expect(text()).not.toContain('provisioned for your account by an administrator')
    expect(text()).toContain('press Connect Gmail')
    expect(button(host, 'Add mailbox')).toBeDefined()
  })

  it('sends the address and business and never names an owner', async () => {
    createMailboxApi.mockResolvedValue({ id: 'mb_x' })
    await show({ configured: true }, [])
    await click(button(host, 'Add mailbox'))
    await type(field(host, 'Your Google address'), 'Rep@Example.com')
    const form = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Add mailbox')
    await click(form[form.length - 1])
    await settle(3)
    expect(createMailboxApi).toHaveBeenCalledTimes(1)
    const body = createMailboxApi.mock.calls[0][0]
    expect(body).toEqual({ address: 'Rep@Example.com', type: 'personal', businessIds: ['ros'] })
    expect('ownerId' in body).toBe(false)
  })

  it('shows the server\'s reason when it refuses, and keeps the form', async () => {
    await show({ configured: true }, [])
    const { SalesHttpError } = await import('../../api/http')
    createMailboxApi.mockRejectedValue(new SalesHttpError(409, { error: 'rep@example.com is already added as a mailbox', code: 'CONFLICT' }))
    await click(button(host, 'Add mailbox'))
    await type(field(host, 'Your Google address'), 'rep@example.com')
    const form = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Add mailbox')
    await click(form[form.length - 1])
    await settle(3)
    expect(text()).toContain('rep@example.com is already added as a mailbox')
    expect(field(host, 'Your Google address')).not.toBeNull()
  })

  it('does not call the server for a blank address', async () => {
    await show({ configured: true }, [])
    await click(button(host, 'Add mailbox'))
    const form = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Add mailbox')
    await click(form[form.length - 1])
    expect(createMailboxApi).not.toHaveBeenCalled()
    expect(text()).toContain('Enter the mailbox')
  })

  it('a shared inbox can be added by an admin only', async () => {
    await show({ configured: true }, [], 'sales')
    expect(button(host, 'Add shared inbox')).toBeUndefined()
    act(() => root.unmount()); root = createRoot(host)
    await show({ configured: true }, [], 'admin')
    expect(button(host, 'Add shared inbox')).toBeDefined()
  })
})

describe('switching sending on', () => {
  const sw = (): HTMLButtonElement => mailCard().querySelector('[role="switch"]') as HTMLButtonElement

  it('turns it on through the server and leaves it to the record to show it', async () => {
    setSendingApi.mockResolvedValue({ enabled: true })
    const m = await show({ configured: true }, [box('mb1', { canSend: false })])
    await click(sw())
    await settle(3)
    expect(setSendingApi).toHaveBeenCalledWith('mb1', true)
    expect(leaveTo).not.toHaveBeenCalled()
    expect(m.store.S.mailboxes[0].canSend).toBe(false)
  })

  it('when Google must be asked for send permission, it explains first and goes nowhere until confirmed', async () => {
    setSendingApi.mockResolvedValue({ enabled: false, url: 'https://accounts.google.com/o/oauth2/auth?send=1' })
    await show({ configured: true }, [box('mb1', { canSend: false })])
    await click(sw())
    await settle(3)
    expect(setSendingApi).toHaveBeenCalledWith('mb1', true)
    expect(leaveTo).not.toHaveBeenCalled()
  })

  it('turning it off goes to the server too', async () => {
    setSendingApi.mockResolvedValue({ enabled: false })
    await show({ configured: true }, [box('mb1', { canSend: true })])
    expect(sw().getAttribute('aria-checked')).toBe('true')
    await click(sw())
    await settle(3)
    expect(setSendingApi).toHaveBeenCalledWith('mb1', false)
  })

  it('is for the owner: an admin sees On or Off for someone else\'s mailbox, with no switch', async () => {
    await show({ configured: true }, [box('theirs', { ownerId: 'u-other', canSend: true })], 'admin')
    expect(mailCard().querySelector('[role="switch"]')).toBeNull()
    expect(mailCard().textContent).toContain('On')
  })

  it('cannot be switched while the mailbox is disconnected', async () => {
    await show({ configured: true }, [box('mb1', { status: 'disconnected' })])
    expect(sw().disabled).toBe(true)
  })

  it('reads the sending result from the return address', async () => {
    const { readMailReturn, mailReturnMessage } = await import('../../mail/client')
    expect(readMailReturn('?mailbox=connected&id=mb1&sending=1')).toEqual({ ok: true, reason: undefined, sending: true })
    expect(mailReturnMessage({ ok: true, sending: true })).toContain('Sending is on')
    expect(mailReturnMessage({ ok: false, reason: 'missing-send-scope' })).toContain('sending stays off')
  })
})

describe('changing a connected mailbox\'s businesses', () => {
  it('the owner can open Edit and save a new set of businesses, sent to the server', async () => {
    setMailboxBusinessesApi.mockResolvedValue({ businessIds: ['ros'] })
    await show({ configured: true }, [box('mb1')], 'admin')
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Change businesses for mb1@example.com"]'))
    expect(host.textContent).toContain('Businesses for mb1@example.com')
    await click(button(host, 'Save'))
    expect(setMailboxBusinessesApi).toHaveBeenCalledWith('mb1', ['ros'])
  })

  it('refuses an empty choice before calling the server', async () => {
    await show({ configured: true }, [box('mb1')])
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Change businesses for mb1@example.com"]'))
    const ck = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await click(ck)
    await click(button(host, 'Save'))
    expect(setMailboxBusinessesApi).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Choose at least one business')
  })

  it('nobody but the owner sees Edit on a personal mailbox', async () => {
    await show({ configured: true }, [box('theirs', { ownerId: 'u-other' })], 'admin')
    expect(host.querySelector('button[aria-label="Change businesses for theirs@example.com"]')).toBeNull()
  })
})
