import { describe, expect, it } from 'vitest'
import type { Contact } from '../../data/types'
import { findExisting, linkedinKey } from './FindPeople'

const ct = (o: Partial<Contact>): Contact => ({ id: 'c', firstName: 'Jane', lastName: 'Doe', companyId: 'co1', ...o }) as Contact
const p = (o: Partial<{ firstName: string; lastName: string; email: string; linkedin: string }> = {}) => ({ firstName: 'Jane', lastName: 'Doe', ...o })

describe('linkedinKey', () => {
  it('reduces any profile address to the lower-case slug', () => {
    expect(linkedinKey('https://www.linkedin.com/in/Jane-Doe/')).toBe('jane-doe')
    expect(linkedinKey('http://au.linkedin.com/in/jane-doe?utm=1')).toBe('jane-doe')
    expect(linkedinKey('linkedin.com/in/jane-doe#x')).toBe('jane-doe')
  })
  it('decodes escapes, and falls back to the raw slug when an escape is malformed', () => {
    expect(linkedinKey('https://www.linkedin.com/in/Ren%C3%A9-Doe')).toBe('rené-doe')
    expect(() => linkedinKey('https://www.linkedin.com/in/%E0%A4%A')).not.toThrow()
    expect(linkedinKey('/in/%E0%A4%A')).toBe('')   // no linkedin.com host: not a profile
    expect(linkedinKey('linkedin.com/in/%E0%A4%A')).toBe('%e0%a4%a')
  })
  it('is empty for anything that is not a profile', () => {
    expect(linkedinKey('https://www.linkedin.com/company/acme')).toBe('')
    expect(linkedinKey('')).toBe('')
    expect(linkedinKey(undefined)).toBe('')
  })
})

describe('findExisting', () => {
  it('matches the same name inside the same company, ignoring case, accents and punctuation', () => {
    expect(findExisting(p({ firstName: 'JANE', lastName: "D'oé" }), 'co1', [ct({ id: 'a', lastName: 'Doe' })])?.id).toBe('a')
  })
  it('does not treat a same-named person at another company as a duplicate', () => {
    expect(findExisting(p(), 'co1', [ct({ companyId: 'co2' })])).toBeUndefined()
  })
  it('does not match by name when there is no saved company', () => {
    expect(findExisting(p(), undefined, [ct({})])).toBeUndefined()
  })
  it('matches a LinkedIn profile across companies', () => {
    const hit = findExisting(p({ firstName: 'J', linkedin: 'https://www.linkedin.com/in/jane-doe/' }), 'co1', [ct({ id: 'x', firstName: 'Other', companyId: 'co9', linkedin: 'linkedin.com/in/Jane-Doe' })])
    expect(hit?.id).toBe('x')
  })
  it('matches an email across companies, on either email field', () => {
    expect(findExisting(p({ firstName: 'J', email: ' Jane@Acme.test ' }), 'co1', [ct({ id: 'e', firstName: 'Z', companyId: 'co9', email2: 'jane@acme.test' })])?.id).toBe('e')
  })
  it('ignores archived contacts', () => {
    expect(findExisting(p(), 'co1', [ct({ archived: true })])).toBeUndefined()
  })
  it('does not match two different people', () => {
    expect(findExisting(p({ firstName: 'John' }), 'co1', [ct({})])).toBeUndefined()
  })
})
