import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeqStep } from '../../../data/types'
import type { Draft } from './conds'
import { settle } from '../../../testing/dom'
import { rec } from '../../../testing/fixtures'
import { loadSales, type Sales } from '../../../testing/load'
import { rosterioWorld, setRole } from '../../../testing/rosterioWorld'

// Whether a sequence's variables can be filled is shown where it is written: typos are errors that stop it starting, and steps
// that will hold enrolled contacts for missing data say how many, before anyone is held.

vi.mock('../../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

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
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const email = (id: string, o: Partial<SeqStep> = {}): SeqStep => ({ id, type: 'email', delay: 0, unit: 'days', subject: 'For {{company_name}}', body: 'Hi {{first_name}}', ...o })
const BASE: Omit<Draft, 'steps'> = { id: 'sq1', name: 'S', businessId: 'ros', ownerId: 'u-me', createdBy: 'u-me', description: '', mailboxId: '', status: 'draft', shared: true, dailyLimit: 40, window: [9, 17] as [number, number], businessDays: true, exits: [], createdAt: '', updatedAt: '' }

/** The world with Jo (has a job title) and Max (none) both enrolled in sq1. */
async function world(seqSteps?: SeqStep[]) {
  m = await loadSales()
  const w = rosterioWorld()
  w.collections.contacts.push(rec('ct2', { firstName: 'Max', lastName: 'Ng', name: 'Max Ng', title: '', companyId: 'co1', email: 'max@acme.test', email2: '', phone: '', mobile: '', notes: [], verification: 'Verified' }))
  w.collections.contactRels = [...(w.collections.contactRels ?? []), rec('kr1', { contactId: 'ct1', businessId: 'ros' }), rec('kr2', { contactId: 'ct2', businessId: 'ros' })]
  const en = (id: string, ct: string, o = {}) => rec(id, { seqId: 'sq1', contactId: ct, businessId: 'ros', ownerId: 'u-me', mailboxId: '', status: 'active', stepIdx: 0, nextDue: null, startedAt: '2026-10-09T09:00', threadId: null, history: [], reason: '', ...o })
  w.collections.enrolments = [en('en1', 'ct1'), en('en2', 'ct2', { status: 'paused', pauseReason: 'Held: missing {{job_title}}', reason: 'Held: missing {{job_title}}' })]
  if (seqSteps) w.collections.sequences = [rec('sq1', { ...BASE, steps: seqSteps, status: 'active', mailboxId: 'mb1' })]
  w.collections.mailboxes = [rec('mb1', { address: 'me@example.com', name: 'Me', type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: true })]
  m.bootstrap.hydrate(w)
  setRole(m, 'sales')
}

async function builder(steps: SeqStep[]) {
  await world()
  const { Builder } = await import('./Builder')
  function Host() {
    const [st, setSt] = useState<SeqStep[]>(steps)
    const [sel, setSel] = useState<{ i: number }>({ i: 0 })
    return <Builder dr={{ ...BASE, steps: st }} upd={p => { if (p.steps) setSt(p.steps) }} sel={sel} setSel={setSel} can />
  }
  await act(async () => { root.render(<Host />) })
  await settle(2)
}
const text = (): string => host.textContent ?? ''

describe('in the builder', () => {
  it('a step that will hold enrolled contacts says how many, and its chip turns amber; a fallback clears it', async () => {
    await builder([email('e0', { subject: 'For {{job_title}}' })])
    expect(text()).toContain('1 missing data')
    const chip = [...host.querySelectorAll<HTMLElement>('.tok')].find(c => c.textContent === 'Job title')!
    expect(chip.className).toContain('tok-warn')
    expect(chip.title).toContain('1 of 2 enrolled contacts have no job title')
    expect(text()).toContain('1 of 2 enrolled have no job title')

    act(() => root.unmount())
    root = createRoot(host)
    await builder([email('e0', { subject: 'For {{job_title|your team}}' })])
    expect(text()).not.toContain('missing data')
  })

  it('a misspelt variable is marked on the card and in the editor, with what was probably meant', async () => {
    await builder([email('e0', { body: 'Hi {{firstname}}' })])
    expect(text()).toContain('Unknown variable')
    expect(text()).toContain('{{firstname}} (did you mean First name?)')
    expect(host.querySelector('.tok-bad')?.textContent).toBe('firstname')
  })
})

describe('starting a sequence', () => {
  it('is blocked by an unknown variable anywhere, paths included', async () => {
    await world()
    const { flowIssues } = await import('../../../shared/seqFlow')
    const check: SeqStep = { id: 'c1', type: 'branch', cond: 'call_connected', delay: 1, unit: 'days', yes: [{ id: 'y0', type: 'call', delay: 0, unit: 'days', title: 'Call {{frist_name}}' }], no: [], afterYes: 'join', afterNo: 'join' }
    const issues = flowIssues([email('e0'), check]).filter(i => i.blocks)
    expect(issues.map(i => i.text)).toEqual(['Step 2, Yes path, step 1 uses a variable that does not exist: {{frist_name}} (did you mean First name?)'])
  })
})

describe('enrolling', () => {
  it('checks every email step for the contact, not just the first', async () => {
    await world([email('e0'), { id: 'w', type: 'wait', delay: 2, unit: 'days' } as SeqStep, email('e2', { reply: true, subject: '', body: 'As {{job_title}}…' })])
    const { Q } = await import('../../../data/Q')
    expect(Q.eligibility('ct2', 'sq1').warns.join(' ')).toContain('No job title for this contact: step 3 will be held until it is filled in')
    expect(Q.eligibility('ct1', 'sq1').warns.join(' ')).not.toContain('will be held')
  })
})

describe('the enrolments list', () => {
  it('names who is held for missing data, in words, with the way out', async () => {
    await world([email('e0', { body: '{{job_title}}' })])
    const s = m.store.S.sequences[0]
    const { SeqEnrolments } = await import('./SeqEnrolments')
    const { seqStats } = await import('../../../shared/seqStats')
    await act(async () => { root.render(<SeqEnrolments s={s} st={seqStats(s)} />) })
    await settle(2)
    expect(text()).toContain('1 held for missing data')
    expect(text()).toContain('Max Ng: missing job title')
    expect(text()).toContain('give the variable a fallback in the step')
  })
})
