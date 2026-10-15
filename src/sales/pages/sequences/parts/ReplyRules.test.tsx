import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, settle } from '../../../testing/dom'
import { loadSales } from '../../../testing/load'
import { rosterioWorld, setRole } from '../../../testing/rosterioWorld'
import type { Draft } from './conds'

vi.mock('../../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let latest: Draft
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

async function show(o: { replyRules?: Draft['replyRules']; role?: 'sales' | 'viewer' } = {}) {
  const m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, o.role ?? 'sales')
  const { SeqSettings } = await import('./SeqSettings')
  const base: Draft = { id: 'sq1', name: 'S', businessId: 'ros', ownerId: 'u-me', createdBy: 'u-me', description: '', mailboxId: '', status: 'draft', shared: true, dailyLimit: 40, window: [9, 17], businessDays: true, exits: [], steps: [], createdAt: '', updatedAt: '', ...(o.replyRules ? { replyRules: o.replyRules } : {}) }
  latest = base
  function Host() {
    const [dr, setDr] = useState<Draft>(base)
    return <SeqSettings dr={dr} s={dr} can={(o.role ?? 'sales') === 'sales'} upd={p => { const n = { ...dr, ...p }; latest = n; setDr(n) }} />
  }
  await act(async () => { root.render(<Host />) })
  await settle(2)
}
const sel = (label: string): HTMLSelectElement => host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
const pick = async (label: string, value: string) => { const s = sel(label); await act(async () => { s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })) }) }
const text = (): string => host.textContent ?? ''

describe('When they reply', () => {
  it('shows the business defaults, read-only, with unsubscribe and bounce locked', async () => {
    await show()
    expect(text()).toContain('Every reply stops this sequence for that person')
    expect(sel('Then, for Interested').disabled).toBe(true)
    expect(sel('Then, for Interested').value).toBe('task')
    expect(sel('Start again, for Not right now').value).toBe('60')
    expect(text()).toContain('Opt-outs are never optional')
  })

  it('changing them for this sequence makes them editable and saves only this sequence\'s rule', async () => {
    await show()
    await click([...host.querySelectorAll<HTMLElement>('button, [role="radio"]')].find(b => b.textContent === 'Changed for this sequence'))
    expect(sel('Then, for Interested').disabled).toBe(false)
    await pick('Then, for Interested', 'nothing')
    expect(latest.replyRules).toEqual({ interested: expect.objectContaining({ then: 'nothing' }) })
  })

  it('out of office can only carry on or end', async () => {
    await show({ replyRules: {} })
    expect([...sel('Then, for out of office').options].map(o => o.value)).toEqual(['continue', 'end'])
  })

  it('going back to the defaults drops this sequence\'s changes', async () => {
    await show({ replyRules: { no: { then: 'task' } } })
    await click([...host.querySelectorAll<HTMLElement>('button, [role="radio"]')].find(b => b.textContent === 'Rosterio defaults'))
    expect(latest.replyRules).toBeUndefined()
  })

  it('a viewer cannot change anything', async () => {
    await show({ replyRules: {}, role: 'viewer' })
    expect(sel('Then, for Interested').disabled).toBe(true)
  })
})
