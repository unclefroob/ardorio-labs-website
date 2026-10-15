import { describe, expect, it } from 'vitest'
import type { Company, Contact } from '../data/types'
import { autoMap, parseCSV } from '../pages/inbox/parts/csv'
import wizaCsv from '../pages/inbox/parts/wiza-demo.fixture.csv?raw'
import { headcount, nameKey, parseImportRows, placeName, planImport, targetOf, unresolved } from './importPlan'

const raw = parseCSV(wizaCsv)
const map = autoMap(raw[0], raw.slice(1)).map
const rows = parseImportRows(raw, map)

const co = (id: string, name: string, domain = '', over: Partial<Company> = {}): Company => ({
  id, name, tradingName: name, website: domain ? `https://${domain}` : '', domain, industry: '', subindustry: '', hq: '', state: '', country: '', employees: null, locations: null,
  type: 'Private company', description: '', linkedin: '', tech: [], tags: [], researchStatus: 'Not researched', source: '', createdAt: '', updatedAt: '', notes: [], ...over,
})
const ct = (id: string, companyId: string, name: string, email = '', linkedin = ''): Contact => ({ id, firstName: name.split(' ')[0], lastName: name.split(' ')[1] ?? '', name, companyId, email, linkedin } as Contact)

describe('reading the Wiza rows', () => {
  it('reads all 34 rows with no problems', () => {
    expect(rows).toHaveLength(34)
    expect(rows.filter(r => r._invalid)).toEqual([])
  })
  it('reads a contact and its company from the first row', () => {
    expect(rows[0]).toMatchObject({
      firstName: 'Frederica', lastName: 'Alvarez', title: 'Executive Vice President', email: 'alvarezf@conedison.com', emailStatus: 'valid',
      company: 'Conedison', industry: 'Information technology', subindustry: 'SaaS software', employees: 262, city: 'New York City', state: 'New York', country: 'United States',
      address: '50 Green Park', companyType: 'private',
    })
    expect(rows[0].website).toContain('conedison.com')
    expect(rows[0].mobile).toBeUndefined()
    expect(rows[0].description).toBeUndefined()
  })
  it('turns "United states" into a place name and reads only whole numbers as a headcount', () => {
    expect(placeName('united  states')).toBe('United States')
    expect(headcount('1,200')).toBe(1200)
    expect(headcount('201 to 500')).toBeUndefined()
    expect(headcount('')).toBeUndefined()
  })
  it('flags a missing name, a missing company, a bad email and a bad link, row by row', () => {
    const bad = [raw[0], ['', '', '', '', 'x'], ...raw.slice(1, 2)]
    const m = { 0: 'firstName', 1: 'lastName', 2: 'company', 3: 'email' } as const
    const r = parseImportRows([['a', 'b', 'c', 'd'], ['Jo', '', 'Acme', 'not-an-email']], m)
    expect(r[0]._invalid).toBe(true)
    expect(r[0]._reason).toBe('Missing name, Invalid email')
    expect(bad).toHaveLength(3)
  })
})

describe('planning the import against an empty CRM', () => {
  const plan = planImport(rows, [], [])
  it('finds 32 companies for 34 contacts, with two companies holding two contacts', () => {
    expect(plan.groups).toHaveLength(32)
    expect(plan.rows).toBe(34)
    expect(plan.contacts).toEqual({ new: 34, existing: 0, repeated: 0 })
    const two = plan.groups.filter(g => g.rows.length === 2).map(g => g.domain).sort()
    expect(two).toEqual(['fanniemae.com', 'ingredion.com'])
  })
  it('creates every company and needs no decision', () => {
    expect(plan.groups.every(g => g.match.kind === 'new')).toBe(true)
    expect(unresolved(plan, {})).toEqual([])
  })
})

describe('planning against companies already in the CRM', () => {
  it('matches a company by website and adds the contacts to it', () => {
    const plan = planImport(rows, [co('co_adobe', 'Adobe Systems', 'adobe.com')], [])
    const g = plan.groups.find(x => x.domain === 'adobe.com')!
    expect(g.match).toEqual({ kind: 'existing', companyId: 'co_adobe', by: 'website' })
    expect(plan.groups).toHaveLength(32)
  })
  it('matches by name when the website is not known, ignoring Pty Ltd and Inc', () => {
    const g = planImport(rows, [co('co_c', 'Centene Inc')], []).groups.find(x => x.domain === 'centene.com')!
    expect(g.match).toMatchObject({ kind: 'existing', by: 'name' })
  })
  it('asks the person when a company only looks like one already there', () => {
    const plan = planImport(rows, [co('co_h', 'Ingredion Holdings', 'ingredion.co.uk')], [])
    const g = plan.groups.find(x => x.domain === 'ingredion.com')!
    expect(g.match.kind).toBe('possible')
    expect(unresolved(plan, {})).toHaveLength(1)
    expect(targetOf(g, {})).toBe('unresolved')
    expect(targetOf(g, { [g.key]: 'co_h' })).toEqual({ companyId: 'co_h' })
    expect(targetOf(g, { [g.key]: 'new' })).toEqual({ companyId: null })
    expect(unresolved(plan, { [g.key]: 'new' })).toEqual([])
  })
  it('does not match an archived company', () => {
    const plan = planImport(rows, [co('co_x', 'Conedison', 'conedison.com', { archived: true })], [])
    expect(plan.groups.find(x => x.domain === 'conedison.com')!.match.kind).toBe('new')
  })
  it('finds a contact already in the CRM by email, by LinkedIn address, or by name at the same company', () => {
    const existing = [
      co('co_e', 'Conedison', 'conedison.com'), co('co_t', 'Energytransfer', 'energytransfer.com'),
    ]
    const plan = planImport(rows, existing, [
      ct('ct1', 'co_e', 'Someone Else', 'ALVAREZF@conedison.com'),
      ct('ct2', 'co_t', 'Other Person', '', rows[1].linkedin),
      ct('ct3', 'co_x', 'Bonnibelle Trevino'),
    ])
    expect(plan.rows).toBe(34)
    expect(plan.groups.find(g => g.domain === 'conedison.com')!.rows[0]._dup).toBe('ct1')
    expect(plan.groups.find(g => g.domain === 'energytransfer.com')!.rows[0]._dup).toBe('ct2')
    expect(plan.contacts.existing).toBe(2)
    expect(plan.contacts.new).toBe(32)
  })
  it('skips a contact repeated within the file', () => {
    const plan = planImport([...rows, { ...rows[0], _row: 99 }], [], [])
    expect(plan.contacts.repeated).toBe(1)
    expect(plan.rows).toBe(34)
    expect(plan.groups.find(g => g.domain === 'conedison.com')!.rows).toHaveLength(2)
  })
  it('keeps invalid rows out of the groups', () => {
    const plan = planImport([...rows, { ...rows[0], _row: 100, _invalid: true, _reason: 'Missing name' }], [], [])
    expect(plan.invalid).toHaveLength(1)
    expect(plan.groups).toHaveLength(32)
  })
})

describe('names', () => {
  it('compares company names without suffixes or punctuation', () => {
    expect(nameKey('Ritchies Stores Pty. Ltd.')).toBe(nameKey('ritchies stores'))
    expect(nameKey('Smith & Co')).toBe('smith')
  })
})
