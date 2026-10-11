import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhoneStatusResponse, RevealPhoneResponse } from '../../api/contract'
import { button, click, settle } from '../../testing/dom'
import { rec, salesWorld, CONTACT } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'
import { setRole } from '../../testing/rosterioWorld'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const phoneStatusApi = vi.fn<(signal?: AbortSignal) => Promise<PhoneStatusResponse>>()
const revealPhoneApi = vi.fn<(req: unknown, signal?: AbortSignal) => Promise<RevealPhoneResponse>>()
vi.mock('../../api/phone', () => ({
  phoneStatusApi: (s?: AbortSignal) => phoneStatusApi(s),
  revealPhoneApi: (r: unknown, s?: AbortSignal) => revealPhoneApi(r, s),
}))

const usage = (used = 12) => ({ used, limit: 100, resetsOn: '2099-11-01' })
const STATUS: PhoneStatusResponse = { configured: true, provider: 'leadmagic', label: 'LeadMagic', usage: usage() }
const reply = (o: Partial<RevealPhoneResponse> = {}): RevealPhoneResponse => ({
  mode: 'live', provider: 'leadmagic', status: 'found', numbers: [{ e164: '+61412345678', type: 'mobile', confidence: 0.87 }], creditsUsed: 1, usage: usage(13), ...o,
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  phoneStatusApi.mockReset()
  revealPhoneApi.mockReset()
  phoneStatusApi.mockResolvedValue(STATUS)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function open(opts: { contact?: Record<string, unknown>; role?: 'sales' | 'viewer' } = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ contacts: [rec('ct1', { ...CONTACT, ...opts.contact })] }))
  if (opts.role) setRole(m, opts.role)
  const { Act } = await import('../../data/Act')
  const { FindMobile } = await import('./FindMobile')
  await act(async () => { root.render(<FindMobile contactId="ct1" />) })
  await settle(4)
  return { ...m, Act }
}
const text = (): string => host.textContent ?? ''
const find = (): HTMLButtonElement | undefined => button(host, /^Find mobile$/)
const run = async (): Promise<void> => { await click(find()); await settle(4) }

describe('before a lookup', () => {
  it('shows the vendor and the allowance, and makes no lookup until clicked', async () => {
    await open()
    expect(text()).toContain('Phone lookup: LeadMagic')
    expect(text()).toContain('88 of 100 phone lookups left this month (resets 1 Nov)')
    expect(text()).toContain("For manual calls. Check the Do Not Call Register before cold calling, and don't text without consent.")
    expect(find()).toBeDefined()
    expect(revealPhoneApi).not.toHaveBeenCalled()
  })

  it('shows another vendor label from the server as given, and falls back to the provider name', async () => {
    phoneStatusApi.mockResolvedValue({ configured: true, provider: 'signalhire', usage: usage() })
    await open()
    expect(text()).toContain('Phone lookup: SignalHire')
  })

  it('is not configured: plain words, no vendor or key details, no lookup button', async () => {
    phoneStatusApi.mockResolvedValue({ configured: false, usage: usage(0) })
    await open()
    expect(text()).toContain("Phone lookup isn't set up. An admin needs to choose a provider on the server.")
    expect(find()).toBeUndefined()
    expect(text()).not.toMatch(/key|leadmagic|signalhire|wiza/i)
  })

  it('cap reached: says when it resets and offers no lookup', async () => {
    phoneStatusApi.mockResolvedValue({ ...STATUS, usage: usage(100) })
    await open()
    expect(text()).toContain('Phone lookups are used up until 1 Nov')
    expect(find()).toBeUndefined()
  })

  it('says so when the status cannot be read, and retries', async () => {
    phoneStatusApi.mockRejectedValueOnce(new Error('down'))
    await open()
    expect(text()).toContain("Couldn't check phone lookup just now.")
    expect(find()).toBeUndefined()
    await click(button(host, 'Retry'))
    await settle(4)
    expect(find()).toBeDefined()
  })

  it('a viewer gets the read-only message and no lookup', async () => {
    await open({ role: 'viewer' })
    expect(text()).toContain('Read-only access')
    expect(find()).toBeUndefined()
    expect(revealPhoneApi).not.toHaveBeenCalled()
  })

  it('has a polite live region for status changes', async () => {
    await open()
    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull()
  })
})

