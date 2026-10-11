import { F } from '../F'
import { act, audit } from '../internals'
import { Q } from '../Q'
import { commit } from '../commit'
import { idx, S } from '../store'
import type { BusinessId } from '../types'

export interface PhoneApply {
  field: 'mobile' | 'phone'
  value: string
  /** "Phone lookup (LeadMagic) 11 Oct 2026". */
  source: string
}

/**
 * Put a looked-up number on a contact. Runs only from a click on Add as mobile / Add as phone. Needs edit access to
 * the business. The number starts Unverified; the contact's own (email) verification is not touched. Whether to
 * replace an existing number is the caller's question, asked before this runs.
 */
export function applyPhoneLookup(ctid: string, b: BusinessId, p: PhoneApply): boolean {
  const c = idx.contacts.get(ctid)
  const value = p.value.trim()
  if (!c || !value || !Q.canEdit(b)) return false
  const now = F.nowIso()
  Reflect.set(c, p.field, value)
  c.enrichment = { ...c.enrichment, [p.field]: { kind: 'published', at: now, by: S.session.userId, source: p.source, verification: 'Unverified' } }
  c.lastEnriched = now
  act({ type: 'enriched', businessId: b, contactId: ctid, companyId: c.companyId, subject: 'Contact enriched (phone lookup)', desc: `Updated: ${p.field}\n${p.source}` })
  audit('Phone lookup applied', `${c.name} — ${p.field}`)
  commit()
  return true
}
