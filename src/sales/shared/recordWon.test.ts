import { describe, expect, it } from 'vitest'
import { checkRecordWon, creatingContact, NEW_CONTACT, splitName, wonDateProblem, WON_DATE_FUTURE, type RecordWonDraft } from './recordWon'

const TODAY = '2026-10-14'
const draft = (over: Partial<RecordWonDraft> = {}): RecordWonDraft => ({
  companyId: '', companyName: 'Kestrel Logistics', newCompany: true, contactId: '', contactName: '', contactEmail: '',
  title: 'Fleet dashboard build', wonOn: '2026-03-03', amount: '120,000', engagementType: 'fixed-price', ...over,
})

describe('Record a won deal: validation', () => {
  it('accepts a past or today won date and refuses a future one, in words', () => {
    expect(wonDateProblem('2026-03-03', TODAY)).toBeNull()
    expect(wonDateProblem(TODAY, TODAY)).toBeNull()
    expect(wonDateProblem('2026-11-20', TODAY)).toBe(WON_DATE_FUTURE)
    expect(wonDateProblem('', TODAY)).toBe('Enter the date the deal was won')
    expect(wonDateProblem('2026-02-30', TODAY)).toBe('The won date is not a valid date')
  })

  it('passes a complete Ardorio contract and gives the amount in cents', () => {
    expect(checkRecordWon(draft(), TODAY, true)).toEqual({ ok: true, amountCents: 12_000_000 })
    expect(checkRecordWon(draft({ amount: '48000.50' }), TODAY, false)).toEqual({ ok: true, amountCents: 4_800_050 })
  })

  it('reports every missing field at once, next to its field', () => {
    const r = checkRecordWon(draft({ companyName: '', newCompany: false, title: ' ', wonOn: '2026-11-20', amount: '' }), TODAY, true)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errs).sort()).toEqual(['amount', 'company', 'title', 'wonOn'])
    expect(r.errs.wonOn).toBe(WON_DATE_FUTURE)
    expect(r.errs.amount).toBe('Enter the contracted amount in dollars and cents, like 48000.00')
  })

  it('a typed name that was neither picked nor created is not a company', () => {
    const r = checkRecordWon(draft({ newCompany: false }), TODAY, true)
    expect(r.ok ? null : r.errs.company).toBe('Pick a company from the list, or create it')
    expect(checkRecordWon(draft({ newCompany: false, companyId: 'co1' }), TODAY, true).ok).toBe(true)
  })

  it('refuses a zero, negative or junk amount', () => {
    for (const amount of ['0', '-5', 'abc', '1.234']) {
      expect(checkRecordWon(draft({ amount }), TODAY, true).ok).toBe(false)
      expect(checkRecordWon(draft({ amount }), TODAY, false).ok).toBe(false)
    }
  })

  it('a contact is optional; one being created needs a name and a valid email if any', () => {
    expect(creatingContact(draft())).toBe(false)
    expect(creatingContact(draft({ contactEmail: 'dana@kestrel.example' }))).toBe(true)
    expect(creatingContact(draft({ newCompany: false, companyId: 'co1', contactId: NEW_CONTACT }))).toBe(true)
    expect(creatingContact(draft({ newCompany: false, companyId: 'co1', contactId: 'ct1' }))).toBe(false)
    const r = checkRecordWon(draft({ contactEmail: 'not-an-email' }), TODAY, true)
    expect(r.ok ? null : r.errs).toEqual({ contactName: 'Enter the contact’s name, or leave the contact out', contactEmail: 'Enter a valid email' })
    expect(checkRecordWon(draft({ contactName: 'Dana Wong', contactEmail: 'dana@kestrel.example' }), TODAY, true).ok).toBe(true)
  })

  it('splits a typed name into first and last name', () => {
    expect(splitName(' Dana  Wong ')).toEqual({ firstName: 'Dana', lastName: 'Wong' })
    expect(splitName('Dana van der Berg')).toEqual({ firstName: 'Dana', lastName: 'van der Berg' })
    expect(splitName('Dana')).toEqual({ firstName: 'Dana', lastName: '' })
  })
})
