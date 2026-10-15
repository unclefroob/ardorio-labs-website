import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeqStep } from '../../../data/types'
import { button, click, settle } from '../../../testing/dom'
import { rec } from '../../../testing/fixtures'
import { loadSales } from '../../../testing/load'
import { rosterioWorld, setRole } from '../../../testing/rosterioWorld'

vi.mock('../../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let latest: SeqStep[] = []
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const email = (id: string, o: Partial<SeqStep> = {}): SeqStep => ({ id, type: 'email', delay: 0, unit: 'days', subject: 'Rostering for {{company_name}}', body: 'Hi', ...o })
const FLOW: SeqStep[] = [
  email('e0'),
  { id: 'c1', type: 'branch', cond: 'call_connected', delay: 3, unit: 'days', yes: [{ id: 'y0', type: 'call', delay: 0, unit: 'days', title: 'Call them' }], no: [email('n0', { reply: true, subject: '', body: 'Bump' })], afterYes: 'join', afterNo: 'end' },
]

let ui: Awaited<ReturnType<typeof loadSales>>['ui']
async function show(steps: SeqStep[] = FLOW, role: 'sales' | 'viewer' = 'sales') {
  const m = await loadSales()
  ui = m.ui
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, role)
  const { Builder } = await import('./Builder')
  const base = { id: 'sq1', name: 'S', businessId: 'ros', ownerId: 'u-me', createdBy: 'u-me', description: '', mailboxId: '', status: 'draft', shared: true, dailyLimit: 40, window: [9, 17] as [number, number], businessDays: true, exits: [], createdAt: '', updatedAt: '' }
  function Host() {
    const [st, setSt] = useState<SeqStep[]>(steps)
    const [sel, setSel] = useState<{ i: number; lane?: 'yes' | 'no'; j?: number }>({ i: 0 })
    latest = st
    return <Builder dr={{ ...base, steps: st }} upd={p => { if (p.steps) setSt(p.steps) }} sel={sel} setSel={setSel} can={role === 'sales'} />
  }
  await act(async () => { root.render(<Host />) })
  await settle(2)
}
const text = (): string => document.body.textContent ?? ''
const menuItem = (label: string): HTMLButtonElement | undefined => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menu"] button')].find(b => b.textContent?.trim().startsWith(label))

describe('the flow builder', () => {
  it('shows the always-on rules, the Check with both paths, and what happens after each', () => {
    return show().then(() => {
      expect(text()).toContain('Always on, for everyone in this sequence')
      expect(text()).toContain('A reply stops it')
      expect(text()).toContain('Was the call connected?')
      expect(host.querySelector('.flow-lanes')).not.toBeNull()
      expect(text()).toContain('then join back')
      expect(text()).toContain('then the sequence ends')
      expect(text()).toContain('Re: Rostering for {{company_name}}') // the follow-up on the No path shows the subject it will carry
    })
  })

  it('selecting a step on a path opens it in the editor, named by where it is', async () => {
    await show()
    await click([...host.querySelectorAll<HTMLButtonElement>('.flow-mini')].find(b => b.textContent?.includes('Call them')))
    expect(text()).toContain('Step 2 · Yes path 1: Call')
  })

  it('adds a step to a path from the menu, and never offers a Check there', async () => {
    await show()
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Add a step to the Yes path of step 2"]'))
    expect(menuItem('Check')).toBeUndefined()
    await click(menuItem('Task'))
    expect(latest[1].yes?.map(s => s.type)).toEqual(['call', 'task'])
  })

  it('a follow-up is offered only once an email comes before it', async () => {
    await show([])
    await click(button(host, 'Add the first email'))
    expect(latest).toHaveLength(1)
    expect(latest[0]).toMatchObject({ type: 'email', reply: false })
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Add a step at the end"]'))
    expect(menuItem('Follow-up email')?.disabled).toBe(false)
  })

  it('a new Check starts with two empty paths that join back', async () => {
    await show([email('e0')])
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Add a step at the end"]'))
    await click(menuItem('Check'))
    expect(latest[1]).toMatchObject({ type: 'branch', yes: [], no: [], afterYes: 'join', afterNo: 'join' })
    expect(text()).toContain('Nothing here: goes straight on')
  })

  it('the Check editor sets the question, and an "opened" question asks which email and warns about tracking', async () => {
    await show()
    await click([...host.querySelectorAll<HTMLButtonElement>('.flow-card')].find(b => b.textContent?.includes('Check')))
    const opened = [...host.querySelectorAll<HTMLLabelElement>('label')].find(l => l.textContent?.startsWith('Did they open an email?'))!.querySelector('input')!
    await click(opened)
    expect(latest[1].cond).toBe('opened')
    expect(text()).toContain('Which email')
    expect(text()).toContain('push mail towards spam')
    expect(text()).toContain('Replies are not a question here')
  })

  it('a follow-up email keeps the first email\'s subject, locked', async () => {
    await show()
    await click([...host.querySelectorAll<HTMLButtonElement>('.flow-mini')].find(b => b.textContent?.includes('Re:')))
    const subj = [...host.querySelectorAll<HTMLInputElement>('input')].find(i => i.value.startsWith('Re: '))
    expect(subj?.value).toBe('Re: Rostering for {{company_name}}')
    expect(subj?.disabled).toBe(true)
  })

  it('deleting a Check that has steps on its paths asks first', async () => {
    await show()
    await click([...host.querySelectorAll<HTMLButtonElement>('.flow-card')].find(b => b.textContent?.includes('Check')))
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Delete step"]'))
    expect(latest).toHaveLength(2) // nothing gone yet
    expect(JSON.stringify(ui.UI.get().modals.at(-1))).toContain('Delete this Check and its paths?')
  })

  it('a viewer sees the flow but no way to add or change it', async () => {
    await show(FLOW, 'viewer')
    expect(host.querySelector('.flow-add')).toBeNull()
    expect(host.querySelector('button[aria-label="Delete step"]')).toBeNull()
  })
})
