import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Deal, SalesUser } from '../../data/types'
import { Bars, BizDot, Btn, Card, Chip, DataTable, Empty, Funnel, Kpi, Legend, LINE_DASH, Line, Owner, Sel, Seg, type Col } from '../../kit'
import { PER, type PeriodKey } from '../../shared/constants'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

const SOURCES = ['Outbound', 'Referral', 'Inbound enquiry', 'Event', 'Partner']
const go = (p: string, q?: Record<string, unknown>): void => UI.nav(p, { q })
const sum = <T,>(a: readonly T[], f: (x: T) => number): number => a.reduce((s, x) => s + (f(x) || 0), 0)
const field = (d: Deal, k: string): number => {
  const v = d.fields[k]
  return typeof v === 'number' ? v : Number(v) || 0
}

type KpiDef = readonly [label: string, value: string | number, onClick: () => void]

function BizKpis({ b, open }: { b: BusinessId; open: Deal[] }) {
  const st = (id: string): Deal[] => open.filter(d => d.stageId === `${b}_${id}`)
  const mt = S.meetings.filter(m => m.businessId === b && m.status === 'upcoming')
  const list = (): void => go('deals', { view: 'list' })
  const board = (stage: string) => (): void => go('deals', { stage, view: 'board' })
  let k: KpiDef[] = []
  if (b === 'ros') {
    k = [
      ['Active opportunities', open.length, () => go('deals', { view: 'board' })],
      ['Employees in pipeline', F.num(sum(open, d => field(d, 'employees'))), list],
      ['Potential MRR', F.money(sum(open, d => d.mrr ?? 0), 1), list],
      ['Potential ARR', F.money(sum(open, d => d.mrr ?? 0) * 12, 1), list],
      ['Demos scheduled', st('demo').length, board('ros_demo')],
      ['Proposals sent', st('trial').length + st('neg').length, board('ros_trial')],
    ]
  } else if (b === 'pth') {
    const contacted = new Set(S.activities.filter(a => a.businessId === 'pth' && ['email_out', 'call'].includes(a.type)).map(a => a.companyId))
    k = [
      ['Schools contacted', contacted.size, () => go('companies')],
      ['Meetings scheduled', mt.length, () => go('activities', { type: 'meeting_booked' })],
      ['Active pilots', st('pilot').length, board('pth_pilot')],
      ['Potential students covered', F.num(sum(open, d => field(d, 'eligible'))), list],
      ['Education pipeline', F.money(sum(open, d => d.value), 1), list],
      ['In internal approval', st('appr').length, board('pth_appr')],
    ]
  } else if (b === 'ard') {
    const starts = open.map(d => d.fields.commencement).filter((x): x is string => typeof x === 'string' && !!x).sort()
    k = [
      ['Discovery meetings', st('disc').length + mt.filter(m => /Discovery|Workshop/.test(m.type)).length, board('ard_disc')],
      ['Projects being scoped', st('scope').length, board('ard_scope')],
      ['Proposals awaiting decision', st('prop').length + st('neg').length, board('ard_prop')],
      ['Project pipeline', F.money(sum(open, d => d.value), 1), list],
      ['Next expected start', starts[0] ? F.date(starts[0]) : '—', list],
      ['Open projects', open.length, () => go('deals', { view: 'board' })],
    ]
  } else if (b === 'adv') {
    k = [
      ['HR discovery meetings', st('hr').length + mt.length, board('adv_hr')],
      ['Demos scheduled', st('demo').length, board('adv_demo')],
      ['Workforce in pipeline', F.num(sum(open, d => field(d, 'employees'))), list],
      ['Proposals in progress', st('prop').length + st('neg').length, board('adv_prop')],
      ['Potential subscription revenue', F.money(sum(open, d => d.value), 1), list],
      ['In security / HR review', st('sec').length, board('adv_sec')],
    ]
  }
  if (!k.length) return null
  return (
    <div className="card" style={{ padding: 12, marginBottom: 14, borderColor: 'var(--acc-line)', background: 'linear-gradient(0deg,var(--surf),var(--surf)),var(--acc-soft)' }}>
      <div className="row" style={{ marginBottom: 8 }}><BizDot b={b} /><span className="b sm">{Q.biz(b)?.name} focus metrics</span></div>
      <div className="grid g6">{k.map(([l, v, fn]) => <Kpi key={l} label={l} value={v} onClick={fn} />)}</div>
    </div>
  )
}

