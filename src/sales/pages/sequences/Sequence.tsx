import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { isRevoked, useStore } from '../../data/store'
import { Banner, BizChip, Btn, Chip, Empty, Link, Owner, Tabs } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { seqStats } from '../../shared/seqStats'
import { UI, type Route } from '../../ui/store'
import { Builder } from './parts/Builder'
import { clone, type Draft } from './parts/conds'
import { SeqAnalytics } from './parts/SeqAnalytics'
import { SeqEnrolments } from './parts/SeqEnrolments'
import { SeqSettings } from './parts/SeqSettings'

const TABS = ['steps', 'enrolments', 'analytics', 'settings']
const STATUS_TONE: Record<string, string> = { active: 'ok', paused: 'warn' }

export function Sequence({ route }: { route: Route }) {
  useStore()
  const s: Draft | undefined = Q.seq(route.id)
  const q0 = route.q?.tab
  const [tab, setTab] = useState(typeof q0 === 'string' && TABS.includes(q0) ? q0 : 'steps')
  const [dr, setDr] = useState<Draft | null>(() => (s ? clone(s) : null))
  const [base, setBase] = useState(() => (s ? JSON.stringify(s) : ''))
  const [sel, setSel] = useState(0)

  const live = s ? JSON.stringify(s) : ''
  const dirty = !!s && !!dr && JSON.stringify(dr) !== base
  const staleBase = !!s && live !== base
  if (s && staleBase && !dirty) {
    setBase(live)
    setDr(clone(s))
  }

  const back = (
    <Btn onClick={() => UI.nav('sequences')}>Back to sequences</Btn>
  )
  if (!s || !Q.member(s.businessId)) {
    const revoked = !s && isRevoked('sequences', route.id)
    return (
      <div className="page">
        <Empty icon={revoked ? 'lock' : 'send'} title={revoked ? 'You no longer have access to this record' : 'Sequence not found or restricted'} body={revoked ? 'Your access changed, so it has been removed from your view. Ask an administrator if you think that is a mistake.' : 'It may have been removed, or it belongs to a business you are not a member of.'} action={back} />
      </div>
    )
  }
  if (!dr) return null

  const can = Q.canEdit(s.businessId) && (s.shared || s.ownerId === Q.me().id || Q.canManage(s.businessId))
  const st = seqStats(s)
  const failed = st.en.filter(e => e.status === 'failed')
  const upd = (p: Partial<Draft>): void => setDr({ ...dr, ...p })
  const discard = (): void => {
    setDr(clone(s))
    setBase(live)
  }
  const save = (): void => {
    if (!can) return
    const versions = (s.versions ?? []).concat({ n: (s.versions ?? []).length + 1, ts: F.nowIso(), by: Q.me().id, steps: s.steps.length })
    const input: Draft = { ...dr, versions }
    const saved: Draft = Act.saveSequence(input)
    const next: Draft = clone(saved)
    setDr(next)
    setBase(JSON.stringify(saved))
    UI.toast('Sequence saved · version ' + (versions.length + 1))
  }
  const activate = (): void => {
    const bad = s.steps.filter(x => x.type === 'email' && (!x.subject || !x.body))
    if (bad.length) return UI.toast('Complete subject and body for all email steps first', 'bad')
    if (!s.steps.length) return UI.toast('Add at least one step first', 'bad')
    Act.setSeqStatus(s.id, 'active')
    UI.toast('Sequence active')
  }

  return (
    <div className="page" style={{ maxWidth: 1300 }}>
      <PageHead
        crumb={[<Link key="s" to="sequences">Sequences</Link>]}
        title={s.name}
        sub={
          <span className="row wrap" style={{ gap: 8 }}>
            <BizChip b={s.businessId} />
            <Chip tone={STATUS_TONE[s.status] ?? ''}>{s.status}</Chip>
            <span>Emails are sent by hand from a task</span>·<span>{Q.mailbox(s.mailboxId)?.address ?? 'No mailbox'}</span>·<Owner id={s.ownerId} s={18} />
          </span>
        }
      >
        {can && dirty && (
          <>
            <Btn onClick={discard}>Discard</Btn>
            <Btn kind="pri" icon="check" onClick={save}>Save changes</Btn>
          </>
        )}
        {can && !dirty && (s.status === 'active' ? <Btn icon="pause" onClick={() => Act.setSeqStatus(s.id, 'paused')}>Pause</Btn> : s.status !== 'archived' && <Btn kind="pri" icon="play" onClick={activate}>Activate</Btn>)}
        {can && <Btn icon="send" disabled={s.status !== 'active' || dirty} title={s.status !== 'active' ? 'Activate the sequence to enrol' : dirty ? 'Save your changes first' : undefined} onClick={() => UI.open('enrol', { seqId: s.id })}>Enrol contacts</Btn>}
      </PageHead>
      {!can && <Banner icon="lock">You have read-only access to this sequence.</Banner>}
      {dirty && staleBase && <Banner tone="warn">This sequence was changed elsewhere while you were editing. Saving will overwrite those changes.</Banner>}
      {failed.length > 0 && (
        <Banner tone="bad" action={<Btn size="sm" onClick={() => setTab('enrolments')}>Review</Btn>}>
          {failed.length} enrolment(s) failed — {failed[0].reason || 'no reason recorded'}.
        </Banner>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[['steps', 'Steps', dr.steps.length], ['enrolments', 'Enrolments', st.enrolled], ['analytics', 'Analytics'], ['settings', 'Settings']]} />
      {tab === 'steps' && <Builder dr={dr} upd={upd} sel={sel} setSel={setSel} can={can} />}
      {tab === 'enrolments' && <SeqEnrolments s={s} st={st} />}
      {tab === 'analytics' && <SeqAnalytics s={s} st={st} />}
      {tab === 'settings' && <SeqSettings dr={dr} upd={upd} can={can} s={s} />}
    </div>
  )
}

