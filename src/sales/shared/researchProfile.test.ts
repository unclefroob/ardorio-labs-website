import { describe, expect, it } from 'vitest'
import { employeesText, researchProfileOf, splitHeadOffice } from './companyProfile'

describe('splitHeadOffice', () => {
  it('splits city, state and country', () => expect(splitHeadOffice('Sydney, NSW, Australia')).toEqual({ hq: 'Sydney', state: 'NSW', country: 'Australia' }))
  it('reads two parts as city and country', () => expect(splitHeadOffice('Auckland, New Zealand')).toEqual({ hq: 'Auckland', state: '', country: 'New Zealand' }))
  it('reads one part as the city', () => expect(splitHeadOffice('Melbourne')).toEqual({ hq: 'Melbourne', state: '', country: '' }))
})

describe('researchProfileOf', () => {
  it('narrows a good profile and defaults an unknown basis to estimated', () => {
    expect(researchProfileOf({ headOffice: ' Perth, WA, Australia ', employees: { count: 90, basis: 'roughly', note: 'n' } }))
      .toEqual({ headOffice: 'Perth, WA, Australia', employees: { count: 90, basis: 'estimated', note: 'n' } })
  })
  it('returns null for nothing usable', () => {
    expect(researchProfileOf(undefined)).toBeNull()
    expect(researchProfileOf({ headOffice: '  ', employees: { count: 1.5 } })).toBeNull()
    expect(researchProfileOf([])).toBeNull()
  })
})

describe('employeesText', () => {
  it('says "about" for an estimate only', () => {
    expect(employeesText({ count: 850, basis: 'estimated', note: '' })).toBe('about 850')
    expect(employeesText({ count: 1200, basis: 'stated', note: '' })).toBe('1,200')
  })
})
