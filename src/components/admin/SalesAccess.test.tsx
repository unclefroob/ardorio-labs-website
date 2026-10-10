import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, field, settle, type } from '../../sales/testing/dom'
import type { MeDTO, SalesUserDTO } from '../../sales/api/contract'

vi.mock('../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getMe = vi.fn()
const getMembers = vi.fn()
const createMember = vi.fn()
const updateMember = vi.fn()
vi.mock('../../sales/api/me', () => ({ getMe: () => getMe() }))
vi.mock('../../sales/api/members', () => ({
  getMembers: () => getMembers(),
  createMember: (r: unknown) => createMember(r),
  updateMember: (id: string, r: unknown) => updateMember(id, r),
}))

import { SalesAccessModal } from './SalesAccess'
import { accessSummary, useSalesAccess } from './salesAccessState'

const perm = (admin: boolean) => ({ read: true, edit: admin, manage: admin, admin })
const me = (over: Partial<MeDTO> = {}): MeDTO => ({
  userId: 'me', username: 'me', displayName: 'Me', email: '', super: false, roles: {}, active: true, title: '', color: '#000000', meetingLink: '',
  permissions: { ard: perm(false), ros: perm(false), pth: perm(false), adv: perm(false) }, ...over,
})
const member = (over: Partial<SalesUserDTO> = {}): SalesUserDTO => ({
  id: 'u1', name: 'Una', title: '', email: '', super: false, m: {}, active: true, color: '#000000', meetingLink: '', createdAt: '', username: 'una', ...over,
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  getMe.mockReset(); getMembers.mockReset(); createMember.mockReset(); updateMember.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function Probe() {
  const a = useSalesAccess()
  return <div data-testid="s">{a.status}:{a.members.size}</div>
}
async function probe() {
  await act(async () => { root.render(<Probe />) })
  await settle(5)
  return host.textContent
}

describe('useSalesAccess', () => {
  it('is ready for a super admin and loads members', async () => {
    getMe.mockResolvedValue(me({ super: true }))
    getMembers.mockResolvedValue({ users: [member()] })
    expect(await probe()).toBe('ready:1')
  })
  it('is ready for an admin of one business', async () => {
    getMe.mockResolvedValue(me({ permissions: { ard: perm(false), ros: perm(true), pth: perm(false), adv: perm(false) } }))
    getMembers.mockResolvedValue({ users: [] })
    expect(await probe()).toBe('ready:0')
  })
  it('stays hidden for a non-admin member, and never loads members', async () => {
    getMe.mockResolvedValue(me())
    expect(await probe()).toBe('hidden:0')
    expect(getMembers).not.toHaveBeenCalled()
  })
  it('stays hidden when the login is not a SalesOS member at all', async () => {
    getMe.mockRejectedValue(new Error('NOT_A_MEMBER'))
    expect(await probe()).toBe('hidden:0')
  })
})

describe('accessSummary', () => {
  it('describes none, off, super and per-business roles', () => {
    expect(accessSummary(undefined)).toBe('Sales access: none')
    expect(accessSummary(member({ active: false }))).toBe('Sales access: switched off')
    expect(accessSummary(member({ super: true }))).toBe('Sales access: super admin')
    expect(accessSummary(member({ m: { ros: 'sales', ard: 'viewer' } }))).toBe('Sales access: Ardorio viewer, Rosterio sales')
  })
})

async function openModal(who: MeDTO, existing?: SalesUserDTO) {
  const upsert = vi.fn()
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const access = { status: 'ready' as const, me: who, members: new Map(existing ? [[existing.id, existing]] : []), upsert }
  await act(async () => { root.render(<SalesAccessModal userId="u1" name="Una" access={access} onClose={onClose} onSaved={onSaved} />) })
  return { upsert, onClose, onSaved }
}

describe('SalesAccessModal', () => {
  it('creates a member with only the chosen roles', async () => {
    const { upsert, onSaved, onClose } = await openModal(me({ super: true }))
    createMember.mockResolvedValue(member({ m: { ros: 'sales' } }))
    await type(field(host, 'Rosterio'), 'sales')
    await click(button(host, 'Save access'))
    await settle()
    expect(createMember).toHaveBeenCalledWith({ userId: 'u1', roles: { ros: 'sales' } })
    expect(upsert).toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith('Sales access updated for Una')
    expect(onClose).toHaveBeenCalled()
  })

  it('sends nothing when no access is chosen for someone with no record', async () => {
    const { onClose } = await openModal(me({ super: true }))
    await click(button(host, 'Save access'))
    expect(createMember).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('patches only what changed, and removes a role with null', async () => {
    await openModal(me({ super: true }), member({ m: { ros: 'sales', ard: 'viewer' } }))
    updateMember.mockResolvedValue(member({ m: { ard: 'viewer' } }))
    await type(field(host, 'Rosterio'), '')
    await click(button(host, 'Save access'))
    await settle()
    expect(updateMember).toHaveBeenCalledWith('u1', { roles: { ros: null } })
  })

  it('switches a member off (active=false) when every role is cleared', async () => {
    await openModal(me({ super: true }), member({ m: { ros: 'sales' } }))
    updateMember.mockResolvedValue(member({ active: false }))
    await type(field(host, 'Rosterio'), '')
    await click(button(host, 'Save access'))
    await settle()
    expect(updateMember).toHaveBeenCalledWith('u1', { roles: { ros: null }, active: false })
  })

  it('only offers the Super checkbox to super admins', async () => {
    await openModal(me({ permissions: { ard: perm(true), ros: perm(false), pth: perm(false), adv: perm(false) } }))
    expect(host.textContent).not.toContain('Super admin')
    expect(host.textContent).toContain('You can only change the businesses where you are an admin.')
    expect(field(host, 'Ardorio')?.disabled).toBe(false)
    expect(field(host, 'Rosterio')?.disabled).toBe(true)
  })

  it('shows the server error and stays open', async () => {
    const { onClose } = await openModal(me({ super: true }), member({ super: true }))
    updateMember.mockRejectedValue(new Error('Cannot remove the last super admin'))
    await click(host.querySelector('input[type="checkbox"]'))
    await click(button(host, 'Save access'))
    await settle()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('last super admin')
    expect(onClose).not.toHaveBeenCalled()
  })
})
