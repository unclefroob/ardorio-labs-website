import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Task, TaskStatus } from '../../data/types'
import { Av, BizDot, Btn, Card, Chip, Due, Empty, Icon, Menu, SearchInp, Seg, Sel, TONE, Tabs, type TabDef } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { completeFlow } from '../../shared/moves'
import { UI, type Route } from '../../ui/store'
import { TaskTable } from '../companies/parts/TaskTable'
import { str } from './parts/util'

const TYPES = ['Call', 'Email', 'LinkedIn Activity', 'Meeting Preparation', 'Follow-up', 'Proposal', 'Research', 'Administrative', 'General']
const PRIORITIES = ['High', 'Medium', 'Low']
const STATUSES: TaskStatus[] = ['Not Started', 'In Progress', 'Snoozed', 'Completed']
const VIEWS = ['mine', 'today', 'overdue', 'upcoming', 'completed', 'team', 'all'] as const
type View = (typeof VIEWS)[number]
const isView = (v: unknown): v is View => VIEWS.some(x => x === v)

const EMPTY_BODY: Record<View, string> = {
  mine: 'Nothing is assigned to you right now.',
  today: 'Nothing is due today.',
  overdue: 'Nothing is overdue.',
  upcoming: 'Nothing is scheduled after today.',
  completed: 'No tasks have been completed yet.',
  team: 'No open tasks are assigned to other people.',
  all: 'No tasks match.',
}

type Intel = [tone: string, text: string, fn: () => void]

