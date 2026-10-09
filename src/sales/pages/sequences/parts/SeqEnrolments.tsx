import { useState } from 'react'
import { Q } from '../../../data/Q'
import type { Sequence } from '../../../data/types'
import { Btn, Card, Empty, FilterBar, Seg } from '../../../kit'
import { EST } from '../../../kit/util'
import type { SeqStats } from '../../../shared/seqStats'
import { UI } from '../../../ui/store'
import { EnrolTable } from '../../companies/parts/EnrolTable'

const LIVE = ['active', 'awaiting_approval', 'awaiting_task']

export function SeqEnrolments({ s, st }: { s: Sequence; st: SeqStats }) {
  const [f, setF] = useState('')
  const counts: Record<string, number> = {}
  st.en.forEach(e => { counts[e.status] = (counts[e.status] ?? 0) + 1 })
  const rows = st.en.filter(e => !f || e.status === f)
  const canEnrol = Q.canEdit(s.businessId)
  const enrolBtn = canEnrol && (
    <Btn kind="pri" icon="plus" disabled={s.status !== 'active'} title={s.status !== 'active' ? 'Activate the sequence to enrol' : undefined} onClick={() => UI.open('enrol', { seqId: s.id })}>
      Enrol contacts
    </Btn>
  )
  return (
    <Card
      pad={false} title="Enrolments"
      right={st.en.length > 0 && (
        <>
          {canEnrol && <Btn size="sm" icon="reply" onClick={() => UI.open('simReply', { contactId: st.en.find(e => LIVE.includes(e.status))?.contactId })}>Simulate reply</Btn>}
          {canEnrol && <Btn size="sm" kind="pri" icon="plus" disabled={s.status !== 'active'} onClick={() => UI.open('enrol', { seqId: s.id })}>Enrol</Btn>}
        </>
      )}
    >
      {st.en.length === 0 ? (
        <Empty
          icon="users" title="No contacts enrolled" body={s.status === 'active' ? 'Enrol contacts to start this sequence.' : 'Activate this sequence, then enrol contacts to start it.'}
          action={enrolBtn || undefined}
        />
      ) : (
        <>
          <FilterBar>
            <Seg value={f} onChange={setF} opts={[['', 'All ' + st.en.length] as const, ...Object.entries(counts).map(([k, v]) => [k, (EST[k]?.[0] ?? k) + ' ' + v] as const)]} />
          </FilterBar>
          {rows.length ? <EnrolTable rows={rows} showContact /> : <Empty icon="search" title="No enrolments with this status" action={<Btn onClick={() => setF('')}>Clear filter</Btn>} />}
        </>
      )}
    </Card>
  )
}