export function Dashboard() {
  const me = Q.me()
  const ws = Q.wsBiz()
  const [per, setPer] = useState<PeriodKey>('month')
  const [owner, setOwner] = useState('')
  const [team, setTeam] = useState('')
  const [src, setSrc] = useState('')
  const [mine, setMine] = useState(false)
  const from = PER[per][1]()
  const clock = F.nowIso()
  const sc = Q.scope()
  const own: string[] | null = mine ? [me.id] : owner ? [owner] : team ? (Q.team(team)?.members ?? []) : null
  const inOwn = (id: string | null | undefined): boolean => !own || (!!id && own.includes(id))

  const deals = Q.deals().filter(d => inOwn(d.ownerId) && (!src || d.source === src))
  const open = deals.filter(Q.open)
  const acts = Q.activities().filter(a => a.ts >= from && a.ts <= clock && inOwn(a.actorId))
  const cnt = (t: string): number => acts.filter(a => a.type === t).length
  const won = deals.filter(d => d.status === 'won' && (d.closedAt ?? '') >= from)
  const tot = sum(open, d => d.value)
  const wt = sum(open, Q.weighted)
  const arr = sum(deals.filter(d => d.status === 'won' && d.recurring), d => d.value)
  const risk = open.filter(d => Q.risk(d)?.level === 'high')
  const od = Q.tasks().filter(t => inOwn(t.assigneeId)).filter(Q.overdue)
  const leads =
    S.contactRels.filter(r => sc.includes(r.businessId) && inOwn(r.ownerId) && (Q.contact(r.contactId)?.createdAt ?? '') >= from).length +
    S.companyRels.filter(r => sc.includes(r.businessId) && r.createdAt >= from && inOwn(r.ownerId)).length
  const seqSent = new Set(acts.filter(a => a.type === 'email_out' && a.seqId).map(a => a.contactId))
  const seqRep = new Set(acts.filter(a => a.type === 'email_in' && seqSent.has(a.contactId)).map(a => a.contactId))
  const bizs = S.businesses.filter(b => sc.includes(b.id))

  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = F.now()
    d.setDate(1)
    d.setMonth(d.getMonth() - 5 + i)
    const k = F.iso(d).slice(0, 7)
    return { l: F.M[d.getMonth()], v: bizs.map(b => sum(deals.filter(x => x.status === 'won' && x.businessId === b.id && !!x.closedAt && x.closedAt.slice(0, 7) === k), x => x.value)) }
  })
  const weeks = Array.from({ length: 8 }).map((_, i) => {
    const s = F.addDays(F.weekStart(), -7 * (7 - i))
    return { s, e: F.addDays(s, 7), l: F.date(s) }
  })
  const aw = Q.activities().filter(a => inOwn(a.actorId))
  const wc = (t: string): number[] => weeks.map(w => aw.filter(a => a.type === t && a.ts >= w.s && a.ts < w.e).length)
  const fun = [
    { l: 'Leads in scope', v: S.contactRels.filter(r => sc.includes(r.businessId)).length },
    { l: 'Contacted', v: new Set(Q.activities().filter(a => ['email_out', 'call', 'linkedin_msg'].includes(a.type)).map(a => a.contactId)).size },
    { l: 'Meetings booked', v: new Set(Q.activities().filter(a => a.type === 'meeting_booked').map(a => a.companyId)).size },
    { l: 'Opportunities', v: deals.length },
    { l: 'Won', v: deals.filter(d => d.status === 'won').length },
  ]
  const pl = ws ? Q.pipeline(ws) : null
  const stages = pl ? pl.stages.filter(s => !s.won && !s.lost) : []
  const cutoff = F.addDays(clock, 30).slice(0, 10)
  const closes = open.filter(d => d.close <= cutoff).sort((a, b) => a.close.localeCompare(b.close))
  const owners = [...new Set(Q.deals().map(d => d.ownerId))].map(Q.user).filter((u): u is SalesUser => !!u)
  const riskRows = open.filter(d => Q.risk(d)).sort((a, b) => (Q.risk(b)?.reasons.length ?? 0) - (Q.risk(a)?.reasons.length ?? 0)).slice(0, 8)

  const closeCols: Col<Deal>[] = [
    { k: 'name', l: 'Deal', r: d => <span className="row"><BizDot b={d.businessId} /><span className="trunc" style={{ maxWidth: 240 }}>{d.name}</span></span> },
    { k: 'close', l: 'Close', r: d => <span style={{ color: d.close < clock.slice(0, 10) ? 'var(--bad2)' : undefined }}>{F.date(d.close)}</span> },
    { k: 'value', l: 'Value', right: true, r: d => <span className="num">{F.money(d.value, 1)}</span> },
    { k: 'p', l: 'Prob.', right: true, sort: d => d.probability, r: d => `${d.probability}%` },
  ]
  const riskCols: Col<Deal>[] = [
    { k: 'name', l: 'Deal', r: d => <span className="row"><BizDot b={d.businessId} /><span className="trunc" style={{ maxWidth: 200 }}>{d.title}</span></span> },
    { k: 'r', l: 'Signal', nosort: true, r: d => { const r = Q.risk(d); return r ? <Chip tone={r.level === 'high' ? 'bad' : 'warn'}>{r.reasons[0]}</Chip> : null } },
    { k: 'o', l: 'Owner', nosort: true, r: d => <Owner id={d.ownerId} /> },
  ]

  const nothing = !Q.deals().length && !Q.activities().length && !Q.companies().length
  const title = ws ? `${Q.biz(ws)?.name ?? ''} dashboard` : 'Portfolio dashboard'
  return (
    <div className="page">
      <PageHead title={title} sub={`${mine ? 'Your' : 'Team'} performance · ${PER[per][0].toLowerCase()} · calculated live from CRM records`}>
        <Seg value={mine ? 'me' : 'team'} onChange={v => setMine(v === 'me')} opts={[['team', 'Team'], ['me', 'Mine']]} />
        <Sel className="sm" style={{ width: 130 }} value={per} onChange={v => setPer(v as PeriodKey)} aria-label="Period" options={(Object.keys(PER) as PeriodKey[]).map(k => [k, PER[k][0]] as const)} />
        {!mine && <Sel className="sm" style={{ width: 150 }} value={team} onChange={v => { setTeam(v); setOwner('') }} aria-label="Team" placeholder="All teams" options={S.teams.filter(t => sc.includes(t.businessId)).map(t => [t.id, t.name] as const)} />}
        {!mine && <Sel className="sm" style={{ width: 150 }} value={owner} onChange={v => { setOwner(v); setTeam('') }} aria-label="Salesperson" placeholder="All salespeople" options={owners.map(u => [u.id, u.name] as const)} />}
        <Sel className="sm" style={{ width: 130 }} value={src} onChange={setSrc} aria-label="Source" placeholder="All sources" options={SOURCES} />
      </PageHead>
      {nothing ? (
        <Card>
          <Empty
            icon="chart"
            title="Nothing to report yet"
            body="Pipeline, activity and conversion appear here once companies, contacts and deals have been added."
            action={Q.anyEdit() ? <Btn kind="pri" icon="plus" onClick={() => UI.nav('companies')}>Go to companies</Btn> : undefined}
          />
        </Card>
      ) : (
        <>
          {ws && <BizKpis b={ws} open={open} />}
          <div className="grid g6" style={{ marginBottom: 14 }}>
            <Kpi label="Open pipeline" value={F.money(tot, 1)} sub={`${open.length} deals`} onClick={() => go('deals', { status: 'open', view: 'list' })} />
            <Kpi label="Weighted pipeline" value={F.money(wt, 1)} sub="Value × stage probability" onClick={() => go('deals', { status: 'open', view: 'list' })} />
            <Kpi label={`Won · ${PER[per][0].toLowerCase()}`} value={F.money(sum(won, d => d.value), 1)} sub={`${won.length} deals`} tone="ok" onClick={() => go('deals', { status: 'won', view: 'list' })} />
            <Kpi label="Recurring revenue (ARR)" value={F.money(arr, 1)} sub="Won subscription deals" onClick={() => go('deals', { status: 'won', view: 'list' })} />
            <Kpi label="New leads" value={leads} sub={PER[per][0]} onClick={() => go('contacts')} />
            <Kpi label="Deals at risk" value={risk.length} tone={risk.length ? 'bad2' : undefined} sub="High-risk signals" onClick={() => go('deals', { risk: 1, view: 'list' })} />
            <Kpi label="Meetings booked" value={cnt('meeting_booked')} onClick={() => go('activities', { type: 'meeting_booked', from })} />
            <Kpi label="Meetings completed" value={cnt('meeting')} onClick={() => go('activities', { type: 'meeting', from })} />
            <Kpi label="Emails sent" value={cnt('email_out')} onClick={() => go('activities', { type: 'email_out', from })} />
            <Kpi label="Calls completed" value={cnt('call')} onClick={() => go('activities', { type: 'call', from })} />
            <Kpi label="Tasks overdue" value={od.length} tone={od.length ? 'bad2' : undefined} onClick={() => go('tasks', { view: 'overdue', scope: mine ? 'mine' : 'all' })} />
            <Kpi label="Sequence reply rate" value={seqSent.size ? F.pct(seqRep.size / seqSent.size) : '—'} sub={`${seqRep.size} of ${seqSent.size} contacts`} onClick={() => go('sequences')} />
          </div>
          <div className="grid g2" style={{ marginBottom: 14 }}>
            <Card title={ws ? 'Pipeline by stage' : 'Open pipeline by business'} right={<span className="faint xs">Click a bar to open deals</span>}>
              {ws ? (
                stages.length ? (
                  <Bars
                    label="Pipeline value by stage"
                    data={stages.map(s => ({ l: s.name.split(' ')[0], v: sum(open.filter(d => d.stageId === s.id), d => d.value) }))}
                    fmt={v => F.money(v, 1)}
                    onBar={(_, i) => go('deals', { stage: stages[i].id, view: 'board' })}
                  />
                ) : <Empty icon="kanban" title="No pipeline stages" body="Stages for this business could not be loaded." />
              ) : (
                <>
                  <Bars
                    label="Open pipeline by business"
                    data={bizs.map(b => ({ l: b.name, v: sum(open.filter(d => d.businessId === b.id), d => d.value), c: b.accent }))}
                    fmt={v => F.money(v, 1)}
                    onBar={(_, i) => { Act.setSession({ ws: bizs[i].id }); UI.nav('deals') }}
                  />
                  <div className="row wrap" style={{ gap: 14, marginTop: 6 }}>
                    {bizs.map(b => {
                      const o = open.filter(d => d.businessId === b.id)
                      return <span key={b.id} className="sm"><BizDot b={b.id} /> <b className="num">{F.money(sum(o, d => d.value), 1)}</b> <span className="faint">· {o.length} active</span></span>
                    })}
                  </div>
                </>
              )}
            </Card>
            <Card title="Won revenue by month" right={<Legend items={bizs.map(b => [b.name, b.accent] as const)} />}>
              <Bars label="Won revenue by month" stacked series={bizs.map(b => b.name)} data={months} colors={bizs.map(b => b.accent)} fmt={v => F.money(v, 1)} />
            </Card>
            <Card title="Sales activity — last 8 weeks" right={<Legend items={[['Emails', 'var(--acc)', LINE_DASH[0]], ['Calls', '#0E8A7E', LINE_DASH[1]], ['Meetings booked', '#D9572B', LINE_DASH[2]]]} />}>
              <Line label="Sales activity by week" labels={weeks.map(w => w.l)} series={[{ n: 'Emails', c: 'var(--acc)', v: wc('email_out') }, { n: 'Calls', c: '#0E8A7E', v: wc('call') }, { n: 'Meetings', c: '#D9572B', v: wc('meeting_booked') }]} />
            </Card>
            <Card title="Conversion" right={<span className="faint xs">Lead → meeting → opportunity</span>}>
              <Funnel label="Conversion funnel" steps={fun} onStep={s => (s.l === 'Opportunities' || s.l === 'Won' ? go('deals', { view: 'list', status: s.l === 'Won' ? 'won' : '' }) : go('contacts'))} />
              <div className="faint xs" style={{ marginTop: 8 }}>Meetings booked counted per company; conversion % relative to previous step.</div>
            </Card>
          </div>
          <div className="grid g2">
            <Card title="Upcoming expected close dates" pad={false} right={<Btn size="sm" kind="ghost" onClick={() => go('deals', { view: 'list', status: 'open' })}>All deals</Btn>}>
              <DataTable rows={closes} cols={closeCols} onRow={d => UI.nav('deal', { id: d.id })} empty={<Empty icon="cal" title="No deals closing in the next 30 days" />} />
            </Card>
            <Card title="Deals at risk" pad={false}>
              <DataTable rows={riskRows} cols={riskCols} onRow={d => UI.nav('deal', { id: d.id })} empty={<Empty icon="check" title="No risk signals" />} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
