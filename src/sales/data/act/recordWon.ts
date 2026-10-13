import type { EngagementType } from '../../api/contract'
import { validateContract } from '../../shared/billing'
import { formatCents } from '../../shared/money'
import { wonDateProblem } from '../../shared/recordWon'
import { commit } from '../commit'
import { nudgeEngine } from '../engineNudge'
import { F } from '../F'
import { act, audit, ensureRels } from '../internals'
import { Q } from '../Q'
import { reindex, S } from '../store'
import type { BusinessId, Deal } from '../types'
import { setContract } from './billing'
import { createCompany, createContact, linkCompany } from './crm'
import { dealRecord } from './deals'

export interface RecordWonInput {
  businessId: BusinessId
  /** An existing company, or a new one created by name only (research is optional, later). */
  company: { id: string } | { name: string }
  /** Optional: an existing contact of the company, or a new one by name and email. */
  contact?: { id: string } | { firstName: string; lastName: string; email: string } | null
  title: string
  /** YYYY-MM-DD, not in the future. It is the deal's close date and, for Ardorio, the contract date. */
  wonOn: string
  /** Ex GST. For an Ardorio contract it is the frozen baseline; otherwise the deal value. */
  amountCents: number
  /** Ardorio admins: freeze the contract with this engagement type. Left out, no contract is written. */
  engagementType?: EngagementType | null
}

/** `contractError` is set only when the deal was recorded but its contract was refused (checked first, so unexpected). */
export type RecordWonResult = { ok: true; deal: Deal; contract: boolean; contractError?: string } | { ok: false; error: string }

const fail = (error: string): RecordWonResult => ({ ok: false, error })

/** Why this cannot be recorded, or null. Every check runs before anything is written. */
function problem(f: RecordWonInput): string | null {
  if (!Q.canEdit(f.businessId)) return `You can't create deals in ${Q.biz(f.businessId)?.name ?? f.businessId}`
  if (!Q.pipeline(f.businessId).stages.some(s => s.won)) return 'This pipeline has no Won stage. An administrator needs to add one.'
  if ('id' in f.company && !Q.company(f.company.id)) return 'That company is no longer in the CRM'
  if ('name' in f.company && !f.company.name.trim()) return 'Enter the company name'
  if (f.contact && 'id' in f.contact) {
    const ct = Q.contact(f.contact.id)
    if (!ct || !('id' in f.company) || ct.companyId !== f.company.id) return 'That contact is not at this company'
  }
  if (!f.title.trim()) return 'Enter a deal title'
  const date = wonDateProblem(f.wonOn, F.today())
  if (date) return date
  if (!Number.isSafeInteger(f.amountCents) || f.amountCents <= 0) return 'Enter the won value'
  if (f.engagementType) {
    if (f.businessId !== 'ard') return 'Contracts are only for Ardorio deals'
    if (!Q.canBill()) return 'Only admins of Ardorio can set a contract'
    const bad = validateContract({ baselineCents: f.amountCents, engagementType: f.engagementType, contractedOn: f.wonOn, estimateAtWonCents: f.amountCents }, F.today())
    if (bad) return bad
  }
  return null
}

/**
 * Record work already won, including past deals: create the company (and contact) if new, then the deal straight in
 * the pipeline's Won stage, and for Ardorio admins freeze its contract. Everything is written in one synchronous pass,
 * so it reaches the server as one sync batch (companies and contacts first, then the deal, then the billing plan).
 * recordedWonBy is the server's (the caller's display name); the name sent here is only a placeholder it replaces.
 */
export function recordWonDeal(f: RecordWonInput): RecordWonResult {
  const bad = problem(f)
  if (bad) return fail(bad)
  const b = f.businessId
  const co = 'id' in f.company ? Q.company(f.company.id)! : createCompany({ name: f.company.name, businessId: b })
  if (!Q.rel(co.id, b)) linkCompany(co.id, b)
  let contactId: string | null = null
  if (f.contact) contactId = 'id' in f.contact ? f.contact.id : createContact({ ...f.contact, companyId: co.id, businessId: b }).id

  const pl = Q.pipeline(b)
  const st = pl.stages.find(s => s.won)!
  const now = F.nowIso()
  const value = f.amountCents / 100
  const d = dealRecord({ title: f.title.trim(), businessId: b, companyId: co.id, close: f.wonOn, contactIds: contactId ? [contactId] : [], value, source: 'Recorded won deal' }, pl, st, co)
  Object.assign(d, {
    status: 'won', probability: 100, forecast: 'Closed', closedAt: `${f.wonOn}T${now.slice(11)}`,
    revenueType: b === 'ard' ? 'One-off project' : 'Recurring subscription', recordedWonDirectly: true, recordedWonBy: Q.me().name,
  })
  // As Mark won does: the annual value of a recurring deal gives its MRR. Ardorio is never recurring.
  if (b !== 'ard') d.mrr = Math.round(d.value / 12)
  S.deals.push(d)
  reindex()
  if (contactId) ensureRels(contactId, b, d.ownerId)
  const rel = Q.rel(co.id, b)
  if (rel) rel.status = 'Customer'
  act({ type: 'won', businessId: b, companyId: co.id, contactId, dealId: d.id, subject: 'Recorded as won directly', desc: `${d.title} · won ${f.wonOn} · ${formatCents(f.amountCents)} ex GST` })
  audit('Deal recorded as won', `${d.name}: won ${f.wonOn}, ${formatCents(f.amountCents)}`)
  nudgeEngine()
  commit()

  if (!f.engagementType) return { ok: true, deal: d, contract: false }
  const r = setContract(d.id, { baselineCents: f.amountCents, engagementType: f.engagementType, contractedOn: f.wonOn, estimateAtWonCents: f.amountCents })
  // Checked above with the same rules, so this only fails if something changed in between.
  return r.ok ? { ok: true, deal: d, contract: true } : { ok: true, deal: d, contract: false, contractError: r.error }
}
