import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Deal as DealRec, Thread } from '../../data/types'
import { Banner, BizChip, Btn, Card, Chip, CLS_TONE, CoLink, Due, Empty, Fld, Icon, Kpi, Menu, Owner, Tabs, TONE } from '../../kit'
import { DealFieldInput } from '../../shared/forms'
import { tryMove } from '../../shared/moves'
import { PageHead } from '../../shared/PageHead'
import type { Route } from '../../ui/store'
import { UI } from '../../ui/store'
import { ActFilter } from '../companies/parts/ActFilter'
import { Notes } from '../companies/parts/Notes'
import { planLabel } from '../../data/rosterio'
import { RosterioCard } from './RosterioCard'
import { TaskTable } from '../companies/parts/TaskTable'
import { Commercials } from './Commercials'
import { DealAI } from './DealAI'
import { LinkBtn } from './LinkBtn'
import { Stakeholders } from './Stakeholders'
import { Link } from '../../kit'

type Fields = DealRec['fields']

function fieldText(v: unknown): string {
  return v == null || v === '' || v === false ? '—' : String(v)
}

function ThreadRow({ t }: { t: Thread }) {
  const ok = Q.threadBody(t)
  return (
    <button
      type="button"
      className="row"
      style={{ width: '100%', padding: '10px 14px', border: 0, borderBottom: '1px solid var(--line)', background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
      onClick={() => UI.nav('inbox', { id: t.id })}
    >
      <Icon n={t.visibility === 'private' ? 'lock' : 'mail'} s={14} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <b className="sm">{ok ? t.subject : 'Private conversation (restricted)'}</b>
        <span className="faint xs" style={{ display: 'block' }}>
          {Q.contact(t.contactId)?.name} · {Q.mailbox(t.mailboxId)?.address} · {F.rel(t.updatedAt)}
        </span>
      </span>
      {t.classification && ok && <Chip tone={CLS_TONE(t.classification.cat)}>{t.classification.cat}</Chip>}
    </button>
  )
}

export function Deal({ route }: { route: Route }) {
  useStore()
  const d = route.id ? Q.deal(route.id) : undefined
  const qTab = route.q?.tab
  const [tab, setTab] = useState(typeof qTab === 'string' ? qTab : 'overview')
  const [ef, setEf] = useState<Fields | null>(null)

  if (!d) {
    return (
      <div className="page">
        <Empty icon="kanban" title="Deal not found" body="This deal may have been deleted, or the link is out of date." action={<Btn onClick={() => UI.nav('deals')}>Back to deals</Btn>} />
      </div>
    )
  }
  if (!Q.member(d.businessId)) {
    return (
      <div className="page">
        <Empty
          icon="lock"
          title="Restricted deal"
          body={'This deal belongs to ' + (Q.biz(d.businessId)?.name ?? 'another business') + '. You can see that a relationship exists, but not its commercial details or correspondence.'}
          action={<Btn onClick={() => UI.nav('company', { id: d.companyId })}>Open company</Btn>}
        />
      </div>
    )
  }

  const pl = Q.pipeline(d.businessId)
  const st = Q.stage(d)
  const si = pl.stages.findIndex(s => s.id === d.stageId)
  const co = Q.company(d.companyId)
  const can = Q.canEdit(d.businessId)
  const rk = Q.risk(d)
  const bizName = Q.biz(d.businessId)?.name ?? ''
  const acts = Q.activities().filter(a => a.dealId === d.id).sort((a, b) => b.ts.localeCompare(a.ts))
  const tasks = Q.tasks().filter(t => t.dealId === d.id)
  const ths = Q.threads().filter(t => t.dealId === d.id || (t.companyId === d.companyId && t.businessId === d.businessId && !t.dealId))
  const meets = S.meetings.filter(m => m.dealId === d.id)
  const nt = Q.nextTask(d)
  const fields: Fields = ef ?? d.fields
  const setFld = (k: string, v: unknown): void => setEf({ ...fields, [k]: v })
  const newTask = (): void => UI.open('newTask', { businessId: d.businessId, companyId: d.companyId, dealId: d.id, contactId: d.primaryContact || '' })

  return (
    <div className="page">
      <PageHead
        crumb={[<Link key="d" to="deals">Deals</Link>, <CoLink key="c" id={d.companyId} />]}
        title={d.title}
        sub={
          <span className="row wrap" style={{ gap: 8 }}>
            <BizChip b={d.businessId} />
            {co && <CoLink id={co.id} />}·<span>{pl.name}</span>·<Owner id={d.ownerId} s={18} />
            {Q.canManage(d.businessId) && <Btn size="xs" kind="ghost" onClick={() => UI.open('reassign', { kind: 'deal', id: d.id, businessId: d.businessId })}>Reassign</Btn>}
          </span>
        }
      >
        {can && d.status === 'open' && (
          <>
            <Btn icon="star" onClick={() => UI.open('won', { id: d.id })}>Mark won</Btn>
            <Btn kind="danger" onClick={() => UI.open('lost', { id: d.id })}>Mark lost</Btn>
          </>
        )}
        {can && d.status !== 'open' && (
          <Btn icon="refresh" onClick={() => { Act.reopenDeal(d.id); UI.toast('Deal reopened') }}>Reopen</Btn>
        )}
      </PageHead>
      <div className="grid g6" style={{ marginBottom: 12 }}>
        <Kpi label="Value" value={F.money(d.value)} sub={d.recurring ? 'Annual' : 'Project'} onClick={() => setTab('commercials')} />
        {d.mrr ? (
          <Kpi label="MRR" value={F.money(d.mrr)} sub={F.money(d.mrr * 12) + ' ARR'} onClick={() => setTab('commercials')} />
        ) : (
          <Kpi label="Weighted" value={F.money(Q.weighted(d))} onClick={() => setTab('commercials')} />
        )}
        <Kpi label="Stage" value={st?.name ?? 'Removed stage'} sub={'For ' + F.days(d.stageChangedAt, F.nowIso()) + ' days'} onClick={() => setTab('overview')} />
        <Kpi label="Probability" value={d.probability + '%'} sub={d.forecast} onClick={() => setTab('commercials')} />
        <Kpi
          label="Expected close"
          value={F.date(d.close)}
          tone={d.status === 'open' && d.close < F.today() ? 'bad2' : undefined}
          sub={d.status === 'open' ? F.rel(d.close + 'T17:00') : d.status}
          onClick={() => setTab('commercials')}
        />
        <Kpi label="Last activity" value={F.rel(d.lastActivity)} onClick={() => setTab('activity')} />
      </div>
      <div className="stagebar" style={{ marginBottom: 12 }}>
        {pl.stages.filter(s => !s.lost).map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={s.id === d.stageId ? 'cur' : i < si || d.status === 'won' ? 'done' : ''}
            onClick={() => tryMove(d.id, s.id)}
            disabled={!can}
            title={s.name + ' · ' + s.prob + '%' + (s.required.length ? ' · requires ' + s.required.length + ' field(s)' : '')}
          >
            {s.name}
          </button>
        ))}
      </div>
      {d.status === 'lost' && <Banner tone="bad">Closed lost — {d.lostReason}{d.lostNotes ? ': ' + d.lostNotes : ''}</Banner>}
      {d.status === 'won' && <Banner tone="ok">Closed won {F.date(d.closedAt)} · {F.money(d.value)}{d.revenueType ? ' · ' + d.revenueType : ''}</Banner>}
      {rk && d.status === 'open' && (
        <Banner tone={rk.level === 'high' ? 'bad' : 'warn'} action={<Btn size="sm" onClick={() => setTab('ai')}>See insights</Btn>}>
          <b>{rk.level === 'high' ? 'At risk' : 'Watch'}:</b> {rk.reasons.join(' · ')}
        </Banner>
      )}
      {can && (
        <div className="row wrap" style={{ gap: 6, margin: '12px 0 14px' }}>
          <Menu
            trigger={<Btn size="sm" icon="activity" iconRight="down">Log activity</Btn>}
            items={[
              { label: 'Log call', icon: 'phone', onClick: () => UI.open('logCall', { contactId: d.primaryContact, dealId: d.id, businessId: d.businessId }) },
              { label: 'Log meeting', icon: 'users', onClick: () => UI.open('logMeeting', { dealId: d.id }) },
              { label: 'Schedule meeting', icon: 'cal', onClick: () => UI.open('logMeeting', { dealId: d.id, status: 'upcoming' }) },
              { label: 'LinkedIn activity', icon: 'li', onClick: () => UI.open('linkedin', { contactId: d.primaryContact, businessId: d.businessId }) },
              { label: 'Add note', icon: 'note', onClick: () => setTab('notes') },
            ]}
          />
          <Btn size="sm" icon="mail" onClick={() => UI.open('compose', { contactId: d.primaryContact, dealId: d.id, businessId: d.businessId })}>Send email</Btn>
          <Btn size="sm" icon="checksq" onClick={newTask}>Add task</Btn>
          <Btn size="sm" icon="user" onClick={() => setTab('people')}>Add contact</Btn>
          <Menu
            trigger={<Btn size="sm" icon="kanban" iconRight="down">Change stage</Btn>}
            items={pl.stages.filter(s => s.id !== d.stageId).map(s => ({ label: s.name, right: s.prob + '%', onClick: () => tryMove(d.id, s.id) }))}
          />
          <Btn size="sm" icon="dollar" onClick={() => setTab('commercials')}>Edit value</Btn>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['overview', 'Overview'],
          ['people', 'Stakeholders', d.contactIds.length],
          ['activity', 'Activity', acts.length],
          ['tasks', 'Tasks', tasks.filter(t => !Q.done(t)).length],
          ['notes', 'Notes', (d.notes || []).length],
          ['emails', 'Emails', ths.length],
          ['ai', 'Insights'],
          ['commercials', 'Commercials'],
        ]}
      />
      {tab === 'overview' && (
        <div className="split">
          <div className="col" style={{ gap: 14 }}>
            <Card title="Description / scope">
              {d.description ? <div className="sm" style={{ whiteSpace: 'pre-wrap' }}>{d.description}</div> : <div className="faint sm">No scope summary yet.</div>}
              {can && (
                <Btn size="xs" kind="ghost" icon="edit" style={{ marginTop: 8 }} onClick={() => UI.ask(v => { if (v != null) Act.updateDeal(d.id, { description: v }) }, 'Scope summary', d.description)}>Edit</Btn>
              )}
            </Card>
            <Card
              title={bizName + ' fields'}
              right={can && ef && (
                <>
                  <Btn size="sm" onClick={() => setEf(null)}>Cancel</Btn>
                  <Btn size="sm" kind="pri" onClick={() => { Act.updateDeal(d.id, { fields: ef }); setEf(null); UI.toast('Deal fields saved') }}>Save</Btn>
                </>
              )}
            >
              {pl.fields.some(f => f.active) ? (
                <div className="grid g2">
                  {pl.fields.filter(f => f.active).map(fd => {
                    const v = fields[fd.key]
                    return (
                      <Fld key={fd.key} label={fd.label}>
                        {can ? (
                          <DealFieldInput fd={fd} value={v} onChange={nv => setFld(fd.key, nv)} companyId={d.companyId} />
                        ) : (
                          <div className="sm">
                            {fd.type === 'contact' ? Q.contact(typeof v === 'string' ? v : '')?.name ?? '—' : fd.type === 'boolean' ? (v ? 'Yes' : 'No') : fd.type === 'currency' && v ? F.money(Number(v)) : fd.key === 'plan' ? planLabel(v) || '—' : fieldText(v)}
                          </div>
                        )}
                      </Fld>
                    )
                  })}
                </div>
              ) : (
                <div className="faint sm">No custom fields are configured for this pipeline.</div>
              )}
            </Card>
          </div>
          <div className="col" style={{ gap: 14 }}>
            <Card title="Next step">
              {nt ? (
                <div>
                  <LinkBtn className="b sm" onClick={() => UI.drawer('task', { id: nt.id })}>{nt.title}</LinkBtn>
                  <div className="sm"><Due t={nt} /> · <Owner id={nt.assigneeId} s={16} /></div>
                </div>
              ) : (
                <Banner tone="warn" action={can && <Btn size="sm" onClick={newTask}>Add</Btn>}>No next step scheduled.</Banner>
              )}
            </Card>
            {d.businessId === 'ros' && <RosterioCard companyId={d.companyId} dealId={d.id} />}
            <Card title="Details">
              <dl className="dl" style={{ gridTemplateColumns: '110px 1fr' }}>
                <dt>Deal type</dt><dd>{d.type}</dd>
                <dt>Lead source</dt><dd>{d.source}</dd>
                <dt>Priority</dt><dd><Chip tone={TONE[d.priority]}>{d.priority}</Chip></dd>
                <dt>Created</dt><dd>{F.date(d.createdAt)}</dd>
                <dt>Stage changed</dt><dd>{F.dt(d.stageChangedAt)}</dd>
              </dl>
            </Card>
            <Card title="Stage history">
              {d.stageHistory.length ? (
                d.stageHistory.slice().reverse().map((h, i) => (
                  <div key={h.ts + h.stageId} className="row sm" style={{ padding: '3px 0' }}>
                    <span className="dot" style={{ background: i === 0 ? 'var(--acc)' : 'var(--line2)' }} />
                    {pl.stages.find(s => s.id === h.stageId)?.name ?? 'Removed stage'}
                    <span className="sp" />
                    <span className="faint xs">{F.date(h.ts)}</span>
                  </div>
                ))
              ) : (
                <div className="faint sm">No stage changes recorded.</div>
              )}
            </Card>
            {meets.length > 0 && (
              <Card title="Meetings">
                {meets.map(m => (
                  <div key={m.id} className="sm" style={{ padding: '4px 0' }}>
                    <LinkBtn onClick={() => UI.open(m.status === 'upcoming' ? 'meetingBrief' : 'logMeeting', { id: m.id })}>{m.title}</LinkBtn>
                    <div className="faint xs">{F.dt(m.start)} · {m.status}</div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>
      )}
      {tab === 'people' && <Stakeholders d={d} />}
      {tab === 'activity' && <Card><ActFilter items={acts} /></Card>}
      {tab === 'tasks' && (
        <Card pad={false} title="Tasks" right={can && <Btn size="sm" icon="plus" onClick={newTask}>Task</Btn>}>
          <TaskTable rows={tasks} />
        </Card>
      )}
      {tab === 'notes' && <Notes kind="deal" id={d.id} b={d.businessId} notes={d.notes} />}
      {tab === 'emails' && (
        <Card pad={false}>
          {ths.length ? ths.map(t => <ThreadRow key={t.id} t={t} />) : <Empty icon="mail" title="No emails linked" body="Emails with this company's contacts will appear here once a mailbox is connected and messages are sent or received." />}
        </Card>
      )}
      {tab === 'ai' && <DealAI d={d} />}
      {tab === 'commercials' && <Commercials d={d} />}
    </div>
  )
}
