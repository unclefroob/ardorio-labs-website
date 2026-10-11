import { describe, expect, it } from 'vitest'
import type { Company } from '../data/types'
import { similarCompanies } from './companyMatch'

const co = (name: string, domain = '', archived = false) => ({ id: name, name, domain, archived }) as unknown as Company
const names = (q: string, w: string, cs: Company[]) => similarCompanies(q, w, cs).map(c => c.name)

describe('similarCompanies', () => {
  const crm = [co('Spuntino Food Group', 'spuntino.com.au'), co('Harbour Retail Group'), co('Premier Foods'), co('Premier Logistics')]

  it('finds a longer CRM name that contains the typed one', () => {
    expect(names('Spuntino Group', '', crm)).toEqual(['Spuntino Food Group'])
  })
  it('finds a shorter CRM name inside the typed one', () => {
    expect(names('Harbour Retail Group Pty Ltd Australia', '', crm)).toEqual(['Harbour Retail Group'])
    expect(names('Spuntino Hospitality Group', '', [co('Spuntino')])).toEqual(['Spuntino'])
  })
  it('matches on the website when the names differ', () => {
    expect(names('Spun Tino Restaurants', 'https://www.spuntino.com/menu', crm)).toEqual(['Spuntino Food Group'])
  })
  it('tolerates a typo in a distinctive name', () => {
    expect(names('Spuntinno Food Group', '', crm)).toEqual(['Spuntino Food Group'])
  })
  it('offers every plausible candidate for an ambiguous name, never one silently', () => {
    expect(names('Premier', '', crm)).toEqual(['Premier Foods', 'Premier Logistics'])
  })
  it('ignores short or unrelated names, archived records and exact matches', () => {
    expect(names('Ha', '', crm)).toEqual([])
    expect(names('Zephyr Mining', '', crm)).toEqual([])
    expect(names('Spuntino Food Group Pty Ltd', '', crm)).toEqual([])
    expect(names('Spuntino Group', '', [co('Spuntino Food Group', '', true)])).toEqual([])
  })
})
