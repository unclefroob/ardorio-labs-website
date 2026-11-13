import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click, field, settle, type } from '../../testing/dom'
import { CLIENT, dto, invoicingWorld, setArdRole, SETTINGS } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { account, accountsOf, fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const SET = 'GET /sales/invoices/settings'
const CLIENTS = 'GET /sales/invoices/clients'
const GET1 = 'GET /sales/invoices/i1'
const PUT1 = 'PUT /sales/invoices/i1'
const LINKS1 = 'PUT /sales/invoices/i1/links'
const CREATE = 'POST /sales/invoices'
const DEAL_LIST = 'GET /sales/invoices?dealId=dl1'
const ACCOUNTS = 'GET /sales/rosterio/accounts'

const ACME = '65f0c0ffee0000000000abcd'
const BETA = '65f0c0ffee0000000000abce'
const LIST = accountsOf([account({ id: ACME, name: 'Acme Pty Ltd' }), account({ id: BETA, name: 'Beta Cafe Group' })])

const LABEL = 'Bills a Rosterio account'
const HELPER = 'Rosterio warns this account’s admins and pauses publishing if this invoice goes unpaid. Leave empty for anything that isn’t their Rosterio subscription.'

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

const text = (): string => host.textContent ?? ''
const picker = (): HTMLSelectElement => field(host, LABEL) as HTMLSelectElement
const fieldErr = (): string => picker().closest('.fld')?.querySelector('.err')?.textContent ?? ''

type Who = 'ros-admin' | 'ard-only' | 'ros-manager'
async function show(routes: Parameters<typeof fakeApi>[0], who: Who = 'ros-admin') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  if (who === 'ros-admin') setArdRole(m, 'admin', { ros: 'admin' })
  else if (who === 'ros-manager') setArdRole(m, 'admin', { ros: 'manager' })
  else setArdRole(m, 'admin')
  const api = fakeApi({ [SET]: () => json(200, SETTINGS), [CLIENTS]: () => json(200, { clients: [CLIENT] }), [DEAL_LIST]: () => json(200, { invoices: [] }), [ACCOUNTS]: () => json(200, LIST), ...routes })
  const { Invoice } = await import('./Invoice')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><Invoice route={{ page: 'invoice', id: 'i1' } as never} /><Hosts /></>) })
  await settle(10)
  return api
}
const bodyOf = (api: Awaited<ReturnType<typeof show>>, key: string): unknown => api.calls.find(c => `${c.method} ${c.path}` === key)?.body

const DRAFT = dto({ id: 'i1', status: 'draft', invoiceNumber: 'INV-0035', sentAt: null, issuedCount: 0 })
const SENT = dto({ id: 'i1' })

describe('the Rosterio account picker on a draft', () => {
  it('is labelled, explains itself, and lists the live Rosterio accounts with a way to clear it', async () => {
    await show({ [GET1]: () => json(200, DRAFT) })
    expect(text()).toContain(HELPER)
    expect([...picker().options].map(o => [o.value, o.textContent])).toEqual([['', 'None'], [ACME, 'Acme Pty Ltd'], [BETA, 'Beta Cafe Group']])
    expect(picker().value).toBe('')
  })

  it('sends the chosen account when the draft is saved', async () => {
    const api = await show({ [GET1]: () => json(200, DRAFT), [PUT1]: () => json(200, { ...DRAFT, rosterioAccountId: ACME }) })
    await type(picker(), ACME)
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(bodyOf(api, PUT1)).toMatchObject({ rosterioAccountId: ACME })
    expect(picker().value).toBe(ACME)
  })

  it('leaves the field out when it was not touched, so a save never asks for a role it may not have', async () => {
    const api = await show({ [GET1]: () => json(200, DRAFT), [PUT1]: () => json(200, DRAFT) })
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(bodyOf(api, PUT1)).not.toHaveProperty('rosterioAccountId')
  })

  it('clearing a stored account sends null', async () => {
    const api = await show({ [GET1]: () => json(200, { ...DRAFT, rosterioAccountId: ACME }), [PUT1]: () => json(200, DRAFT) })
    expect(picker().value).toBe(ACME)
    await type(picker(), '')
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(bodyOf(api, PUT1)).toMatchObject({ rosterioAccountId: null })
  })

  it('keeps the stored account as an option when it is not in the list', async () => {
    await show({ [GET1]: () => json(200, { ...DRAFT, rosterioAccountId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }) })
    expect(picker().value).toBe('aaaaaaaaaaaaaaaaaaaaaaaa')
  })

  it('shows the server’s refusal under the picker, in its own words', async () => {
    const msg = 'Only a Rosterio admin can link an invoice to a Rosterio account'
    await show({ [GET1]: () => json(200, DRAFT), [PUT1]: () => json(403, { error: msg, code: 'ROLE_REQUIRED', details: { needed: 'admin', businessId: 'ros' } }) })
    await type(picker(), ACME)
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(fieldErr()).toBe(msg)
    expect(host.querySelector('.banner.bad')).toBeNull()
  })

  it('shows a VALIDATION naming the field under the picker', async () => {
    await show({ [GET1]: () => json(200, DRAFT), [PUT1]: () => json(400, { error: 'rosterioAccountId must be a Rosterio account id', code: 'VALIDATION', details: { field: 'rosterioAccountId' } }) })
    await type(picker(), BETA)
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(fieldErr()).toBe('rosterioAccountId must be a Rosterio account id')
  })
})

