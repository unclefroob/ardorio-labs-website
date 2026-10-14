// Saving Log meeting with "Update stage" set: the meeting modal must close before the move, because the move can open
// its own modal (missing required fields, or Reopen deal?). Closing after it popped that modal instead, so the stage
// was never moved and a second Save created the action-item tasks again.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse, OpResult } from '../../api/contract'
import { appliedResult, changes, rec } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { invoicingWorld, setArdRole } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
// No AI service in tests: the deterministic local action items stand in for the model's.
vi.mock('../../ai/client', async orig => {
  const real = await orig<typeof import('../../ai/client')>()
  return { ...real, meetingActions: async (m: Parameters<typeof real.meetingActions>[0]) => ({ value: real.localAi.meetingActions(m), ai: { source: 'fallback', model: null } }) }
})

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const stages = [
  { id: 'sg1', name: 'Lead', prob: 10, required: [], won: false, lost: false },
  { id: 'sg2', name: 'Proposal', prob: 40, required: ['description'], won: false, lost: false },
  { id: 'sg3', name: 'Qualified', prob: 25, required: [], won: false, lost: false },
  { id: 'sgL', name: 'Lost', prob: 0, required: [], won: false, lost: true },
]

async function open(deal: Record<string, unknown> = {}) {
  m = await loadSales()
  const world = invoicingWorld({
    pipelines: [rec('pl1', { businessId: 'ard', name: 'P', recurring: false, lostReasons: [], forecast: [], card: [], stages, fields: [] })],
    contacts: [rec('ct1', { firstName: 'Sam', lastName: 'Lee', name: 'Sam Lee', title: 'COO', companyId: 'co1', email: 'sam@x.example', archived: false, notes: [] })],
  })
  const deals = world.collections.deals as Array<{ data: Record<string, unknown> }>
  Object.assign(deals[0].data, deal)
  m.bootstrap.hydrate(world)
  setArdRole(m, 'sales')
  vi.mocked(m.records.postBatch).mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => {
    const wire = JSON.parse(JSON.stringify(req)) as BatchRequest
    return {
      serverNow: new Date().toISOString(),
      results: wire.ops.map((op, i): OpResult => appliedResult(i, op.collection, op.id, 3, { ...m.plan.localData(op.collection, op.id), ...(op.op === 'delete' ? {} : op.set) })),
    }
  })
  m.ui.bindNavigate(vi.fn())
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('logMeeting', { dealId: 'dl1' }) })
  await settle()
}

const modals = (): string[] => m.ui.UI.get().modals.map(x => x.name)
const tasks = (): number => m.store.S.tasks.filter(t => t.source?.startsWith('Meeting action item')).length
const deal = () => m.store.S.deals.find(d => d.id === 'dl1')

/** Notes with one action item, generate, then pick the stage and save. */
async function saveWithStage(stageId: string): Promise<void> {
  await type(host.querySelector('textarea'), 'Send the pilot outline to Sam')
  await click(button(host, 'Generate action items'))
  await settle(10)
  await type(host.querySelector('[aria-label="New stage"]'), stageId)
  await click(button(host, 'Save meeting'))
  await settle(4)
}

describe('Log meeting with a stage change', () => {
  it('a stage with required fields: Log meeting closes, the required-fields check opens, tasks are made once', async () => {
    await open()
    await saveWithStage('sg2')
    expect(modals()).toEqual(['stageCheck'])
    expect(m.ui.UI.get().modals[0].props).toMatchObject({ id: 'dl1', stageId: 'sg2' })
    expect(tasks()).toBe(1)
    expect(m.store.S.meetings).toHaveLength(1)
  })

  it('a stage with nothing missing moves the deal and closes Log meeting', async () => {
    await open()
    await saveWithStage('sg3')
    expect(modals()).toEqual([])
    expect(deal()?.stageId).toBe('sg3')
    expect(tasks()).toBe(1)
  })

  it('a closed deal: Log meeting closes, Reopen deal? opens, and confirming reopens and moves it', async () => {
    await open({ status: 'lost', stageId: 'sgL', closedAt: '2026-10-05T09:00:00' })
    await saveWithStage('sg3')
    expect(modals()).toEqual(['confirm'])
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Reopen deal?')
    expect(tasks()).toBe(1)
    await click(button(host.querySelector('[role="dialog"]') as HTMLElement, 'Reopen'))
    await settle(4)
    expect(modals()).toEqual([])
    expect(deal()?.status).toBe('open')
    expect(deal()?.stageId).toBe('sg3')
    expect(tasks()).toBe(1)
  })
})
