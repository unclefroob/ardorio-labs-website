import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterioBilling } from '../../api/contract'
import { changes } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

// Starting Spuntino's Stripe billing from its Rosterio card: A$400 a month flat, + GST, from a chosen day.

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const api = { rosterioBilling: vi.fn(), rosterioBillingStart: vi.fn(), rosterioBillingStop: vi.fn(), rosterioCardLink: vi.fn() }
vi.mock('../../api/rosterio', async orig => ({
  ...(await orig<object>()),
  rosterioBilling: (...a: unknown[]) => api.rosterioBilling(...a),
  rosterioBillingStart: (...a: unknown[]) => api.rosterioBillingStart(...a),
  rosterioBillingStop: (...a: unknown[]) => api.rosterioBillingStop(...a),
  rosterioCardLink: (...a: unknown[]) => api.rosterioCardLink(...a),
}))

const view = (o: Partial<RosterioBilling> = {}): RosterioBilling => ({
  accountId: '65f0c0ffee0000000000abcd', accountName: 'Spuntino', timezone: 'Australia/Sydney', today: '2026-10-17', billingEmail: 'accounts@spuntino.test',
  terms: { billingModel: 'flat', amountCents: 40000, interval: 'monthly', effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: null, contractReference: 'SPU-MSA', status: 'active' },
  amounts: { quantity: 1, unitAmountCents: 40000, subtotalCents: 40000, gstCents: 4000, totalCents: 44000, gstPercent: 10, interval: 'monthly' },
  billing: null, canStart: true, cannotStartReason: null, ...o,
})
const billed = (state: NonNullable<RosterioBilling['billing']>['state'], o: Partial<NonNullable<RosterioBilling['billing']>> = {}): RosterioBilling => view({
  canStart: false, cannotStartReason: 'Billing is already set up for this account.',
  billing: { state, collection: 'send_invoice', firstBillingDate: '2026-11-01', daysUntilDue: 14, billingEmail: 'accounts@spuntino.test', startedAt: '2026-10-17T00:00:00.000Z',
    stoppedAt: null, cardUrl: null, cardSavedAt: null, lastError: null, subscriptionStatus: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, ...o },
})

let host: HTMLDivElement
let root: Root
let m: Sales
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const f of Object.values(api)) f.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function open() {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, 'admin')
  const { StartRosterioBilling } = await import('./StartRosterioBilling')
  await act(async () => { root.render(<StartRosterioBilling companyId="co1" />) })
  await settle(3)
}
const text = (): string => document.body.textContent ?? ''
const seg = (name: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>('.seg button')].find(b => b.textContent === name)!

describe('Start billing', () => {
  it('shows the bill and what Stripe will do, then starts it as chosen', async () => {
    api.rosterioBilling.mockResolvedValue(view())
    api.rosterioBillingStart.mockResolvedValue({ billing: billed('scheduled') })
    await open()
    expect(text()).toContain("Spuntino's terms · SPU-MSA")
    expect(text()).toContain('A$400.00 a month, flat + 10% GST = A$440.00 a month')
    expect(text()).toContain('No end date: billed until stopped.')
    // The 1st of next month is the default.
    expect(text()).toContain('Stripe will email accounts@spuntino.test an invoice for A$440.00 (A$400.00 + A$40.00 GST) a month, from 1 Nov 2026, due in 14 days.')
    await click(button(document.body, /^Start billing$/))
    await settle(3)
    expect(api.rosterioBillingStart).toHaveBeenCalledWith({ companyId: 'co1', collection: 'send_invoice', firstBillingDate: '2026-11-01', daysUntilDue: 14, billingEmail: 'accounts@spuntino.test' })
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Billing starts 1 Nov 2026')
  })

  it('card on file: says nothing is charged until a card is added, then shows the link to send', async () => {
    api.rosterioBilling.mockResolvedValue(view())
    api.rosterioBillingStart.mockResolvedValue({ cardEmailSent: false, billing: billed('awaiting_card', { collection: 'charge_automatically', cardUrl: 'https://api.rosterio.test/api/billing/card/abc' }) })
    await open()
    await click(seg('Card on file'))
    await click(seg('Today'))
    expect(text()).toContain('to a card on file, from 17 Oct 2026')
    expect(text()).toContain('nothing is charged until they do')
    await click(button(document.body, /^Start billing$/))
    await settle(3)
    expect(api.rosterioBillingStart).toHaveBeenCalledWith({ companyId: 'co1', collection: 'charge_automatically', firstBillingDate: '2026-10-17', billingEmail: 'accounts@spuntino.test' })
    expect(text()).toContain('could not be sent. Send them this link yourself')
    expect((document.querySelector('input[aria-label="Card link"]') as HTMLInputElement).value).toBe('https://api.rosterio.test/api/billing/card/abc')
  })

  it('cannot be started when Rosterio says so, and shows Rosterio\'s field errors', async () => {
    api.rosterioBilling.mockResolvedValue(view({ canStart: false, cannotStartReason: 'The contract terms have ended.' }))
    await open()
    expect(text()).toContain('The contract terms have ended.')
    expect(button(document.body, /^Start billing$/)?.disabled).toBe(true)

    act(() => root.unmount())
    root = createRoot(host)
    api.rosterioBilling.mockResolvedValue(view())
    // Made when called, from the module the window itself uses (each open() loads the app afresh).
    api.rosterioBillingStart.mockImplementation(async () => {
      const { SalesHttpError } = await import('../../api/http')
      throw new SalesHttpError(400, { error: 'Billing could not be started', code: 'VALIDATION', details: { errors: { billingEmail: 'A billing email is required' } } })
    })
    await open()
    await click(button(document.body, /^Start billing$/))
    await settle(3)
    expect(text()).toContain('A billing email is required')
    expect(text()).toContain('Billing could not be started')
  })
})
