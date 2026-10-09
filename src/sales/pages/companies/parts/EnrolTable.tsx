import type { FC } from 'react'
import { Act } from '../../../data/Act'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import type { Enrolment } from '../../../data/types'
import { Btn, BizDot, CtLink, DataTable, Empty, EnrolChip, Link, Menu, Owner, type Col, type MenuItem } from '../../../kit'
import { UI } from '../../../ui/store'

export interface EnrolTableProps { rows: Enrolment[]; showSeq?: boolean; showContact?: boolean; onSim?: (e: Enrolment) => void }

const PAUSABLE = ['active', 'awaiting_approval', 'awaiting_task']
const FINISHED = ['removed', 'completed', 'unsubscribed', 'bounced']

function menuFor(e: Enrolment, onSim?: (e: Enrolment) => void): MenuItem[] {
  const sim = (fn: () => void): (() => void) => () => { fn(); onSim?.(e) }
  return [
    PAUSABLE.includes(e.status) && { label: 'Pause', icon: 'pause', onClick: () => Act.setEnrol(e.id, 'paused', 'Paused manually') },
    e.status === 'paused' && { label: 'Resume', icon: 'play', onClick: () => { Act.setEnrol(e.id, 'active'); UI.toast('Resumed') } },
    e.status === 'replied' && {
      label: 'Resume after review', icon: 'play',
      onClick: () => UI.confirm({
        title: 'Resume outreach after reply?',
        body: 'This contact replied. Resuming will continue automated steps. Only do this if the reply was reviewed and further outreach is appropriate.',
        confirm: 'Resume',
        onConfirm: () => Act.setEnrol(e.id, 'active', 'Resumed after review'),
      }),
    },
    !FINISHED.includes(e.status) && { label: 'Remove from sequence', icon: 'x', onClick: () => Act.setEnrol(e.id, 'removed', 'Manually removed') },
    '-',
    { label: 'Simulate reply', icon: 'reply', onClick: sim(() => UI.open('simReply', { contactId: e.contactId, enrolmentId: e.id })) },
    { label: 'Simulate email open', icon: 'eye', onClick: sim(() => { Act.simEvent('email_open', e.contactId); UI.toast('Open logged — informational only') }) },
    { label: 'Simulate link click', icon: 'link', onClick: sim(() => { Act.simEvent('link_click', e.contactId); UI.toast('Link click logged') }) },
    { label: 'Simulate meeting booked', icon: 'cal', onClick: sim(() => { Act.simEvent('meeting_booked', e.contactId); UI.toast('Meeting booked — enrolment completed') }) },
  ]
}

export const EnrolTable: FC<EnrolTableProps> = ({ rows, showSeq, showContact, onSim }) => {
  const cols: Array<Col<Enrolment> | false> = [
    !!showContact && {
      k: 'c', l: 'Contact',
      r: e => (
        <div>
          <CtLink id={e.contactId} />
          <div className="faint xs">{Q.company(Q.contact(e.contactId)?.companyId)?.name ?? ''}</div>
        </div>
      ),
      sort: e => Q.contact(e.contactId)?.name,
    },
    !!showSeq && {
      k: 's', l: 'Sequence',
      r: e => (
        <span className="row">
          <BizDot b={e.businessId} />
          <Link to="sequence" id={e.seqId}>{Q.seq(e.seqId)?.name ?? 'Deleted sequence'}</Link>
        </span>
      ),
    },
    {
      k: 'status', l: 'Status',
      r: e => (
        <div>
          <EnrolChip s={e.status} />
          {e.reason && <div className="faint xs" style={{ marginTop: 2, maxWidth: 220, whiteSpace: 'normal' }}>{e.reason}</div>}
        </div>
      ),
    },
    { k: 'step', l: 'Step', r: e => { const n = Q.seq(e.seqId)?.steps.length ?? 0; return Math.min(e.stepIdx + 1, n) + ' / ' + n }, sort: e => e.stepIdx },
    { k: 'next', l: 'Next due', r: e => (e.nextDue ? F.rel(e.nextDue) : '—'), sort: e => e.nextDue },
    { k: 'own', l: 'Owner', r: e => <Owner id={e.ownerId} /> },
    { k: 'start', l: 'Started', r: e => F.date(e.startedAt) },
    {
      k: 'a', l: '', nosort: true,
      r: e => Q.canEdit(e.businessId) && <Menu align="right" trigger={<Btn size="xs" kind="ghost" icon="more" aria-label="Enrolment actions" />} items={menuFor(e, onSim)} />,
    },
  ]
  return (
    <DataTable
      rows={rows}
      empty={<Empty icon="send" title="No sequence enrolments" body="Enrol eligible contacts from a contact, list or this sequence." />}
      cols={cols.filter((c): c is Col<Enrolment> => !!c)}
    />
  )
}
