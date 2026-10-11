import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../../testing/fixtures'
import { button, click } from '../../../testing/dom'
import { loadSales, type Sales } from '../../../testing/load'
import { rosterioWorld, setRole } from '../../../testing/rosterioWorld'

vi.mock('../../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let m: Sales & { Act: typeof import('../../../data/Act').Act; UI: typeof import('../../../ui/store').UI; S: typeof import('../../../data/store').S }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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

const ANGLE = 'Lead with the rostering load of a 1,000-plus workforce.'
const ident = { name: 'Atlantic Group', website: 'atlanticgroup.com.au', note: 'Melbourne hospitality group.', ambiguous: true }

async function setup(role: 'sales' | 'viewer' = 'sales') {
  const l = await loadSales()
  const { Act } = await import('../../../data/Act')
  const { UI } = await import('../../../ui/store')
  const { S } = await import('../../../data/store')
  m = { ...l, Act, UI, S }
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, role)
}
const research = (over: Record<string, unknown> = {}) => ({
  id: 'rs9', companyId: 'co1', businessId: 'ros', ts: '2026-10-11T00:00:00.000Z', companyName: 'Acme', score: 40, overview: 'A group.',
  model: '', challenges: [], offerings: [], stakeholders: [], angle: ANGLE, facts: [], sources: [], inferred: [], identity: ident, provider: 'xai', ...over,
})
async function render(r: ReturnType<typeof research>, props: Record<string, unknown> = {}) {
  const { ResearchView } = await import('./ResearchView')
  await act(async () => { root.render(<ResearchView r={r as never} {...props} />) })
}

describe('ResearchView actions', () => {
  it('Yes, this is it saves who confirmed and swaps the buttons for a chip', async () => {
    await setup()
    m.Act.saveResearch(research() as never)
    await render(research())
    expect(host.textContent).toContain('Is this the right company?')
    await act(async () => { click(button(host, 'Yes, this is it')) })
    const saved = m.S.research.find(x => x.id === 'rs9')
    expect(typeof saved?.identityConfirmedAt).toBe('string')
    expect(saved?.identityConfirmedBy).toBe(m.S.session.userId)
    expect(host.textContent).toContain('Confirmed by')
    expect(host.textContent).not.toContain('Wrong company')
  })

  it('hides Yes for research that is not saved, and for someone who cannot edit', async () => {
    await setup()
    await render(research(), { saved: false })
    expect(host.textContent).toContain('Wrong company')
    expect(host.textContent).not.toContain('Yes, this is it')
    act(() => root.unmount())
    root = createRoot(host)
    setRole(m, 'viewer')
    m.Act.saveResearch(research({ id: 'rs10' }) as never)
    await render(research({ id: 'rs10' }))
    expect(host.textContent).not.toContain('Yes, this is it')
  })

  it('Wrong company tells the person what to do, calls back, and deletes nothing', async () => {
    await setup()
    m.Act.saveResearch(research() as never)
    const onWrong = vi.fn()
    await render(research(), { onWrongCompany: onWrong })
    await act(async () => { click(button(host, 'Wrong company')) })
    expect(onWrong).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('Add the company website, then research again.')
    expect(m.S.research.some(x => x.id === 'rs9')).toBe(true)
    const open = vi.spyOn(m.UI, 'open')
    await act(async () => { click(button(host, 'Edit company')) })
    expect(open).toHaveBeenCalledWith('editCompany', { id: 'co1' })
  })

  it('Draft email opens the composer for the first contact with the angle as the body', async () => {
    await setup()
    const open = vi.spyOn(m.UI, 'open')
    await render(research())
    const b = button(host, 'Draft email with this angle')
    expect(b?.disabled).toBe(false)
    await act(async () => { click(b) })
    expect(open).toHaveBeenCalledWith('compose', expect.objectContaining({ contactId: 'ct1', businessId: 'ros', body: ANGLE }))
  })

  it('Copy writes the angle to the clipboard, and says so when the clipboard refuses', async () => {
    await setup()
    const write = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: write } })
    const toast = vi.spyOn(m.UI, 'toast')
    await render(research())
    await act(async () => { click(button(host, 'Copy')) })
    expect(write).toHaveBeenCalledWith(ANGLE)
    expect(toast).toHaveBeenLastCalledWith('Copied', 'ok')
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('denied') }) } })
    await act(async () => { click(button(host, 'Copy')) })
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("Couldn't copy"), 'bad')
  })

  it('Add as note puts the angle on the company', async () => {
    await setup()
    await render(research())
    await act(async () => { click(button(host, 'Add as note')) })
    const notes = m.S.companies.find(c => c.id === 'co1')?.notes ?? []
    expect(notes[0]?.body).toBe('Outreach angle: ' + ANGLE)
  })

  it('the sources and business-model toggles open and close', async () => {
    await setup()
    const web = Array.from({ length: 7 }, (_, i) => ({ title: 'Page ' + (i + 1), url: `https://site${i + 1}.example/p` }))
    await render(research({ webSources: web, model: 'Venue hire.', identity: undefined }))
    await act(async () => { click(button(host, 'Show all 7 ▾')) })
    expect(host.textContent).toContain('Page 7')
    await act(async () => { click(button(host, 'Show fewer ▴')) })
    expect(host.textContent).not.toContain('Page 7')
    expect(host.textContent).not.toContain('Venue hire.')
    await act(async () => { click(button(host, 'Show business model ▾')) })
    expect(host.textContent).toContain('Venue hire.')
  })
})
