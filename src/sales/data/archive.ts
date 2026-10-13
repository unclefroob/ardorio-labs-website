import { F } from './F'
import { Q } from './Q'
import { idx, S } from './store'
import type { Activity, Company, Contact, Deal, Sequence } from './types'

/**
 * Archive rules on the web (contract: ArchiveFields).
 *
 * Companies and contacts carry `archived` only. Any editor of the record's business archives or restores them.
 * Deals and sequences carry `archived`, `archivedAt` and `archivedBy`; only admins of that business may change them,
 * and the server enforces it. An archived sequence also keeps status 'archived' so the engine stops it; older
 * sequences archived before the flag existed have only that status and still read as archived.
 *
 * Archived deals never count: not on the pipeline board, in forecasts, reports or goals. Activity logged against an
 * archived deal is left out of goals and reports too, so a test or duplicate deal stops counting anywhere. They stay
 * findable through the Archived filter on Deals.
 */

export type ArchiveKind = 'company' | 'contact' | 'deal' | 'sequence'
export type ArchivedRecord = Company | Contact | Deal | Sequence

/** Enrolment statuses that archiving a contact stops. Paused, finished and failed ones are left as they are. */
export const STOPPED_BY_ARCHIVE: readonly string[] = ['active', 'awaiting_approval', 'awaiting_task']

export const liveDeal = (d: Deal): boolean => d.archived !== true
export const seqArchived = (s: Sequence): boolean => s.archived === true || s.status === 'archived'

/** True when the activity was logged against a deal that is now archived. */
export function onArchivedDeal(a: Pick<Activity, 'dealId'>): boolean {
  return !!a.dealId && idx.deals.get(a.dealId)?.archived === true
}

/** Enrolments of a contact that archiving would stop, across every business. */
export function stoppableEnrolments(contactId: string): number {
  return S.enrolments.filter(e => e.contactId === contactId && STOPPED_BY_ARCHIVE.includes(e.status)).length
}

/** Enrolments of a sequence that are still moving, which archiving it stops. */
export function liveSeqEnrolments(seqId: string): number {
  return S.enrolments.filter(e => e.seqId === seqId && [...STOPPED_BY_ARCHIVE, 'paused'].includes(e.status)).length
}

export function isArchived(kind: ArchiveKind, r: ArchivedRecord): boolean {
  return kind === 'sequence' ? seqArchived(r as Sequence) : r.archived === true
}

export function lookup(kind: ArchiveKind, id: string | null | undefined): ArchivedRecord | undefined {
  if (kind === 'company') return Q.company(id)
  if (kind === 'contact') return Q.contact(id)
  if (kind === 'deal') return Q.deal(id)
  return Q.seq(id)
}

export function recordName(kind: ArchiveKind, r: ArchivedRecord): string {
  return kind === 'deal' ? (r as Deal).title || (r as Deal).name : (r as { name: string }).name
}

/** The businesses a company or contact belongs to that the signed-in user can edit. */
function editableBiz(kind: 'company' | 'contact', id: string): boolean {
  const rels = kind === 'company' ? Q.relsOf(id) : Q.crelsOf(id)
  return rels.some(r => Q.canEdit(r.businessId))
}

/** Whether the signed-in user may archive or restore this record. */
export function canArchive(kind: ArchiveKind, r: ArchivedRecord): boolean {
  if (kind === 'company' || kind === 'contact') return editableBiz(kind, r.id)
  return Q.canAdmin((r as Deal | Sequence).businessId)
}

/** Who may archive or restore it, for the sentence shown to someone who may not. */
export function whoMay(kind: ArchiveKind, r: ArchivedRecord): string {
  if (kind === 'company' || kind === 'contact') return 'Someone with edit access to its business'
  return `An admin of ${Q.biz((r as Deal | Sequence).businessId)?.name ?? 'its business'}`
}

/** "Archived by Priya on 12 Oct 2026", or less when the record does not say. */
export function archivedLine(r: ArchivedRecord): string {
  const at = typeof r.archivedAt === 'string' && r.archivedAt ? r.archivedAt : ''
  const by = typeof r.archivedBy === 'string' && r.archivedBy ? Q.user(r.archivedBy)?.name ?? 'a former user' : ''
  return 'Archived' + (by ? ` by ${by}` : '') + (at ? ` on ${F.date(at)}` : '')
}

export const KIND_NOUN: Record<ArchiveKind, string> = { company: 'company', contact: 'contact', deal: 'deal', sequence: 'sequence' }
export const KIND_LIST: Record<ArchiveKind, readonly [page: string, label: string]> = {
  company: ['companies', 'Back to companies'], contact: ['contacts', 'Back to contacts'], deal: ['deals', 'Back to deals'], sequence: ['sequences', 'Back to sequences'],
}
