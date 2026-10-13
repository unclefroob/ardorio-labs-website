import type { ReactNode } from 'react'
import { canArchive, isArchived, KIND_NOUN, liveSeqEnrolments, lookup, recordName, stoppableEnrolments, whoMay, type ArchiveKind } from '../../data/archive'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Contact, Deal } from '../../data/types'
import { Banner, Btn, Modal } from '../../kit'
import { archiveNow, restoreNow } from '../../shared/archiveActions'
import { UI } from '../../ui/store'
import { MissingModal } from './guards'

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
const P = ({ children }: { children: ReactNode }) => <p style={{ margin: 0 }}>{children}</p>
const TITLE: Record<ArchiveKind, string> = { company: 'Company', contact: 'Contact', deal: 'Deal', sequence: 'Sequence' }

/**
 * Archive or restore one record. Starts on the safe button (Keep), and Escape, the X and the backdrop all keep the
 * record as it is. Archiving a contact says how many live sequence enrolments stop, and that a restore does not
 * restart them. Deals and sequences are admins only; anyone else gets a plain explanation instead of the buttons.
 */
export function ArchiveRecord({ kind, id, mode = 'archive' }: { kind: ArchiveKind; id: string; mode?: 'archive' | 'restore' }) {
  useStore()
  const r = lookup(kind, id)
  if (!r) return <MissingModal title={mode === 'archive' ? 'Archive' : 'Restore'} what={TITLE[kind]} />
  const noun = KIND_NOUN[kind]
  const name = recordName(kind, r)
  const archive = mode === 'archive'

  if (!canArchive(kind, r)) {
    return (
      <Modal title={`You can’t ${archive ? 'archive' : 'restore'} this ${noun}`} width={480} icon="lock" closeLabel="Close this dialog"
        footer={<Btn kind="pri" data-autofocus onClick={UI.close}>Close</Btn>}>
        <p style={{ margin: 0, lineHeight: 1.55 }}>{whoMay(kind, r)} can {archive ? 'archive' : 'restore'} {name}. Nothing has changed.</p>
      </Modal>
    )
  }
  if (archive === isArchived(kind, r)) {
    return (
      <Modal title={`${name} is ${archive ? 'already archived' : 'not archived'}`} width={480} icon="info" closeLabel="Close this dialog"
        footer={<Btn kind="pri" data-autofocus onClick={UI.close}>Close</Btn>}>
        <p style={{ margin: 0, lineHeight: 1.55 }}>Someone may have just changed it. Nothing else has changed.</p>
      </Modal>
    )
  }

  const go = (): void => {
    UI.close()
    if (archive) archiveNow(kind, id)
    else restoreNow(kind, id)
  }

  let body: ReactNode
  if (archive) {
    if (kind === 'company') {
      body = (
        <>
          <P>{name} is hidden from Companies, search and pickers. Its contacts, deals and activity history stay linked and intact.</P>
          <P>You can restore it from the Archived filter on Companies.</P>
        </>
      )
    } else if (kind === 'contact') {
      const n = stoppableEnrolments(id)
      const first = (r as Contact).firstName || name
      body = (
        <>
          {n > 0
            ? <Banner tone="warn"><b>{plural(n, 'active sequence enrolment', 'active sequence enrolments')} will stop.</b> Enrolments do not restart if you restore {first}; you would need to enrol them again.</Banner>
            : <P>{first} is not in any active sequence, so no enrolments stop. If you restore {first} later, you would enrol them again by hand.</P>}
          <P>{name} is hidden from Contacts, search, lists and pickers. Activity, notes and deals stay on the record. You can restore it from the Archived filter on Contacts.</P>
        </>
      )
    } else if (kind === 'deal') {
      const d = r as Deal
      body = (
        <>
          <P>{name} leaves the pipeline board, forecasts, reports and goals{d.status === 'open' ? ', taking its value out of the pipeline' : ''}. Activity logged on it stops counting too.</P>
          <P>Notes, tasks and history stay on the record. Admins of {Q.biz(d.businessId)?.name ?? 'this business'} can restore it from the Archived filter on Deals.</P>
        </>
      )
    } else {
      const n = liveSeqEnrolments(id)
      body = (
        <>
          {n > 0 && <Banner tone="warn"><b>{plural(n, 'enrolment in progress', 'enrolments in progress')} will stop moving.</b> No further steps or tasks are created for them.</Banner>}
          <P>History is kept. Admins can restore it from the Archived filter on Sequences. It comes back paused (a draft if nobody was ever enrolled), and nothing sends until someone activates it.</P>
        </>
      )
    }
  } else if (kind === 'deal') {
    const d = r as Deal
    body = <P>{name} returns to the pipeline board, forecasts, reports and goals in its current stage, {Q.stage(d)?.name ?? 'a removed stage'}.</P>
  } else if (kind === 'contact') {
    body = <P>{name} returns to Contacts, search and pickers. Sequence enrolments that stopped when it was archived stay stopped; enrol again if you need to.</P>
  } else if (kind === 'company') {
    body = <P>{name} returns to Companies, search and pickers.</P>
  } else {
    const back = S.enrolments.some(e => e.seqId === id) ? 'paused' : 'as a draft'
    body = <P>{name} comes back {back}. Nothing sends until someone activates it, and enrolments that stopped stay stopped.</P>
  }

  return (
    <Modal
      title={`${archive ? 'Archive' : 'Restore'} ${name}?`}
      width={500}
      icon={archive ? 'archive' : 'refresh'}
      describedBy="archive-desc"
      closeLabel={archive ? `Keep ${noun} and close this dialog` : 'Keep archived and close this dialog'}
      footer={
        <>
          <Btn data-autofocus onClick={UI.close}>{archive ? `Keep ${noun}` : 'Keep archived'}</Btn>
          <Btn kind={archive ? 'danger' : 'pri'} icon={archive ? 'archive' : 'refresh'} onClick={go}>{archive ? `Archive ${noun}` : `Restore ${noun}`}</Btn>
        </>
      }
    >
      <div id="archive-desc" className="col" style={{ gap: 10, lineHeight: 1.55 }}>{body}</div>
    </Modal>
  )
}
