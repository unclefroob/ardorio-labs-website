import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../../testing/fixtures'
import { button, click, settle } from '../../../testing/dom'
import { invoicingWorld, setArdRole } from '../../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../../testing/load'
import wizaCsv from './wiza-demo.fixture.csv?raw'

vi.mock('../../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

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
const biz = (id: string, name: string) => rec(id, { name, short: id.toUpperCase(), accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: 'pl1', industries: [], roles: [] })

async function open(over: Parameters<typeof invoicingWorld>[0] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld({ businesses: [biz('ard', 'Ardorio'), biz('ros', 'Rosterio')], companies: [], companyRels: [], deals: [], ...over }))
  setArdRole(m, 'admin', { ros: 'admin' })
  const { Importer } = await import('./Importer')
  await act(async () => { root.render(<Importer />) })
  await settle()
}

async function upload(csv = wizaCsv, name = 'WIZA_demo.csv') {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: [new File([csv], name, { type: 'text/csv' })], configurable: true })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  await settle(8)
}

const pickBusiness = async (name: string) => click([...host.querySelectorAll('.bizpick label')].find(l => l.textContent?.trim() === name)?.querySelector('input'))

async function toReview(businesses: string[] = ['Rosterio']) {
  for (const b of businesses) await pickBusiness(b)
  await upload()
  await click(button(host, 'Continue to column mapping'))
  await click(button(host, 'Continue to review'))
}

