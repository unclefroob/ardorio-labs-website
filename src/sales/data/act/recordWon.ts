import type { EngagementType } from '../../api/contract'
import { validateContract } from '../../shared/billing'
import { formatCents } from '../../shared/money'
import { wonDateProblem } from '../../shared/recordWon'
import { commit } from '../commit'
import { flushAll } from '../sync'
import { watchAll } from '../watch'
import { nudgeEngine } from '../engineNudge'
import { F } from '../F'
import { act, audit, ensureRels } from '../internals'
import { Q } from '../Q'
import { reindex, removeRow, rowsOf, S, type ArrayCollection, type SyncedCollection } from '../store'
import type { BusinessId, Contact, Deal } from '../types'
import { setContract } from './billing'
import { addCompanyRows, addContactRows, companyCreatedLog, companyLinkedLog, contactCreatedLog, linkCompanyRows } from './crm'
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

/** What became of a recorded won deal once the server answered (or did not, yet). */
export type RecordWonSaved =
  /** The server accepted the company, contact and deal; the won activity, Customer status and contract were then written. */
  | { state: 'saved'; contract: boolean; contractError?: string }
  /** The server refused part of it, so everything this pass created was taken back out. */
  | { state: 'refused'; error: string }
  /** No answer yet (offline, or the server is failing). It finishes, or is taken back out, when the answer comes. */
  | { state: 'pending' }

export type RecordWonResult = { ok: true; deal: Deal; saved: Promise<Exclude<RecordWonSaved, { state: 'pending' }>> } | { ok: false; error: string }

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

type Key = readonly [SyncedCollection, string]

/** Ids of the rows in these collections, to tell afterwards which rows a pass created. */
const CREATED_IN = ['companies', 'contacts', 'companyRels', 'contactRels'] as const
const idsOf = (): Map<ArrayCollection, Set<string>> => new Map(CREATED_IN.map(c => [c, new Set(rowsOf(c).map(r => r.id))]))

/**
 * Record work already won, including past deals, in two steps so a refusal never leaves half of it behind.
 *
 * First only the records are written: the company (and contact) if new, their relationships, and the deal straight in
 * the pipeline's Won stage. The server applies each op on its own, so nothing that cannot be taken back is written yet:
 * no activity or audit entry (both append-only), no Customer status, no contract.
 *
 * When the server has accepted all of those records, the rest follows: the activities, the relationship becomes a
 * Customer, and for Ardorio admins the contract is frozen. If it refuses any of them (a stale pipeline, ROLE_REQUIRED),
 * every record this pass created is removed again, including ones it had already accepted, which are then deleted.
 * recordedWonBy is the server's (the caller's display name); the name sent here is only a placeholder it replaces.
 */
export function recordWonDeal(f: RecordWonInput): RecordWonResult {
  const bad = problem(f)
  if (bad) return fail(bad)
  const b = f.businessId
  const before = idsOf()
  const newCompany = !('id' in f.company)
  const co = 'id' in f.company ? Q.company(f.company.id)! : addCompanyRows({ name: f.company.name, businessId: b })
  const linked = !Q.rel(co.id, b)
  if (linked) linkCompanyRows(co.id, b)
  const newContact = f.contact && !('id' in f.contact) ? addContactRows({ ...f.contact, companyId: co.id, businessId: b }) : null
  const contactId = newContact ? newContact.id : f.contact && 'id' in f.contact ? f.contact.id : null

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
  if (contactId) ensureRels(contactId, b, d.ownerId)
  reindex()

  const created: Key[] = CREATED_IN.flatMap(c => rowsOf(c).filter(r => !before.get(c)?.has(r.id)).map(r => [c, r.id] as const))
  created.push(['deals', d.id])
  const saved = watchAll(created).then(o => (o.ok ? finish(f, d, { newCompany, linked, newContact }) : undo(created, o.error)))
  commit()
  return { ok: true, deal: d, saved }
}

/** The server accepted the records: write what could not be taken back, then the contract. */
function finish(f: RecordWonInput, d: Deal, made: { newCompany: boolean; linked: boolean; newContact: Contact | null }): Exclude<RecordWonSaved, { state: 'pending' }> {
  const b = f.businessId
  const co = Q.company(d.companyId)
  if (co && made.newCompany) companyCreatedLog(co, b)
  else if (made.linked) companyLinkedLog(d.companyId, b)
  if (made.newContact) contactCreatedLog(made.newContact, b)
  const rel = Q.rel(d.companyId, b)
  if (rel) rel.status = 'Customer'
  const contactId = d.contactIds[0] ?? null
  act({ type: 'won', businessId: b, companyId: d.companyId, contactId, dealId: d.id, subject: 'Recorded as won directly', desc: `${d.title} · won ${f.wonOn} · ${formatCents(f.amountCents)} ex GST` })
  audit('Deal recorded as won', `${d.name}: won ${f.wonOn}, ${formatCents(f.amountCents)}`)
  nudgeEngine()
  commit()

  if (!f.engagementType) return { state: 'saved', contract: false }
  const r = setContract(d.id, { baselineCents: f.amountCents, engagementType: f.engagementType, contractedOn: f.wonOn, estimateAtWonCents: f.amountCents })
  // Checked above with the same rules, so this only fails if something changed in between.
  return r.ok ? { state: 'saved', contract: true } : { state: 'saved', contract: false, contractError: r.error }
}

/** The server refused part of it: take every record this pass created back out (accepted ones are then deleted). */
function undo(created: readonly Key[], error: string): { state: 'refused'; error: string } {
  for (const [c, id] of created) {
    if (c !== 'settings') removeRow(c, id)
  }
  reindex()
  commit()
  return { state: 'refused', error }
}

/**
 * Wait for the server's answer to a recorded won deal: until it is in, or until the queued edits have been sent as far as
 * they can be now. 'pending' means it is still queued; it finishes (or is taken back out) when the answer comes.
 */
export async function recordWonOutcome(saved: Extract<RecordWonResult, { ok: true }>['saved']): Promise<RecordWonSaved> {
  const pending: RecordWonSaved = { state: 'pending' }
  return Promise.race([saved, flushAll().then(() => Promise.race([saved, pending]))])
}