describe('running', () => {
  it('sends the contact and business once, shows loading with a cancel, then the result', async () => {
    await open()
    let finish!: (r: RevealPhoneResponse) => void
    revealPhoneApi.mockReturnValueOnce(new Promise(r => { finish = r }))
    await click(find())
    expect(revealPhoneApi).toHaveBeenCalledTimes(1)
    expect(revealPhoneApi.mock.calls[0][0]).toEqual({ contactId: 'ct1', businessId: 'ros' })
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(text()).toContain('Looking up a mobile')
    expect(button(host, 'Cancel search')).toBeDefined()
    await act(async () => { finish(reply()) })
    await settle(3)
    expect(text()).toContain('0412 345 678')
  })

  it('cancel stops waiting and says a sent request may still count', async () => {
    await open()
    let seen: AbortSignal | undefined
    revealPhoneApi.mockImplementationOnce((_r, sig) => { seen = sig; return new Promise(() => undefined) })
    await click(find())
    await click(button(host, 'Cancel search'))
    expect(seen?.aborted).toBe(true)
    expect(text()).toContain('Cancelled. A request already sent may still have been counted.')
    expect(find()).toBeDefined()
  })

  it('closing the modal aborts the request', async () => {
    await open()
    let seen: AbortSignal | undefined
    revealPhoneApi.mockImplementationOnce((_r, sig) => { seen = sig; return new Promise(() => undefined) })
    await click(find())
    await act(async () => { root.unmount() })
    root = createRoot(host)
    expect(seen?.aborted).toBe(true)
  })

  it('updates the allowance from the answer', async () => {
    const m = await open()
    revealPhoneApi.mockResolvedValueOnce(reply({ usage: usage(40) }))
    await run()
    const { getPhoneStatus } = await import('../../phone/client')
    expect(getPhoneStatus()?.usage.used).toBe(40)
    expect(m.store.S.contacts[0].mobile ?? '').toBe('')
  })
})

describe('results', () => {
  it('lists each number formatted, with a type chip and a confidence chip when present', async () => {
    await open()
    revealPhoneApi.mockResolvedValueOnce(reply({ numbers: [
      { e164: '+61412345678', type: 'mobile', confidence: 0.87 },
      { e164: '+61390000000', type: 'other' },
      { e164: '+64211234567', type: 'unknown', confidence: 55 },
    ] }))
    await run()
    const rows = [...host.querySelectorAll('[role=listitem]')].map(r => r.textContent ?? '')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('0412 345 678')
    expect(rows[0]).toContain('Mobile')
    expect(rows[0]).toContain('87% confidence')
    expect(rows[1]).toContain('(03) 9000 0000')
    expect(rows[1]).toContain('Other')
    expect(rows[1]).not.toContain('confidence')
    expect(rows[2]).toContain('+64 211234567')
    expect(rows[2]).toContain('Unknown')
    expect(rows[2]).toContain('55% confidence')
    expect(button(host, 'Add as mobile')).toBeDefined()
    expect(button(host, 'Add as phone')).toBeDefined()
    expect(text()).toContain("don't text without consent")
  })

  it('shows when it was last checked', async () => {
    await open()
    revealPhoneApi.mockResolvedValueOnce(reply({ lastCheckedAt: new Date(Date.now() - 12 * 86_400_000).toISOString() }))
    await run()
    expect(text()).toContain('Checked 12 days ago')
  })

  it('not found: says no charge, lists nothing to add', async () => {
    await open()
    revealPhoneApi.mockResolvedValueOnce(reply({ status: 'not_found', numbers: [], creditsUsed: 0 }))
    await run()
    expect(text()).toContain('Not found, no charge')
    expect(button(host, /^Add as/)).toBeUndefined()
  })
})

describe('failures', () => {
  const fail = async (status: number, code: string, details?: Record<string, unknown>) => {
    const m = await open()
    revealPhoneApi.mockRejectedValueOnce(new m.http.SalesHttpError(status, { error: 'server words', code: code as never, details }))
    await run()
    return m
  }

  it('not configured', async () => {
    await fail(409, 'NOT_CONFIGURED')
    expect(text()).toContain("Phone lookup isn't set up. An admin needs to choose a provider on the server.")
    expect(text()).not.toContain('server words')
  })

  it('cap reached with the date', async () => {
    await fail(429, 'PHONE_CAP_REACHED', usage(100))
    expect(text()).toContain('Phone lookups are used up until 1 Nov')
  })

  it('no input: says what to add, with an Edit contact button that opens the editor', async () => {
    const m = await fail(400, 'PHONE_NO_INPUT')
    expect(text()).toContain("Add the contact's LinkedIn URL or work email, or their name and company, to look up a mobile")
    await click(button(host, 'Edit contact'))
    const modals = m.ui.UI.get().modals
    expect(modals[modals.length - 1]).toMatchObject({ name: 'editContact', props: { id: 'ct1' } })
  })

  it('provider error is generic and offers a retry that looks up again only when clicked', async () => {
    await fail(502, 'PROVIDER_ERROR')
    expect(text()).toContain('The phone lookup had a problem.')
    expect(text()).not.toContain('server words')
    expect(revealPhoneApi).toHaveBeenCalledTimes(1)
    revealPhoneApi.mockResolvedValueOnce(reply())
    await click(button(host, 'Try again'))
    await settle(3)
    expect(revealPhoneApi).toHaveBeenCalledTimes(2)
    expect(text()).toContain('0412 345 678')
  })

  it('an unknown failure shows the message and a retry', async () => {
    await fail(500, 'INTERNAL')
    expect(text()).toContain('Lookup failed.')
    expect(button(host, 'Retry')).toBeDefined()
  })
})