export function Tasks({ route }: { route: Route }) {
  useStore()
  const me = Q.me()
  const q0 = route.q ?? {}
  const mgr = Q.anyManage()
  const v0 = isView(q0.view) ? q0.view : 'mine'
  const [view0, setView] = useState<View>(v0 === 'team' && !mgr ? 'mine' : v0)
  const view: View = view0 === 'team' && !mgr ? 'mine' : view0
  const [mode, setMode] = useState('list')
  const [ty, setTy] = useState('')
  const [pri, setPri] = useState('')
  const [q, setQ] = useState(str(q0.search))
  const [wk, setWk] = useState(0)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const today = F.today()
  const scoped = Q.tasks()
  const mineOnly = q0.scope === 'mine'
  const V: Record<View, (t: Task) => boolean> = {
    mine: t => t.assigneeId === me.id && !Q.done(t),
    today: t => !Q.done(t) && t.due.slice(0, 10) === today,
    overdue: Q.overdue,
    upcoming: t => !Q.done(t) && t.due.slice(0, 10) > today,
    completed: t => t.status === 'Completed',
    team: t => t.assigneeId !== me.id && !Q.done(t),
    all: () => true,
  }
  const base = scoped.filter(t => (!ty || t.type === ty) && (!pri || t.priority === pri) && (!q || t.title.toLowerCase().includes(q.toLowerCase())))
  const rows = base
    .filter(V[view])
    .filter(t => (view === 'mine' || view === 'team' || view === 'all' ? true : mineOnly ? t.assigneeId === me.id : true))
    .sort((a, b) => Number(Q.done(a)) - Number(Q.done(b)) || a.due.localeCompare(b.due))
  const filtered = !!(ty || pri || q)
  const clear = (): void => { setTy(''); setPri(''); setQ('') }
  const overdueAll = scoped.filter(Q.overdue).length

  const my = scoped.filter(t => t.assigneeId === me.id)
  const intel: Intel[] = []
  const odh = my.filter(t => Q.overdue(t) && t.priority === 'High')
  if (odh.length) intel.push(['bad', `${odh.length} high-priority task${odh.length > 1 ? 's are' : ' is'} overdue`, () => { setView('overdue'); setPri('High') }])
  const nn = Q.deals().filter(d => d.status === 'open' && d.ownerId === me.id && !S.tasks.some(t => t.dealId === d.id && !Q.done(t)))
  if (nn.length) intel.push(['warn', `${nn.length} of your open deals ${nn.length > 1 ? 'have' : 'has'} no next action`, () => UI.nav('recs', { q: { type: 'No next step' } })])
  const pr = S.threads.filter(t => Q.inScope(t.businessId) && t.assigneeId === me.id && t.needsReply && ['Interested', 'Meeting Requested'].includes(t.classification?.cat ?? ''))
  if (pr.length) intel.push(['ok', `${pr.length} positive repl${pr.length > 1 ? 'ies await' : 'y awaits'} follow-up`, () => UI.nav('inbox', { q: { folder: 'positive' } })])
  const byC = my.filter(t => !Q.done(t) && t.contactId).reduce<Record<string, number>>((m, t) => {
    const k = t.contactId ?? ''
    m[k] = (m[k] ?? 0) + 1
    return m
  }, {})
  const multi = Object.entries(byC).filter(([, n]) => n >= 3)
  if (multi.length) intel.push(['info', `${multi.length} contact${multi.length > 1 ? 's have' : ' has'} 3+ open tasks, consider consolidating (${multi.slice(0, 2).map(([c]) => Q.contact(c)?.name ?? '').join(', ')})`, () => setView('mine')])
  const nowMs = F.now().getTime()
  const soon = my.filter(t => !Q.done(t) && !Q.overdue(t) && F.d(t.due).getTime() - nowMs < 4 * 36e5 && F.d(t.due).getTime() > nowMs)
  if (soon.length) intel.push(['warn', `${soon.length} task${soon.length > 1 ? 's are' : ' is'} due within 4 hours`, () => setView('today')])

  const ws = F.addDays(F.weekStart(), wk * 7)
  const days = Array.from({ length: 7 }, (_, i) => F.addDays(ws, i).slice(0, 10))

  const moveTo = (id: string, s: TaskStatus): void => {
    const t = Q.task(id)
    if (!t || t.status === s || !UI.guard(t.businessId, 'Updating tasks')) return
    if (s === 'Completed') completeFlow(t)
    else if (s === 'Snoozed') Act.snoozeTask(id, 24)
    else Act.updateTask(id, { status: s })
  }

  const tabs: TabDef[] = [
    ['mine', 'My tasks', scoped.filter(V.mine).length],
    ['today', 'Today', scoped.filter(V.today).length],
    ['overdue', 'Overdue', overdueAll],
    ['upcoming', 'Upcoming'],
    ['completed', 'Completed'],
    ...(mgr ? [['team', 'Team tasks'] as const] : []),
    ['all', 'All authorised'],
  ]

  const canNew = Q.anyEdit()
  const newTask = (): void => UI.open('newTask')

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHead title="Tasks" sub={`${rows.length} task${rows.length === 1 ? '' : 's'} · ${overdueAll} overdue in scope`}>
        {scoped.length > 0 && <Seg value={mode} onChange={setMode} opts={[['list', 'List', 'list'], ['board', 'Board', 'kanban'], ['cal', 'Calendar', 'cal']]} />}
        <Btn kind="pri" icon="plus" disabled={!canNew} onClick={newTask}>New task</Btn>
      </PageHead>
      {scoped.length === 0 ? (
        <Card>
          <Empty
            icon="checksq" title="No tasks yet"
            body="Tasks come from calls to make, follow-ups, sequence steps and anything you add yourself."
            action={<Btn kind="pri" icon="plus" disabled={!canNew} onClick={newTask}>New task</Btn>}
          />
        </Card>
      ) : (
        <>
          {intel.length > 0 && (
            <div className="ai card-b" style={{ marginBottom: 14 }}>
              <div className="ai-h" style={{ marginBottom: 6 }}><Icon n="spark" s={14} />Task intelligence</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {intel.map(([tone, txt, fn], i) => <button key={i} type="button" className={'chip ' + tone} style={{ cursor: 'pointer', height: 24 }} onClick={fn}>{txt} →</button>)}
              </div>
            </div>
          )}
          <Tabs value={view} onChange={k => { if (isView(k)) setView(k) }} tabs={tabs} />
          <div className="row wrap" style={{ marginBottom: 12 }}>
            <SearchInp value={q} onChange={setQ} placeholder="Search tasks" />
            <Sel className="sm" style={{ width: 160 }} aria-label="Task type" value={ty} onChange={setTy} placeholder="All types" options={TYPES} />
            <Sel className="sm" style={{ width: 120 }} aria-label="Priority" value={pri} onChange={setPri} placeholder="Any priority" options={PRIORITIES} />
            {mineOnly && view !== 'mine' && <Chip icon="user">Assigned to me</Chip>}
            {filtered && <Btn size="sm" kind="ghost" onClick={clear}>Clear filters</Btn>}
          </div>
          {mode === 'list' && (
            <div className="card">
              {rows.length ? <TaskTable rows={rows} /> : (
                <Empty
                  icon="checksq" title={filtered ? 'No tasks match these filters' : 'Nothing here'}
                  body={filtered ? 'Try a different search or clear the filters.' : EMPTY_BODY[view]}
                  action={filtered ? <Btn onClick={clear}>Clear filters</Btn> : view === 'mine' ? <Btn kind="pri" icon="plus" disabled={!canNew} onClick={newTask}>New task</Btn> : undefined}
                />
              )}
            </div>
          )}
          {mode === 'board' && (
            <div className="kb">
              {STATUSES.map(s => {
                const inCol = rows.filter(t => t.status === s)
                return (
                  <section
                    key={s} className={'kc' + (over === s ? ' over' : '')} aria-label={s}
                    onDragOver={e => { e.preventDefault(); if (over !== s) setOver(s) }}
                    onDragLeave={() => setOver(o => (o === s ? null : o))}
                    onDrop={e => { e.preventDefault(); setOver(null); setDrag(null); moveTo(e.dataTransfer.getData('text/plain'), s) }}
                  >
                    <div className="kc-h"><b className="sm">{s}</b> <span className="chip">{inCol.length}</span></div>
                    <div className="kc-b">
                      {inCol.slice(0, 40).map(t => (
                        <div key={t.id} className={'dc' + (drag === t.id ? ' drag' : '')} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); setDrag(t.id) }} onDragEnd={() => { setDrag(null); setOver(null) }}>
                          <div className="row" style={{ gap: 6 }}>
                            <BizDot b={t.businessId} s={6} />
                            <button type="button" className="sm b" style={{ flex: 1, textAlign: 'left', border: 0, background: 'transparent', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => UI.drawer('task', { id: t.id })}>{t.title}</button>
                            <Menu align="right" trigger={<Btn size="xs" kind="ghost" icon="more" aria-label={'Move task: ' + t.title} />} items={STATUSES.map(x => ({ label: x, checked: t.status === x, onClick: () => moveTo(t.id, x) }))} />
                          </div>
                          <div className="row xs" style={{ marginTop: 6, gap: 6 }}>
                            <Chip tone={TONE[t.priority]}>{t.priority}</Chip>
                            <Due t={t} />
                            <span className="sp" />
                            <Av u={Q.user(t.assigneeId)} s={18} />
                          </div>
                        </div>
                      ))}
                      {inCol.length > 40 && <div className="faint xs" style={{ textAlign: 'center' }}>+{inCol.length - 40} more</div>}
                      {!inCol.length && <div className="faint xs" style={{ textAlign: 'center', padding: 14 }}>{filtered ? 'No matches' : 'Empty'}</div>}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
          {mode === 'cal' && (
            <div>
              <div className="row" style={{ marginBottom: 10 }}>
                <Btn size="sm" icon="left" aria-label="Previous week" onClick={() => setWk(wk - 1)} />
                <b className="sm">Week of {F.date(ws)}</b>
                <Btn size="sm" icon="right" aria-label="Next week" onClick={() => setWk(wk + 1)} />
                {wk !== 0 && <Btn size="sm" kind="ghost" onClick={() => setWk(0)}>This week</Btn>}
              </div>
              <div className="cal">
                {days.map(d => {
                  const ts = rows.filter(t => t.due.slice(0, 10) === d)
                  return (
                    <div key={d} className={'cal-d' + (d === today ? ' today' : '')}>
                      <div className="row xs"><b>{F.W[F.d(d).getDay()]}</b><span className="faint">{F.date(d)}</span><span className="sp" />{ts.length > 0 && <span className="faint">{ts.length}</span>}</div>
                      {ts.slice(0, 8).map(t => (
                        <button
                          key={t.id} type="button" className="chip"
                          style={{ height: 'auto', padding: '3px 6px', whiteSpace: 'normal', textAlign: 'left', cursor: 'pointer', justifyContent: 'flex-start', background: Q.done(t) ? 'var(--surf2)' : Q.overdue(t) ? 'var(--bad-bg)' : 'var(--acc-soft)', color: Q.done(t) ? 'var(--fg3)' : undefined }}
                          onClick={() => UI.drawer('task', { id: t.id })}
                        >
                          <span className="mono" style={{ fontSize: 10 }}>{t.due.slice(11)}</span> {t.title.slice(0, 48)}
                        </button>
                      ))}
                      {ts.length > 8 && <span className="faint xs">+{ts.length - 8} more</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