describe('a new invoice', () => {
  it('has the picker, and creates without the field until one is chosen', async () => {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin', { ros: 'admin' })
    const api = fakeApi({ [SET]: () => json(200, SETTINGS), [CLIENTS]: () => json(200, { clients: [CLIENT] }), [ACCOUNTS]: () => json(200, LIST), [CREATE]: () => json(200, { ...DRAFT, id: 'n1' }), 'GET /sales/invoices/n1': () => json(200, DRAFT) })
    const { Invoice } = await import('./Invoice')
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<><Invoice route={{ page: 'invoice', id: 'new' } as never} /><Hosts /></>) })
    await settle(10)
    expect(picker()).not.toBeNull()
    await type(field(host, 'Customer (CRM company)'), 'co1')
    await type(host.querySelector('[aria-label="Description line 1"]'), 'Hosting')
    await type(host.querySelector('[aria-label="Unit price line 1"]'), '100')
    await type(picker(), BETA)
    await click(button(host, 'Save draft'))
    await settle(8)
    expect(bodyOf(api, CREATE)).toMatchObject({ rosterioAccountId: BETA })
  })
})

describe('an issued invoice', () => {
  it('changing only the account goes to the links route and never reissues', async () => {
    const api = await show({ [GET1]: () => json(200, SENT), [LINKS1]: () => json(200, { ...SENT, rosterioAccountId: ACME }) })
    await click(button(host, 'Edit and reissue'))
    await settle(8)
    await type(picker(), ACME)
    await click(button(host, 'Save changes'))
    await settle(8)
    expect(bodyOf(api, LINKS1)).toEqual({ rosterioAccountId: ACME })
    expect(api.count(PUT1)).toBe(0)
  })

  it('shows a refusal from the links route under the picker', async () => {
    const msg = 'Only a Rosterio admin can link an invoice to a Rosterio account'
    await show({ [GET1]: () => json(200, SENT), [LINKS1]: () => json(403, { error: msg, code: 'ROLE_REQUIRED', details: { needed: 'admin', businessId: 'ros' } }) })
    await click(button(host, 'Edit and reissue'))
    await settle(8)
    await type(picker(), ACME)
    await click(button(host, 'Save changes'))
    await settle(8)
    expect(fieldErr()).toBe(msg)
  })
})

describe('a paid invoice', () => {
  const PAID = dto({ id: 'i1', status: 'paid', payment: { method: 'bank-transfer', paidAt: '2026-10-20', amountCents: 1980000, reference: 'x' } })

  it('can have its account set with Edit links, through the links route', async () => {
    const api = await show({ [GET1]: () => json(200, PAID), [LINKS1]: () => json(200, { ...PAID, rosterioAccountId: BETA }) })
    await click(button(host, 'Edit links'))
    await settle(6)
    await type(picker(), BETA)
    await click(button(host, 'Save links'))
    await settle(8)
    expect(bodyOf(api, LINKS1)).toEqual({ rosterioAccountId: BETA })
  })
})

describe('someone who is not a Rosterio admin', () => {
  it('sees no picker on a draft with no account', async () => {
    await show({ [GET1]: () => json(200, DRAFT) }, 'ard-only')
    expect(field(host, LABEL)).toBeNull()
    expect(text()).not.toContain(HELPER)
  })

  it('sees the linked account’s name, read-only, and no accounts are requested when they are not in Rosterio', async () => {
    const api = await show({ [GET1]: () => json(200, { ...DRAFT, rosterioAccountId: ACME }) }, 'ard-only')
    expect(field(host, LABEL)).toBeNull()
    expect(text()).toContain(LABEL)
    expect(text()).toContain('A Rosterio account')
    expect(api.count(ACCOUNTS)).toBe(0)
  })

  it('a Rosterio manager who is not an admin sees the name but cannot change it', async () => {
    await show({ [GET1]: () => json(200, { ...DRAFT, rosterioAccountId: ACME }) }, 'ros-manager')
    expect(field(host, LABEL)).toBeNull()
    expect(text()).toContain('Acme Pty Ltd')
  })
})

describe('the invoice view', () => {
  it('says which Rosterio account a sent invoice bills', async () => {
    await show({ [GET1]: () => json(200, { ...SENT, rosterioAccountId: ACME }) })
    expect(text()).toContain('Bills the Rosterio account Acme Pty Ltd. Rosterio warns its admins if this goes unpaid.')
  })

  it('says nothing about Rosterio when no account is linked', async () => {
    await show({ [GET1]: () => json(200, SENT) })
    expect(text()).not.toContain('Bills the Rosterio account')
  })

  it('does not promise a warning once the invoice is paid', async () => {
    const PAID = dto({ id: 'i1', status: 'paid', rosterioAccountId: ACME, payment: { method: 'card', paidAt: '2026-10-20', amountCents: 1980000, reference: 'x' } })
    await show({ [GET1]: () => json(200, PAID) })
    expect(text()).toContain('Bills the Rosterio account Acme Pty Ltd.')
    expect(text()).not.toContain('warns its admins')
  })
})
