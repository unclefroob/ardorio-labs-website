import { describe, expect, it } from 'vitest'
import { autoMap, isFiller, isWizaHeader, parseCSV } from './csv'
import wizaCsv from './wiza-demo.fixture.csv?raw'

const rows = parseCSV(wizaCsv)
const headers = rows[0]
const col = (name: string): number => headers.indexOf(name)

describe('Wiza export mapping', () => {
  const a = autoMap(headers, rows.slice(1))

  it('recognises a Wiza export from its header names', () => {
    expect(isWizaHeader(headers)).toBe(true)
    expect(isWizaHeader(['First name', 'Last name', 'Company', 'Email'])).toBe(false)
    expect(a.wiza).toBe(true)
  })

  it('reads 34 data rows and 48 columns', () => {
    expect(rows).toHaveLength(35)
    expect(headers).toHaveLength(48)
  })

  it('maps email to the email column, never to email_type or email_status', () => {
    expect(a.map[col('email')]).toBe('email')
    expect(a.map[col('email_type')]).toBe('')
    expect(a.map[col('email_status')]).toBe('emailStatus')
  })

  it('maps the person and company columns by name', () => {
    const want: Record<string, string> = {
      first_name: 'firstName', last_name: 'lastName', title: 'title', linkedin: 'linkedin', location: 'location', company: 'company', company_domain: 'website',
      company_industry: 'industry', company_subindustry: 'subindustry', company_size: 'employees', company_linkedin: 'companyLinkedin', company_type: 'companyType',
      company_street: 'address', company_locality: 'city', company_region: 'state', company_country: 'country',
    }
    for (const [h, k] of Object.entries(want)) expect(a.map[col(h)], h).toBe(k)
  })

  it('leaves the person-level locality, region and country and the empty duplicates out', () => {
    for (const h of ['locality', 'region', 'country', 'linkedin_profile_url', 'domain', 'company_size_range', 'list_name']) expect(a.map[col(h)], h).toBe('')
  })

  it('keeps full_name as the fallback for a row with no first or last name', () => {
    expect(a.map[col('full_name')]).toBe('fullName')
  })

  it('does not map a description that is the same on every row', () => {
    const values = rows.slice(1).map(r => r[col('company_description')])
    expect(isFiller(values)).toBe(true)
    expect(a.map[col('company_description')]).toBe('')
  })

  it('maps a description that varies', () => {
    const varied = rows.map((r, i) => (i === 0 ? r : r.map((c, j) => (j === col('company_description') ? `About company ${i}` : c))))
    expect(autoMap(headers, varied.slice(1)).map[col('company_description')]).toBe('description')
  })
})

describe('a CSV that is not a known export', () => {
  const h = ['First Name', 'Last Name', 'Organisation', 'Job Title', 'E-mail', 'Mobile Phone', 'Office Phone', 'LinkedIn URL', 'Website', 'Industry']
  const a = autoMap(h)
  it('maps by name, with mobile and phone separate', () => {
    expect(Object.values(a.map)).toEqual(['firstName', 'lastName', 'company', 'title', 'email', 'mobile', 'phone', 'linkedin', 'website', 'industry'])
    expect(a.wiza).toBe(false)
  })
  it('uses a field once only', () => {
    const dup = autoMap(['Email', 'Work Email', 'Name'])
    expect(Object.values(dup.map).filter(k => k === 'email')).toHaveLength(1)
  })
})
