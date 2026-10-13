import type { EngagementType } from '../api/contract'
import { isEngagementType, validateContractAmount } from './billing'
import { isDay } from './invoices'
import { parseCents } from './money'

/** The Record a won deal form, as typed. */
export interface RecordWonDraft {
  /** An existing company picked from the CRM, or '' while none is picked. */
  companyId: string
  /** The company name typed into the picker. Created as a new company when `newCompany` is set. */
  companyName: string
  newCompany: boolean
  /** An existing contact of the company, '' for none, or NEW_CONTACT to create one from the name and email. */
  contactId: string
  contactName: string
  contactEmail: string
  title: string
  wonOn: string
  amount: string
  engagementType: EngagementType
}

export const NEW_CONTACT = '__new'

export type RecordWonField = 'company' | 'contactName' | 'contactEmail' | 'title' | 'wonOn' | 'amount' | 'engagementType'
export type RecordWonErrors = Partial<Record<RecordWonField, string>>

export const WON_DATE_FUTURE = 'The won date can’t be in the future. Use today or an earlier date.'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const creatingContact = (d: Pick<RecordWonDraft, 'newCompany' | 'contactId' | 'contactName' | 'contactEmail'>): boolean =>
  d.contactId === NEW_CONTACT || (d.newCompany && (!!d.contactName.trim() || !!d.contactEmail.trim()))

/** "Dana Wong" -> first and last name; one word is a first name only. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

/** Why the won date is refused, or null. `today` is the latest won date allowed. */
export function wonDateProblem(wonOn: string, today: string): string | null {
  if (!wonOn) return 'Enter the date the deal was won'
  if (!isDay(wonOn)) return 'The won date is not a valid date'
  if (wonOn > today) return WON_DATE_FUTURE
  return null
}

export type RecordWonCheck = { ok: true; amountCents: number } | { ok: false; errs: RecordWonErrors }

/**
 * Validate the form. `contract` is true when the amount is frozen as an Ardorio contract (Ardorio admins); otherwise
 * it is the deal value. Nothing is saved unless this passes.
 */
export function checkRecordWon(d: RecordWonDraft, today: string, contract: boolean): RecordWonCheck {
  const errs: RecordWonErrors = {}
  if (d.newCompany ? !d.companyName.trim() : !d.companyId) {
    errs.company = d.companyName.trim() && !d.newCompany ? 'Pick a company from the list, or create it' : 'Pick a company, or type a name to create one'
  }
  if (creatingContact(d)) {
    if (!d.contactName.trim()) errs.contactName = 'Enter the contact’s name, or leave the contact out'
    if (d.contactEmail.trim() && !EMAIL_RE.test(d.contactEmail.trim())) errs.contactEmail = 'Enter a valid email'
  }
  if (!d.title.trim()) errs.title = 'Enter a deal title'
  const date = wonDateProblem(d.wonOn, today)
  if (date) errs.wonOn = date
  const cents = d.amount.trim() ? parseCents(d.amount) : null
  if (contract) {
    const bad = validateContractAmount(cents)
    if (bad) errs.amount = bad
    if (!isEngagementType(d.engagementType)) errs.engagementType = 'Choose an engagement type'
  } else if (cents === null || cents <= 0) errs.amount = 'Enter the won value in dollars, like 48000'
  if (Object.keys(errs).length || cents === null) return { ok: false, errs }
  return { ok: true, amountCents: cents }
}
