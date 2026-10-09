import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Sequence } from '../../data/types'
import { BizDot, Btn, Chip, DataTable, Empty, FilterBar, Icon, Menu, Owner, SearchInp, Seg, type Col } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { seqStats, type SeqStats } from '../../shared/seqStats'
import { UI } from '../../ui/store'

type Row = Sequence & { st: SeqStats }

const STATUS_TONE: Record<string, string> = { active: 'ok', paused: 'warn' }

export function Sequences() {
  useStore()
  const [q, setQ] = useState('')
  const [st, setSt] = useState('')
  const canCreate = Q.anyEdit()

  const visible = S.sequences.filter(s => Q.inScope(s.businessId))
  const rows: Row[] = visible
    .filter(s => (!st ? s.status !== 'archived' : s.status === st) && (!q || s.name.toLowerCase().includes(q.toLowerCase())))
    .map(s => ({ ...s, st: seqStats(s) }))

  const newSeq = (): void => UI.open('newSeq')
  const filtered = !!q || !!st

  const cols: Col<Row>[] = [
    {
      k: 'name', l: 'Sequence',
      r: s => (
        <div>
          <div className="row"><BizDot b={s.businessId} /><b>{s.name}</b></div>
          <div className="faint xs">{s.mode === 'approval' ? 'Approval required' : 'Auto-send'} · {Q.mailbox(s.mailboxId)?.address ?? 'No mailbox'}</div>
        </div>
      ),
    },
    { k: 'status', l: 'Status', r: s => <Chip tone={STATUS_TONE[s.status] ?? ''}>{s.status}</Chip> },
    { k: 'ownerId', l: 'Owner', r: s => <Owner id={s.ownerId} /> },
    { k: 'n', l: 'Steps', right: true, r: s => s.steps.length, sort: s => s.steps.length },
    { k: 'e', l: 'Enrolled', right: true, r: s => s.st.enrolled, sort: s => s.st.enrolled },
    { k: 'a', l: 'Active', right: true, r: s => s.st.active, sort: s => s.st.active },
    { k: 'c', l: 'Completed', right: true, r: s => s.st.completed, sort: s => s.st.completed },
    { k: 'rp', l: 'Replies', right: true, r: s => s.st.replies, sort: s => s.st.replies },
    { k: 'p', l: 'Positive', right: true, r: s => <span style={{ color: s.st.positive ? 'var(--ok)' : undefined }}>{s.st.positive}</span>, sort: s => s.st.positive },
    { k: 'm', l: 'Meetings', right: true, r: s => s.st.meetings, sort: s => s.st.meetings },
    { k: 'updatedAt', l: 'Updated', r: s => F.rel(s.updatedAt) },
    {
      k: 'x', l: '', nosort: true,
      r: s => Q.canEdit(s.businessId) && (
        <Menu
          align="right"
          trigger={<Btn size="xs" kind="ghost" icon="more" aria-label={'Actions for ' + s.name} />}
          items={[
            { label: 'Edit', icon: 'edit', onClick: () => UI.nav('sequence', { id: s.id }) },
            {
              label: 'Duplicate', icon: 'copy',
              onClick: () => {
                const c = Act.dupSequence(s.id)
                if (!c) return UI.toast('Could not duplicate this sequence', 'bad')
                UI.toast('Duplicated as draft')
                UI.nav('sequence', { id: c.id })
              },
            },
            s.status === 'active'
              ? { label: 'Pause', icon: 'pause', onClick: () => Act.setSeqStatus(s.id, 'paused') }
              : { label: 'Activate', icon: 'play', disabled: s.status === 'archived', onClick: () => Act.setSeqStatus(s.id, 'active') },
            { label: 'View analytics', icon: 'chart', onClick: () => UI.nav('sequence', { id: s.id, q: { tab: 'analytics' } }) },
            {
              label: 'Archive', icon: 'archive', disabled: s.status === 'archived',
              onClick: () => UI.confirm({
                title: 'Archive sequence?', body: 'Active enrolments stop progressing. History is kept.', confirm: 'Archive', danger: true,
                onConfirm: () => Act.setSeqStatus(s.id, 'archived'),
              }),
            },
          ]}
        />
      ),
    },
  ]

  const none = !visible.length
  return (
    <div className="page">
      <PageHead title="Sequences" sub="Multi-step outreach with approval rules, manual tasks and simulated execution">
        <Btn
          icon="clock" disabled={!canCreate} title={canCreate ? undefined : 'Needs edit access'}
          onClick={() => {
            Act.runSequences()
            UI.toast('Sequence engine ran for ' + F.dt(F.nowIso()))
          }}
        >
          Run due steps
        </Btn>
        <Btn kind="pri" icon="plus" disabled={!canCreate} title={canCreate ? undefined : 'Needs edit access'} onClick={newSeq}>Create sequence</Btn>
      </PageHead>
      <div className="card">
        {none ? (
          <Empty
            icon="send" title="No sequences yet"
            body={canCreate ? 'Build a multi-step sequence of emails, calls and tasks, then enrol contacts into it.' : 'No sequences have been created for your businesses yet.'}
            action={canCreate ? <Btn kind="pri" icon="plus" onClick={newSeq}>Create sequence</Btn> : undefined}
          />
        ) : (
          <>
            <FilterBar>
              <SearchInp value={q} onChange={setQ} placeholder="Search sequences" />
              <Seg value={st} onChange={setSt} opts={[['', 'All'], ['active', 'Active'], ['paused', 'Paused'], ['draft', 'Draft'], ['archived', 'Archived']]} />
            </FilterBar>
            <DataTable
              rows={rows} cols={cols} onRow={s => UI.nav('sequence', { id: s.id })}
              empty={
                <Empty
                  icon="search" title="No sequences match" body="Nothing matches the current search or status filter."
                  action={filtered ? <Btn onClick={() => { setQ(''); setSt('') }}><Icon n="x" s={13} />Clear filters</Btn> : undefined}
                />
              }
            />
          </>
        )}
      </div>
    </div>
  )
}
