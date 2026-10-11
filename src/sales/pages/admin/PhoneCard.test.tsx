import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhoneStatusResponse } from '../../api/contract'
import { settle } from '../../testing/dom'
import { salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'
import { setRole } from '../../testing/rosterioWorld'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const phoneStatusApi = vi.fn<(signal?: AbortSignal) => Promise<PhoneStatusResponse>>()
const aiEnrichUsage = vi.fn()
vi.mock('../../api/phone', () => ({ phoneStatusApi: (s?: AbortSignal) => phoneStatusApi(s), revealPhoneApi: vi.fn() }))
vi.mock('../../api/ai', async orig => ({ ...(await orig<object>()), aiEnrichUsage: (...a: unknown[]) => aiEnrichUsage(...a), aiEnrichLog: vi.fn(async () => ({ entries: [] })) }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  phoneStatusApi.mockReset()
  aiEnrichUsage.mockReset()
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage: { used: 1, limit: 300, resetsOn: '2099-11-01' } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function show(status: PhoneStatusResponse | Error, role: 'admin' | 'sales' = 'admin') {
  if (status instanceof Error) phoneStatusApi.mockRejectedValue(status)
  else phoneStatusApi.mockResolvedValue(status)
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld())
  setRole(m, role)
  const { Integrations } = await import('./Integrations')
  await act(async () => { root.render(<Integrations />) })
  await settle(5)
}
const text = (): string => host.textContent ?? ''

describe('Phone lookup card on the Integrations page', () => {
  it('admin sees configured, the vendor label and lookups used this month', async () => {
    await show({ configured: true, provider: 'leadmagic', label: 'LeadMagic', usage: { used: 12, limit: 100, resetsOn: '2099-11-01' } })
    expect(text()).toContain('Phone lookup')
    expect(text()).toContain('Configured')
    expect(text()).toContain('LeadMagic')
    expect(text()).toContain('12/100')
    expect(text()).toContain('resets 1 Nov')
  })

  it('admin sees not configured without any vendor or key details', async () => {
    await show({ configured: false, usage: { used: 0, limit: 0, resetsOn: '2099-11-01' } })
    const card = [...host.querySelectorAll('.card')].find(c => c.textContent?.includes('Phone lookup'))
    expect(card?.textContent).toContain('Not configured')
    expect(card?.textContent).toContain("Phone lookup isn't set up. An admin needs to choose a provider on the server.")
    expect(card?.textContent).not.toMatch(/key|leadmagic|signalhire|wiza/i)
  })

  it('says when the status is unavailable', async () => {
    await show(new Error('down'))
    expect(text()).toContain('Status unavailable right now.')
  })

  it('is for admins: a sales user does not see it and makes no status call', async () => {
    await show({ configured: true, label: 'LeadMagic', usage: { used: 1, limit: 100, resetsOn: '2099-11-01' } }, 'sales')
    expect(text()).not.toContain('Provider:')
    expect(phoneStatusApi).not.toHaveBeenCalled()
  })
})
