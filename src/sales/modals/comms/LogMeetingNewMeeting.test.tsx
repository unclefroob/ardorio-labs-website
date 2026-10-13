// Saving a new meeting from the real Log meeting modal: it must get a string id, and the batch op must carry it
// (the server refuses an op without one, and the whole save was rolled back with "ops[0].id must be a string").
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

const wires: Record<string, unknown> = {}

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

const stages = [{ id: 'sg1', name: 'Lead', prob: 10, required: [], won: false, lost: false }]

async function open(label: string, props: Record<string, unknown>) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({
    pipelines: [rec('pl1', { businessId: 'ard', name: 'P', recurring: false, lostReasons: [], forecast: [], card: [], stages, fields: [] })],
    contacts: [rec('ct1', { firstName: 'Sam', lastName: 'Lee', name: 'Sam Lee', title: 'COO', companyId: 'co1', email: 'sam@x.example', archived: false, notes: [] })],
  }))
  setArdRole(m, 'sales')
  // Accept-all stub: records the exact wire request (JSON round trip drops undefined keys, as fetch does).
  vi.mocked(m.records.postBatch).mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => {
    const wire = JSON.parse(JSON.stringify(req)) as BatchRequest
    wires[label] = wire.ops
    return {
      serverNow: new Date().toISOString(),
      results: wire.ops.map((op, i): OpResult => appliedResult(i, op.collection, op.id, 3, { ...m.plan.localData(op.collection, op.id), ...(op.op === 'delete' ? {} : op.set) })),
    }
  })
  m.ui.bindNavigate(vi.fn())
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<Hosts />) })
  await act(async () => { m.ui.UI.open('logMeeting', props) })
  await settle()
}

describe('Log meeting / Schedule meeting from the Deal page ', () => {
  for (const [label, props] of [
    ['completed', { dealId: 'dl1' }],
    ['upcoming', { dealId: 'dl1', status: 'upcoming' }],
  ] as const) {
    it(`${label}: new meeting gets a string id and the batch op carries it`, async () => {
      await open(label, props)
      if ('status' in props) await type(host.querySelector('input[type="date"]'), new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10))
      await click(button(host, 'Save meeting'))
      await act(async () => { await m.sync.flushAll() })
      await settle(10)

      const ops = wires[label] as Array<{ collection: string; id?: unknown; set?: Record<string, unknown> }>
      const meetingOp = ops.find(o => o.collection === 'meetings')
      expect(typeof meetingOp?.id).toBe('string')
      const actOp = ops.find(o => o.collection === 'activities')
      expect(actOp?.set?.meetingId).toBe(meetingOp?.id)
      expect(m.store.S.meetings).toHaveLength(1)
      expect(typeof m.store.S.meetings[0].id).toBe('string')
    })
  }
})