describe('Importer: Wiza CSV to companies and contacts', () => {
  it('lets more than one business be picked, and keeps Continue off until a file is chosen', async () => {
    await open()
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.bizpick input')]
    expect(boxes).toHaveLength(2)
    await pickBusiness('Rosterio')
    expect(boxes.map(b => b.checked)).toEqual([true, true])
    expect(button(host, 'Continue to column mapping')?.disabled).toBe(true)
  })

  it('asks for at least one business before mapping', async () => {
    await open()
    await upload()
    await pickBusiness('Ardorio')
    await click(button(host, 'Continue to column mapping'))
    expect(text()).toContain('Pick at least one business')
    expect(text()).not.toContain('Match the columns')
  })

  it('detects a Wiza export and maps Email to the email column, not email_type', async () => {
    await open()
    await upload()
    expect(text()).toContain('Wiza export detected')
    expect(text()).toContain('34 rows · 48 columns')
    await click(button(host, 'Continue to column mapping'))
    const select = host.querySelector<HTMLSelectElement>('#map-email')!
    expect(select.selectedOptions[0].textContent).toBe('email')
    expect(host.querySelector<HTMLSelectElement>('#map-mobile')!.value).toBe('')
    expect(text()).toContain('company_description looks like placeholder text')
  })

  it('reviews 32 companies for 34 contacts and asks for nothing before Import', async () => {
    await open()
    await toReview(['Rosterio'])
    expect(text()).toContain('Companies')
    const kpis = [...host.querySelectorAll('.kpi')].map(k => k.textContent ?? '')
    expect(kpis[0]).toContain('32')
    expect(kpis[0]).toContain('32 new')
    expect(kpis[1]).toContain('34')
    expect(text()).toContain('Company research is not run automatically')
    expect(button(host, /^Import 34 contacts to 2 businesses/)?.disabled).toBe(false)
    expect(m.store.S.companies).toHaveLength(0)
  })

  it('imports every company and contact once, under both businesses, with the CSV details', async () => {
    await open()
    await toReview(['Rosterio'])
    await click(button(host, /^Import 34 contacts to 2 businesses/))
    const { S } = m.store
    expect(S.companies).toHaveLength(32)
    expect(S.contacts).toHaveLength(34)
    expect(S.companyRels).toHaveLength(64)
    expect(S.contactRels).toHaveLength(68)
    expect(new Set(S.companyRels.map(r => r.businessId))).toEqual(new Set(['ard', 'ros']))
    const ingredion = S.companies.find(c => c.domain === 'ingredion.com')!
    expect(S.contacts.filter(c => c.companyId === ingredion.id).map(c => c.name).sort()).toEqual(['Karry Oneill', 'Otha Trevino'])
    expect(ingredion).toMatchObject({ name: 'Ingredion', industry: 'Information technology', subindustry: 'SaaS software', employees: 466, country: 'United States', hq: 'New York City', state: 'New York', description: '', type: 'Public company' })
    expect(ingredion.linkedin).toContain('linkedin.com/company/ingredion')
    expect(ingredion.tags).toContain('Imported')
    const conedison = S.contacts.find(c => c.email === 'alvarezf@conedison.com')!
    expect(conedison).toMatchObject({ firstName: 'Frederica', title: 'Executive Vice President', mobile: '', verification: 'Unverified', deliverability: 'Valid (Wiza)' })
    expect(conedison.linkedin).toContain('linkedin.com/in/frederica-alvarez')
    expect(text()).toContain('34 contacts are ready to prospect')
    expect(text()).toContain('Rosterio')
  })

  it('a second import of the same file creates nothing new', async () => {
    await open()
    await toReview(['Rosterio'])
    await click(button(host, /^Import 34 contacts to 2 businesses/))
    await click(button(host, 'Import another file'))
    await toReview([])
    const kpis = [...host.querySelectorAll('.kpi')].map(k => k.textContent ?? '')
    expect(kpis[0]).toContain('32 existing')
    expect(kpis[1]).toContain('34 already in the CRM')
    await click(button(host, /^Import 34 contacts/))
    const { S } = m.store
    expect(S.companies).toHaveLength(32)
    expect(S.contacts).toHaveLength(34)
    expect(S.companyRels).toHaveLength(64)
  })

  it('adds contacts to a company already in the CRM and gives it the second business', async () => {
    await open({
      companies: [rec('co_adobe', { name: 'Adobe Systems', tradingName: '', tags: [], tech: [], notes: [], industry: 'Software', subindustry: '', hq: '', state: '', domain: 'adobe.com', website: 'https://adobe.com', archived: false, employees: null, description: '', linkedin: '', country: '' })],
      companyRels: [rec('cr_adobe', { companyId: 'co_adobe', businessId: 'ard', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [] })],
    })
    await toReview(['Rosterio'])
    expect(text()).toContain('Existing company')
    await click(button(host, /^Import 34 contacts/))
    const { S } = m.store
    expect(S.companies).toHaveLength(32)
    const adobe = S.companies.find(c => c.id === 'co_adobe')!
    expect(adobe.industry).toBe('Software')
    expect(adobe.employees).toBe(428)
    expect(adobe.name).toBe('Adobe Systems')
    expect(S.contacts.find(c => c.email === 'burket@adobe.com')!.companyId).toBe('co_adobe')
    expect(S.companyRels.filter(r => r.companyId === 'co_adobe').map(r => r.businessId).sort()).toEqual(['ard', 'ros'])
  })

  it('will not import until a possible match has been decided', async () => {
    await open({
      companies: [rec('co_h', { name: 'Ingredion Holdings', tradingName: '', tags: [], tech: [], notes: [], industry: '', subindustry: '', hq: '', state: '', domain: 'ingredion.co.uk', website: 'https://ingredion.co.uk', archived: false, employees: null, description: '', linkedin: '', country: '' })],
      companyRels: [rec('cr_h', { companyId: 'co_h', businessId: 'ard', ownerId: 'u-me', status: 'Prospect', prospectStatus: '', source: '', priority: 'Medium', tags: [] })],
    })
    await toReview(['Rosterio'])
    expect(text()).toContain('Possible match')
    expect(button(host, /^Import 34 contacts/)?.disabled).toBe(true)
    expect(text()).toContain('Choose for Ingredion first')
    await click(button(host, 'Create new'))
    expect(button(host, /^Import 34 contacts/)?.disabled).toBe(false)
    await click(button(host, /^Import 34 contacts/))
    expect(m.store.S.companies).toHaveLength(33)
  })

  it('the mapping can be changed: choosing a mobile column fills the mobile number', async () => {
    const csv = wizaCsv.replace('email_type,', 'mobile_number,').split('\n').map((l, i) => (i === 0 || !l.trim() ? l : l.replace(',work,', ',0412 345 678,'))).join('\n')
    await open()
    await pickBusiness('Rosterio')
    await upload(csv, 'with-mobile.csv')
    await click(button(host, 'Continue to column mapping'))
    expect(host.querySelector<HTMLSelectElement>('#map-mobile')!.selectedOptions[0].textContent).toBe('mobile_number')
    await click(button(host, 'Continue to review'))
    await click(button(host, /^Import 34 contacts/))
    expect(m.store.S.contacts[0].mobile).toBe('0412 345 678')
  })
})
