import { archivedLine, canArchive, KIND_LIST, KIND_NOUN, recordName, whoMay, type ArchiveKind, type ArchivedRecord } from '../data/archive'
import { Banner, Btn, Chip, Empty } from '../kit'
import { UI } from '../ui/store'
import { ARCHIVED_ROUTE, askRestore } from './archiveActions'

/** The word, not just a colour: archived rows say so. */
export function ArchivedChip({ r }: { r: ArchivedRecord }) {
  return <Chip icon="archive" title={archivedLine(r)}>Archived</Chip>
}

/** Restore button for a row of an Archived list. Stops the row click from opening the record. */
export function RestoreRowBtn({ kind, r }: { kind: ArchiveKind; r: ArchivedRecord }) {
  if (!canArchive(kind, r)) return <span className="faint xs" title={`${whoMay(kind, r)} can restore it`}>{kind === 'deal' || kind === 'sequence' ? 'Admins only' : 'Read-only'}</span>
  return (
    <span onClick={e => e.stopPropagation()}>
      <Btn size="xs" icon="refresh" aria-label={`Restore ${recordName(kind, r)}`} onClick={() => askRestore(kind, r.id)}>Restore</Btn>
    </span>
  )
}

/**
 * Top of the page of an archived company or contact, which stays readable (contacts, deals, timeline, billing) for
 * everyone who could see it before. Says it is archived, by whom and when, that it is read-only, and offers Restore
 * to whoever may.
 */
export function ArchivedBanner({ kind, r }: { kind: ArchiveKind; r: ArchivedRecord }) {
  const noun = KIND_NOUN[kind]
  const can = canArchive(kind, r)
  const extra = kind === 'contact' ? ' Sequence enrolments it had stay stopped after a restore.' : ''
  return (
    <div role="status" aria-label={`Archived ${noun}`} style={{ marginBottom: 14 }}>
      <Banner tone="warn" icon="archive" action={can && <Btn size="sm" icon="refresh" onClick={() => askRestore(kind, r.id)}>Restore {noun}</Btn>}>
        <b>This {noun} is archived.</b> {archivedLine(r)}. It is read-only and hidden from lists, search and pickers{can ? ` until it is restored` : `; ${whoMay(kind, r)} can restore it`}.{extra}
      </Banner>
    </div>
  )
}

/**
 * The record page of an archived record: in place of the not-found state, say it is archived, by whom and when,
 * and offer Restore to whoever may.
 */
export function ArchivedState({ kind, r }: { kind: ArchiveKind; r: ArchivedRecord }) {
  const [page, backLabel] = KIND_LIST[kind]
  const noun = KIND_NOUN[kind]
  const can = canArchive(kind, r)
  const extra = kind === 'contact'
    ? ' Sequence enrolments it had stay stopped after a restore.'
    : kind === 'deal' ? ' Until then it is left out of the pipeline, forecasts, reports and goals.' : ''
  return (
    <div className="page">
      <Empty
        icon="archive"
        title="This record is archived"
        body={`${recordName(kind, r)}. ${archivedLine(r)}. ${can ? `Restore the ${noun} to see and work on it again.` : `${whoMay(kind, r)} can restore it.`}${extra}`}
        action={
          <span className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
            {can && <Btn kind="pri" icon="refresh" onClick={() => askRestore(kind, r.id)}>Restore {noun}</Btn>}
            <Btn onClick={() => UI.nav(page, { q: ARCHIVED_ROUTE[kind] })}>{backLabel}</Btn>
          </span>
        }
      />
    </div>
  )
}
