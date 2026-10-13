import { Act } from '../data/Act'
import { lookup, recordName, type ArchiveKind } from '../data/archive'
import { UI } from '../ui/store'

/** Where the Archived filter of each list lives, so Back and the toasts land on it. */
export const ARCHIVED_ROUTE: Record<ArchiveKind, Record<string, unknown>> = {
  company: { archived: '1' }, contact: { archived: '1' }, deal: { view: 'list', status: 'archived' }, sequence: { status: 'archived' },
}

/** Ask first: the Archive dialog starts on Keep. */
export function askArchive(kind: ArchiveKind, id: string): void {
  UI.open('archiveRecord', { kind, id, mode: 'archive' })
}

/**
 * Restore. Companies and contacts come straight back (nothing is lost either way); deals and sequences change
 * reports and sending, so they ask first, as the review asked.
 */
export function askRestore(kind: ArchiveKind, id: string): void {
  if (kind === 'deal' || kind === 'sequence') UI.open('archiveRecord', { kind, id, mode: 'restore' })
  else restoreNow(kind, id)
}

export function archiveNow(kind: ArchiveKind, id: string): void {
  const r = lookup(kind, id)
  if (!r) return
  if (kind === 'company') Act.archiveCompany(id)
  else if (kind === 'contact') Act.archiveContact(id)
  else if (kind === 'deal') Act.archiveDeal(id)
  else Act.archiveSequence(id)
  UI.toast(`${recordName(kind, r)} archived`, undefined, { label: 'Undo', fn: () => restoreNow(kind, id) })
}

export function restoreNow(kind: ArchiveKind, id: string): void {
  const r = lookup(kind, id)
  if (!r) return
  if (kind === 'company') Act.restoreCompany(id)
  else if (kind === 'contact') Act.restoreContact(id)
  else if (kind === 'deal') Act.restoreDeal(id)
  else Act.restoreSequence(id)
  UI.toast(kind === 'contact' ? `${recordName(kind, r)} restored. Stopped sequence enrolments stay stopped.` : `${recordName(kind, r)} restored`, 'ok')
}
