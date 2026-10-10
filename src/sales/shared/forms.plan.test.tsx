import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSales } from '../testing/load'
import { rosterioWorld } from '../testing/rosterioWorld'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })

describe('Plan field on Rosterio deals', () => {
  it('offers Starter, Pro and Enterprise but stores starter, pro and enterprise', async () => {
    const m = await loadSales()
    m.bootstrap.hydrate(rosterioWorld())
    const { DealFieldInput } = await import('./forms')
    const fd = m.store.S.pipelines[0].fields.find(f => f.key === 'plan')
    if (!fd) throw new Error('the Rosterio pipeline has no plan field')
    const picked: unknown[] = []
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<DealFieldInput fd={fd} value="pro" onChange={v => picked.push(v)} companyId="co1" />) })
    const sel = host.querySelector('select') as HTMLSelectElement
    expect([...sel.options].filter(o => o.value).map(o => [o.value, o.textContent])).toEqual([['starter', 'Starter'], ['pro', 'Pro'], ['enterprise', 'Enterprise']])
    expect(sel.value).toBe('pro')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(sel, 'enterprise')
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(picked).toEqual(['enterprise'])
    act(() => root.unmount())
  })
})
