import { useState } from 'react'
import { Q } from '../../../data/Q'
import type { Sequence } from '../../../data/types'
import { Banner, Btn, Card, CtLink, Empty, FilterBar, Seg } from '../../../kit'
import { tokenNames } from '../../../data/tokens'
import { sequenceGaps } from '../../../shared/seqTokens'
import { EST } from '../../../kit/util'
import type { SeqStats } from '../../../shared/seqStats'
import { useMailState } from '../../../mail/client'
import { UI } from '../../../ui/store'
import { EnrolTable } from '../../companies/parts/EnrolTable'

const LIVE = ['active', 'awaiting_approval', 'awaiting_task']

export function SeqEnrolments({ s, st }: { s: Sequence; st: SeqStats }) {
  const [f, setF] = useState('')
  const counts: Record<string, number> = {}
  st.en.forEach(e => { counts[e.status] = (counts[e.status] ?? 0) + 1 })
  const rows = st.en.filter(e => !f || e.status === f)
  const canEnrol = Q.canEdit(s.businessId)
  const sims = useMailState().s === 'off'
  // Who is held for missing data now, and which steps will hold people later: said here, with the fix one click away.
  const held = st.en.filter(e => e.status === 'paused' && /^Held:/.test(String(e.pauseReason ?? e.reason ?? '')))
  const ahead = sequenceGaps(s)
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
          {canEnrol && sims && <Btn size="sm" icon="reply" onClick={() => UI.open('simReply', { contactId: st.en.find(e => LIVE.includes(e.status))?.contactId })}>Simulate reply</Btn>}
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
          {held.length > 0 && (
            <div style={{ padding: '10px 14px 0' }}>
              <Banner tone="warn">
                <span className="col" style={{ gap: 4 }}>
                  <b className="sm">{held.length} held for missing data</b>
                  {held.slice(0, 5).map(e => (
                    <span key={e.id} className="sm"><CtLink id={e.contactId} />: {String(e.pauseReason ?? e.reason).replace(/^Held: /, '').replace(/\{\{(\w+)\}\}/g, (_m, k: string) => tokenNames([k]).toLowerCase())}</span>
                  ))}
                  {held.length > 5 && <span className="faint xs">and {held.length - 5} more (filter by Paused).</span>}
                  <span className="faint xs">Fill in the contact, or give the variable a fallback in the step, then resume them.</span>
                </span>
              </Banner>
            </div>
          )}
          {ahead.length > 0 && (
            <div style={{ padding: '10px 14px 0' }}>
              <Banner tone="info">
                {ahead.map(a => `Step ${a.pos.i + 1}: ${[...a.gaps.byKey].map(([k, n]) => `${n} with no ${tokenNames([k]).toLowerCase()}`).join(', ')}`).join(' · ')}. They will be held at that step unless it is filled in or the variable has a fallback.
              </Banner>
            </div>
          )}
          <FilterBar>
            <Seg value={f} onChange={setF} opts={[['', 'All ' + st.en.length] as const, ...Object.entries(counts).map(([k, v]) => [k, (EST[k]?.[0] ?? k) + ' ' + v] as const)]} />
          </FilterBar>
          {rows.length ? <EnrolTable rows={rows} showContact /> : <Empty icon="search" title="No enrolments with this status" action={<Btn onClick={() => setF('')}>Clear filter</Btn>} />}
        </>
      )}
    </Card>
  )
}
