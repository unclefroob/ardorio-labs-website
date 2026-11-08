import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, settle } from '../../testing/dom'
import { salesWorld } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
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
})

const phone = (): void => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
}

async function show(page: 'company' | 'contact') {
  const m = await loadSales()
  m.bootstrap.hydrate(page === 'company' ? rosterioWorld() : salesWorld())
  setRole(m, 'sales')
  if (page === 'company') {
    const { Company } = await import('./Company')
    await act(async () => { root.render(<Company route={{ page: 'company', id: 'co1' }} />) })
  } else {
    const { Contact } = await import('./Contact')
    await act(async () => { root.render(<Contact route={{ page: 'contact', id: 'ct1' }} />) })
  }
  await settle(3)
  return m
}

const menuItem = (text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(b => b.textContent?.trim() === text)

describe('Company actions', () => {
  it('shows the full row on a desktop', async () => {
    await show('company')
    for (const l of ['Add contact', 'Create deal', 'Log call', 'Log meeting', 'Email', 'Task', 'Research', 'Research profile', 'Enrich contact', 'Find contacts', 'Add to list']) expect(button(host, l)).toBeDefined()
    expect(button(host, 'More')).toBeUndefined()
  })

  it('shows three buttons and a More menu on a phone', async () => {
    phone()
    const m = await show('company')
    for (const l of ['Log call', 'Create deal', 'Add contact']) expect(button(host, l)).toBeDefined()
    expect(button(host, 'Log meeting')).toBeUndefined()
    expect(button(host, 'Find contacts')).toBeUndefined()
    await click(button(host, 'More'))
    expect(menuItem('Log meeting')).toBeDefined()
    await click(menuItem('Find contacts'))
    const ms = m.ui.UI.get().modals
    expect(ms[ms.length - 1]).toMatchObject({ name: 'findPeople', props: { companyId: 'co1' } })
  })
})

describe('Contact actions', () => {
  it('shows the full row on a desktop', async () => {
    await show('contact')
    for (const l of ['Send email', 'Log call', 'Create task', 'Enrol in sequence', 'Enrich contact', 'Find mobile', 'Research contact', 'Create deal', 'LinkedIn']) expect(button(host, l)).toBeDefined()
    expect(button(host, 'More')).toBeUndefined()
  })

  it('shows three buttons and a More menu on a phone', async () => {
    phone()
    const m = await show('contact')
    for (const l of ['Send email', 'Log call', 'Create task']) expect(button(host, l)).toBeDefined()
    expect(button(host, 'Find mobile')).toBeUndefined()
    expect(button(host, 'LinkedIn')).toBeUndefined()
    await click(button(host, 'More'))
    expect(menuItem('Open profile')).toBeDefined()
    expect(menuItem('Enrol in sequence')).toBeDefined()
    await click(menuItem('Find mobile'))
    const ms = m.ui.UI.get().modals
    expect(ms[ms.length - 1]).toMatchObject({ name: 'findMobile', props: { contactId: 'ct1' } })
  })

  it('names the heading after the person only', async () => {
    await show('contact')
    expect(host.querySelector('h1')?.textContent).toContain('Sam Buyer')
    const h = host.querySelector('h1')
    const clone = h?.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[aria-hidden="true"]').forEach(e => e.remove())
    expect(clone.textContent?.trim()).toBe('Sam Buyer')
  })
})
