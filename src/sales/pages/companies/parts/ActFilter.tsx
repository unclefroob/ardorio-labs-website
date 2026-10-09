import { useState, type FC } from 'react'
import type { Activity } from '../../../data/types'
import { Empty, Timeline } from '../../../kit'

export interface ActFilterProps { items: Activity[] }

const GROUPS: ReadonlyArray<readonly [key: string, label: string, types: readonly string[] | null]> = [
  ['all', 'All', null],
  ['emails', 'Emails', ['email_out', 'email_in', 'email_open', 'bounce']],
  ['calls', 'Calls', ['call']],
  ['meetings', 'Meetings', ['meeting', 'meeting_booked']],
  ['notes', 'Notes', ['note']],
  ['tasks', 'Tasks', ['task_done']],
  ['deals', 'Deals', ['stage', 'won', 'lost']],
  ['ai', 'AI & research', ['research', 'ai_accepted', 'enriched']],
  ['linkedin', 'LinkedIn', ['linkedin_conn', 'linkedin_msg', 'linkedin_reply']],
  ['sequences', 'Sequences', ['seq_enrolled', 'seq_paused', 'seq_done', 'suppressed']],
]

export const ActFilter: FC<ActFilterProps> = ({ items }) => {
  const [f, setF] = useState('all')
  const count = (types: readonly string[] | null): number => (types ? items.filter(a => types.includes(a.type)).length : items.length)
  const active = GROUPS.find(g => g[0] === f)?.[2] ?? null
  const rows = active ? items.filter(a => active.includes(a.type)) : items
  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 14, gap: 4 }} role="group" aria-label="Filter activity by type">
        {GROUPS.map(([k, label, types]) => (
          <button key={k} type="button" className={'btn xs' + (f === k ? ' pri' : '')} aria-pressed={f === k} onClick={() => setF(k)}>
            {label} <span style={{ opacity: 0.7 }}>{count(types)}</span>
          </button>
        ))}
      </div>
      {items.length > 0 && rows.length === 0 ? (
        <Empty icon="filter" title="No activity of this type" body="Other activity exists for this record." action={<button type="button" className="btn sm" onClick={() => setF('all')}>Clear filters</button>} />
      ) : (
        <Timeline items={rows} />
      )}
    </div>
  )
}
