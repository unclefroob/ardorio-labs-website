import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { Task } from '../../data/types'
import {
  Av, BizDot, Btn, Card, Chip, CLS_TONE, CoLink, CtLink, DataTable, Due, Empty, Icon, Kpi, Menu, Prog, TONE, type Col, type MenuItem,
} from '../../kit'
import { completeFlow } from '../../shared/moves'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'
import { safeHref } from '../companies/query'
import { RecRow } from '../reports/RecRow'

const PRIO: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const REC_ORDER: Record<string, number> = { 'Reply follow-up': 0, 'Meeting prep': 1, 'Stale deal': 2 }
const ENGAGED = ['Interested', 'Meeting Requested', 'More Information Requested', 'Referral']

function CallRow({ t }: { t: Task }) {
  const c = Q.contact(t.contactId)
  const last = c ? S.activities.filter(a => a.contactId === c.id && Q.actVisible(a) && a.id !== t.id).sort((a, b) => b.ts.localeCompare(a.ts))[0] : undefined
  const li = safeHref(c?.linkedin)
  const items: MenuItem[] = [
    { label: 'Log outcome', icon: 'check', onClick: () => UI.open('callOutcome', { taskId: t.id }) },
    { label: 'Snooze 3 hours', icon: 'clock', onClick: () => Act.snoozeTask(t.id, 3) },
    { label: 'Snooze to tomorrow', icon: 'clock', onClick: () => Act.snoozeTask(t.id, 24) },
    { label: 'Open task', icon: 'edit', onClick: () => UI.drawer('task', { id: t.id }) },
    !!t.dealId && { label: 'Go to deal', icon: 'kanban', onClick: () => UI.nav('deal', { id: t.dealId ?? undefined }) },
    !!li && { label: 'Open LinkedIn', icon: 'li', onClick: () => window.open(li, '_blank', 'noopener,noreferrer') },
    { label: 'Email instead', icon: 'mail', onClick: () => UI.open('compose', { contactId: c?.id, dealId: t.dealId }) },
    Q.canManage(t.businessId) && { label: 'Reassign', icon: 'swap', onClick: () => UI.open('reassign', { kind: 'task', id: t.id, businessId: t.businessId }) },
  ]
  return (
    <div className="row wrap" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', gap: 10 }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <b className="trunc">{c ? <CtLink id={c.id} /> : t.title}</b>
          {c && <span className="faint sm">· {c.title} · <CoLink id={c.companyId} /></span>}
        </div>
        <div className="sm muted trunc">{t.title}{t.seqId ? ' · sequence step' : ''}</div>
        {last && <div className="faint xs">Last: {last.subject ?? 'Activity'} · {F.rel(last.ts)}</div>}
      </div>
      <div className="col" style={{ gap: 2, alignItems: 'flex-end' }}>
        <span className="mono sm">{c?.phone || c?.mobile || <span className="faint">No phone</span>}</span>
        <Due t={t} />
      </div>
      <div className="row" style={{ gap: 4 }}>
        {c?.phone && <Btn size="sm" icon="phone" onClick={() => UI.open('callOutcome', { taskId: t.id })}>Call</Btn>}
        {c && !c.phone && <Btn size="sm" icon="zap" onClick={() => UI.open('enrich', { contactId: c.id })}>Find number</Btn>}
        <Menu align="right" trigger={<Btn size="sm" kind="ghost" icon="more" aria-label="More actions" />} items={items} />
      </div>
    </div>
  )
}

function EmailRow({ t }: { t: Task }) {
  const c = Q.contact(t.contactId)
  const d = t.draft
  return (
    <div className="row wrap" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', gap: 10 }}>
      <Icon n="mail" s={15} />
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <b className="trunc">{c ? <CtLink id={c.id} /> : d?.to ?? t.title}</b>
          {c && <span className="faint sm">· {c.title} · <CoLink id={c.companyId} /></span>}
        </div>
        <div className="sm muted trunc">{d?.subject ?? t.title}</div>
      </div>
      <Due t={t} />
      <Btn size="sm" kind="pri" icon="mail" onClick={() => completeFlow(t)}>Open</Btn>
    </div>
  )
}