describe('adding a number', () => {
  const lastModal = (m: { ui: { UI: { get(): { modals: Array<{ name: string; props: Record<string, unknown> }> } } } }) => {
    const ms = m.ui.UI.get().modals
    return ms[ms.length - 1]
  }

  it('Add as mobile sets the mobile field with the source and Unverified, only on click', async () => {
    const m = await open()
    revealPhoneApi.mockResolvedValueOnce(reply())
    await run()
    expect(m.store.S.contacts[0].mobile ?? '').toBe('')
    await click(button(host, 'Add as mobile'))
    const c = m.store.S.contacts[0]
    expect(c.mobile).toBe('0412 345 678')
    expect(c.phone ?? '').toBe('')
    const e = c.enrichment?.mobile
    expect(e?.source).toMatch(/^Phone lookup \(LeadMagic\) \d{1,2} [A-Z][a-z]{2} \d{4}$/)
    expect(e?.verification).toBe('Unverified')
    expect(c.verification).toBe('Verified')   // the email's verification is not touched
    expect(text()).toContain('Added, Unverified')
  })

  it('Add as phone sets the work phone for other and unknown numbers', async () => {
    const m = await open()
    revealPhoneApi.mockResolvedValueOnce(reply({ numbers: [{ e164: '+61390000000', type: 'other' }] }))
    await run()
    await click(button(host, 'Add as phone'))
    expect(m.store.S.contacts[0].phone).toBe('(03) 9000 0000')
    expect(m.store.S.contacts[0].mobile ?? '').toBe('')
  })

  it('never overwrites a non-empty number without a confirm', async () => {
    const m = await open({ contact: { mobile: '0400 000 000' } })
    revealPhoneApi.mockResolvedValueOnce(reply())
    await run()
    await click(button(host, 'Add as mobile'))
    expect(m.store.S.contacts[0].mobile).toBe('0400 000 000')
    const ask = lastModal(m)
    expect(ask.name).toBe('confirm')
    expect(String(ask.props.body)).toContain('0400 000 000')
    expect(String(ask.props.body)).toContain('0412 345 678')
    act(() => (ask.props.onConfirm as () => void)())
    expect(m.store.S.contacts[0].mobile).toBe('0412 345 678')
  })

  it('declining the confirm leaves the old number', async () => {
    const m = await open({ contact: { mobile: '0400 000 000' } })
    revealPhoneApi.mockResolvedValueOnce(reply())
    await run()
    await click(button(host, 'Add as mobile'))
    act(() => m.ui.UI.close())
    expect(m.store.S.contacts[0].mobile).toBe('0400 000 000')
    expect(m.store.S.contacts[0].enrichment?.mobile).toBeUndefined()
  })

  it('a number the contact already has is shown as already set and needs no action', async () => {
    const m = await open({ contact: { mobile: '+61 412 345 678' } })
    revealPhoneApi.mockResolvedValueOnce(reply())
    await run()
    expect(text()).toContain('Already set')
    expect(button(host, 'Add as mobile')).toBeUndefined()
    expect(m.store.S.contacts[0].mobile).toBe('+61 412 345 678')
  })

  it('does not apply if the viewer lost edit access after the lookup', async () => {
    const m = await open()
    revealPhoneApi.mockResolvedValueOnce(reply())
    await run()
    setRole(m, 'viewer')
    await click(button(host, 'Add as mobile'))
    expect(m.store.S.contacts[0].mobile ?? '').toBe('')
    expect(m.ui.UI.get().toasts.some(t => /edit access/.test(t.msg))).toBe(true)
  })

  it('records the activity and audit entry', async () => {
    const m = await open()
    revealPhoneApi.mockResolvedValueOnce(reply())
    await run()
    await click(button(host, 'Add as mobile'))
    expect(m.store.S.activities.some(a => a.subject === 'Contact enriched (phone lookup)')).toBe(true)
  })
})

describe('Act.applyPhoneLookup permissions', () => {
  it('refuses without edit access and changes nothing', async () => {
    const m = await open()
    setRole(m, 'viewer')
    expect(m.Act.applyPhoneLookup('ct1', 'ros', { field: 'mobile', value: '0412 345 678', source: 's' })).toBe(false)
    expect(m.store.S.contacts[0].mobile ?? '').toBe('')
  })
  it('refuses an empty number and an unknown contact', async () => {
    const m = await open()
    expect(m.Act.applyPhoneLookup('ct1', 'ros', { field: 'mobile', value: '  ', source: 's' })).toBe(false)
    expect(m.Act.applyPhoneLookup('nope', 'ros', { field: 'mobile', value: '0412 345 678', source: 's' })).toBe(false)
  })
})