export function MyDay() {
  const me = Q.me()
  const sc = Q.scope()
  const clock = F.nowIso()
  const today = clock.slice(0, 10)
  const h = F.now().getHours()
  const mine = S.tasks.filter(t => t.assigneeId === me.id && sc.includes(t.businessId))
  const due = mine.filter(t => !Q.done(t) && t.status !== 'Snoozed' && t.due.slice(0, 10) <= today)
  const doneToday = mine.filter(t => t.status === 'Completed' && t.completedAt?.slice(0, 10) === today)
  const emails = due.filter(t => t.kind === 'email').sort((a, b) => a.due.localeCompare(b.due))
  const calls = due.filter(t => t.type === 'Call').sort((a, b) => a.due.localeCompare(b.due))
  const overdue = mine.filter(Q.overdue)
  const od = overdue.filter(t => t.type !== 'Call' && t.kind !== 'email').sort((a, b) => (PRIO[a.priority] ?? 3) - (PRIO[b.priority] ?? 3) || a.due.localeCompare(b.due))
  const meets = S.meetings.filter(m => sc.includes(m.businessId) && m.status === 'upcoming' && (m.ownerId === me.id || me.super) && m.start >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6)
  const recs = S.recs
    .filter(r => {
      if (r.status !== 'New' || !sc.includes(r.businessId)) return false
      if (me.super) return true
      const d = Q.deal(r.dealId)
      const c = r.contactId ? Q.crel(r.contactId, r.businessId) : undefined
      return d ? d.ownerId === me.id : c ? c.ownerId === me.id : Q.canManage(r.businessId)
    })
    .sort((a, b) => (REC_ORDER[a.type] ?? 5) - (REC_ORDER[b.type] ?? 5))
    .slice(0, 5)
  const engaged = S.threads
    .filter(t => sc.includes(t.businessId) && !!t.classification && ENGAGED.includes(t.classification.cat) && F.days(t.updatedAt, clock) <= 10 && (t.ownerId === me.id || me.super || Q.canManage(t.businessId)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)
  const clicks = S.activities.filter(a => sc.includes(a.businessId) && a.type === 'link_click' && F.days(a.ts, clock) <= 7).slice(-3)
  const goals = S.goals.filter(g => g.ownerType === 'user' && g.ownerId === me.id && g.period === 'week')
  const ws = Q.wsBiz()

  const overdueCols: Col<Task>[] = [
    { k: 't', l: 'Task', r: t => <span className="row"><BizDot b={t.businessId} /><span className="trunc" style={{ maxWidth: 300 }}>{t.title}</span></span> },
    { k: 'p', l: 'Priority', r: t => <Chip tone={TONE[t.priority]}>{t.priority}</Chip> },
    { k: 'due', l: 'Due', r: t => <Due t={t} /> },
    {
      k: 'a', l: '', nosort: true,
      r: t => (
        <span className="row" style={{ gap: 4 }}>
          <Btn size="xs" icon="check" onClick={e => { e.stopPropagation(); completeFlow(t) }}>Done</Btn>
          <Btn size="xs" kind="ghost" icon="clock" aria-label="Snooze to tomorrow" onClick={e => { e.stopPropagation(); Act.snoozeTask(t.id, 24); UI.toast('Snoozed to tomorrow') }} />
        </span>
      ),
    },
  ]
  const scrollToEmails = (): void => {
    const el = document.getElementById('emails')
    const main = document.querySelector('.sos .main')
    if (el && main) main.scrollTop = el.offsetTop - 70
  }
  const nav = (view: string) => (): void => UI.nav('tasks', { q: { view, scope: 'mine' } })

  return (
    <div className="page">
      <PageHead title={`${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${me.name.split(' ')[0]}`} sub={`${F.long(clock)} · ${ws ? Q.biz(ws)?.name : 'All businesses'}`}>
        <Btn icon="spark" onClick={() => UI.nav('copilot')}>Ask Copilot</Btn>
        <Btn kind="pri" icon="plus" disabled={!Q.anyEdit()} onClick={() => UI.open('newTask')}>Task</Btn>
      </PageHead>
      <div className="grid g6" style={{ marginBottom: 16 }}>
        <Kpi label="Due today" value={due.length} onClick={nav('today')} />
        <Kpi label="Completed today" value={doneToday.length} tone="ok" onClick={nav('completed')} />
        <Kpi label="Outstanding" value={mine.filter(t => !Q.done(t)).length} onClick={nav('open')} />
        <Kpi label="Overdue" value={overdue.length} tone={overdue.length ? 'bad2' : undefined} onClick={nav('overdue')} />
        <Kpi label="Emails to send" value={emails.length} tone={emails.length ? 'warn' : undefined} onClick={scrollToEmails} />
        <Kpi label="Upcoming meetings" value={meets.length} onClick={() => UI.nav('activities', { q: { type: 'meeting_booked' } })} />
      </div>
      <div className="split">
        <div className="col" style={{ gap: 14 }}>
          <Card title="Priority actions" icon="spark" right={<><Chip icon="spark" title="Ranked by fixed rules over your records, not by an AI model">Rule-based</Chip><Btn size="sm" kind="ghost" onClick={() => UI.nav('recs')}>All</Btn></>}>
            {recs.length ? (
              <div className="col" style={{ gap: 10 }}>{recs.map(r => <RecRow key={r.id} r={r} compact />)}</div>
            ) : (
              <Empty icon="check" title="You're on top of things" body="No new recommendations for you right now." />
            )}
          </Card>
          <Card title={`Calls due (${calls.length})`} icon="phone" pad={false}>
            {calls.length ? calls.map(t => <CallRow key={t.id} t={t} />) : <Empty icon="phone" title="No calls due" body="Call tasks from sequences and follow-ups appear here." />}
          </Card>
          <Card title={`Emails to send (${emails.length})`} icon="send" pad={false}>
            <div id="emails" />
            {emails.length ? emails.map(t => <EmailRow key={t.id} t={t} />) : <Empty icon="send" title="No emails waiting" body="Email steps from your sequences appear here. SalesOS does not send them: copy, send from your mail client, then mark as sent." />}
          </Card>
          <Card title="Overdue tasks" icon="alert" pad={false}>
            {od.length ? <DataTable rows={od} cols={overdueCols} onRow={t => UI.drawer('task', { id: t.id })} page={8} /> : <Empty icon="check" title="Nothing overdue" />}
          </Card>
        </div>
        <div className="col" style={{ gap: 14 }}>
          {goals.length > 0 && (
            <Card title="This week's targets" icon="target" right={<Btn size="sm" kind="ghost" onClick={() => UI.nav('goals')}>Goals</Btn>}>
              <div className="col gap12">
                {goals.map(g => {
                  const a = Q.goalActual(g)
                  return (
                    <div key={g.id}>
                      <div className="row sm"><span className="b" style={{ textTransform: 'capitalize' }}>{g.metric === 'meetings' ? 'Meetings booked' : g.metric}</span><span className="sp" /><span className="num">{a} / {g.target}</span></div>
                      <Prog v={(a / g.target) * 100} tone={a >= g.target ? 'ok' : undefined} />
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
          <Card title="Meetings & preparation" icon="cal">
            {meets.length ? (
              <div className="col" style={{ gap: 10 }}>
                {meets.map(m => (
                  <div key={m.id} className="col" style={{ gap: 3, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                    <div className="row"><BizDot b={m.businessId} /><b className="sm trunc">{m.title}</b></div>
                    <div className="faint xs">{F.rel(m.start)} · {F.time(m.start)} · {m.duration} min · {m.type}</div>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      <Btn size="xs" icon="spark" onClick={() => UI.open('meetingBrief', { id: m.id })}>Briefing</Btn>
                      <Btn size="xs" kind="ghost" onClick={() => UI.open('logMeeting', { id: m.id })}>Notes</Btn>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty icon="cal" title="No upcoming meetings" />}
          </Card>
          <Card title="Recently engaged" icon="zap">
            {engaged.length || clicks.length ? (
              <div className="col" style={{ gap: 10 }}>
                {engaged.map(t => {
                  const c = Q.contact(t.contactId)
                  if (!c || !t.classification) return null
                  return (
                    <div key={t.id} className="row" style={{ alignItems: 'flex-start' }}>
                      <Av name={c.name} s={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sm"><CtLink id={c.id} /> <span className="faint">· {Q.company(c.companyId)?.name}</span></div>
                        <div className="row" style={{ gap: 4, marginTop: 2 }}><Chip tone={CLS_TONE(t.classification.cat)}>{t.classification.cat}</Chip><span className="faint xs">{F.rel(t.updatedAt)}</span></div>
                      </div>
                      <Btn size="xs" onClick={() => UI.nav('inbox', { id: t.id })}>Open</Btn>
                    </div>
                  )
                })}
                {clicks.map(a => (
                  <div key={a.id} className="row sm"><Icon n="link" s={13} /><CtLink id={a.contactId} /><span className="faint xs">clicked a link · {F.rel(a.ts)}</span></div>
                ))}
              </div>
            ) : <Empty icon="zap" title="No recent engagement" />}
          </Card>
        </div>
      </div>
    </div>
  )
}
