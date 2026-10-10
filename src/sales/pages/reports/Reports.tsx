import { useState } from 'react'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Deal } from '../../data/types'
import {
  Bars, BizDot, Btn, Card, DataTable, Empty, FilterBar, Funnel, Kpi, Legend, LINE_DASH, Line, Owner, Sel, download, toCSV, type Col,
} from '../../kit'
import { INDUSTRIES, PER, type PeriodKey } from '../../shared/constants'
import { PageHead } from '../../shared/PageHead'
import { seqStats, type SeqStats } from '../../shared/seqStats'
import { UI } from '../../ui/store'

const SOURCES = ['Outbound', 'Referral', 'Inbound enquiry', 'Event', 'Partner', 'Cross-business introduction']
const POSITIVE = ['Interested', 'Meeting Requested', 'More Information Requested']
const rate = (a: number, b: number): string => (b ? F.pct(a / b) : '—')
const sum = (ds: readonly Deal[], f: (d: Deal) => number): number => ds.reduce((s, d) => s + f(d), 0)
const R: { textAlign: 'right' } = { textAlign: 'right' }

interface UserRow { id: string; e: number; c: number; m: number; w: number }
type SeqRow = SeqStats & { id: string; seqId: string }

export function Reports() {
  const sc = Q.scope()
  const [per, setPer] = useState<PeriodKey>('quarter')
  const [bz, setBz] = useState('')
  const [u, setU] = useState('')
  const [tm, setTm] = useState('')
  const [src, setSrc] = useState('')
  const [ind, setInd] = useState('')
  const [ds, setDs] = useState('')

  const from = PER[per][1]()
  const clock = F.nowIso()
  const bs: BusinessId[] = bz && (sc as string[]).includes(bz) ? [bz as BusinessId] : sc
  const ids: string[] | null = u ? [u] : tm ? (Q.team(tm)?.members ?? []) : null
  const inIds = (id: string | null | undefined): boolean => !ids || (!!id && ids.includes(id))

  const deals = S.deals.filter(d => bs.includes(d.businessId) && inIds(d.ownerId) && (!src || d.source === src) && (!ind || Q.company(d.companyId)?.industry === ind) && (!ds || d.status === ds))
  const acts = S.activities.filter(a => bs.includes(a.businessId) && a.ts >= from && a.ts <= clock && inIds(a.actorId) && (!ind || Q.company(a.companyId)?.industry === ind))
  const c = (t: string): number => acts.filter(a => a.type === t).length

  const open = deals.filter(Q.open)
  const won = deals.filter(d => d.status === 'won' && (d.closedAt ?? '') >= from)
  const lost = deals.filter(d => d.status === 'lost' && (d.closedAt ?? '') >= from)
  const emailed = new Set(acts.filter(a => a.type === 'email_out').map(a => a.contactId))
  const replied = new Set(acts.filter(a => a.type === 'email_in' && emailed.has(a.contactId)).map(a => a.contactId))
  const posC = new Set(S.threads.filter(t => bs.includes(t.businessId) && POSITIVE.includes(t.classification?.cat ?? '') && replied.has(t.contactId)).map(t => t.contactId))
  const meetC = new Set(acts.filter(a => a.type === 'meeting_booked').map(a => a.contactId))
  const repMeet = [...replied].filter(x => meetC.has(x)).length
  const newDeals = deals.filter(d => d.createdAt >= from)
  const closed = deals.filter(d => d.status !== 'open' && (d.closedAt ?? '') >= from)
  const cyc = won.length ? Math.round(won.reduce((s, d) => s + F.days(d.createdAt, d.closedAt ?? d.createdAt), 0) / won.length) : null
  const leads = S.contactRels.filter(r => bs.includes(r.businessId) && (Q.contact(r.contactId)?.createdAt ?? '') >= from).length
  const meetCo = new Set(acts.filter(a => a.type === 'meeting_booked').map(a => a.companyId))
  const dealCo = new Set(newDeals.map(d => d.companyId))

  const weeks = Array.from({ length: 10 }).map((_, i) => {
    const s = F.addDays(F.weekStart(), -7 * (9 - i))
    return { s, e: F.addDays(s, 7), l: F.date(s) }
  })
  const wa = S.activities.filter(a => bs.includes(a.businessId) && inIds(a.actorId))
  const w = (t: string): number[] => weeks.map(x => wa.filter(a => a.type === t && a.ts >= x.s && a.ts < x.e).length)
  const fm = Array.from({ length: 6 }).map((_, i) => {
    const d = F.now()
    d.setDate(1)
    d.setMonth(d.getMonth() + i)
    const k = F.iso(d).slice(0, 7)
    const inM = open.filter(x => x.close.slice(0, 7) === k)
    return {
      l: F.M[d.getMonth()],
      v: [sum(inM.filter(x => x.forecast === 'Commit'), Q.weighted), sum(inM.filter(x => x.forecast !== 'Commit'), Q.weighted)],
    }
  })
  const pb = bz || Q.wsBiz()
  const pl = pb ? Q.pipeline(pb) : null
  const users = S.users.filter(x => !x.super && x.active && (Object.keys(x.m) as BusinessId[]).some(b => bs.includes(b)) && !Object.values(x.m).every(r => r === 'viewer')).map(x => x.id)
  const empty = !deals.length && !acts.length

  const exp = (): void => {
    download('salesos_report.csv', toCSV([
      ['Metric', 'Value'], ['Emails sent', c('email_out')], ['Calls', c('call')], ['Meetings booked', c('meeting_booked')], ['Meetings completed', c('meeting')],
      ['Open pipeline', sum(open, d => d.value)], ['Weighted', sum(open, Q.weighted)], ['Won', sum(won, d => d.value)], ['Lost', sum(lost, d => d.value)],
    ]))
  }
  const reset = (): void => { setPer('d90'); setBz(''); setU(''); setTm(''); setSrc(''); setInd(''); setDs('') }
  const actNav = (type: string) => (): void => UI.nav('activities', { q: { type, from } })

  const userRows: UserRow[] = users.map(x => ({
    id: x,
    e: acts.filter(a => a.actorId === x && a.type === 'email_out').length,
    c: acts.filter(a => a.actorId === x && a.type === 'call').length,
    m: acts.filter(a => a.actorId === x && a.type === 'meeting_booked').length,
    w: sum(S.deals.filter(d => d.ownerId === x && d.status === 'won' && (d.closedAt ?? '') >= from && bs.includes(d.businessId)), d => d.value),
  }))
  const userCols: Col<UserRow>[] = [
    { k: 'u', l: 'User', r: r => <Owner id={r.id} />, sort: r => Q.user(r.id)?.name },
    { k: 'e', l: 'Emails', right: true }, { k: 'c', l: 'Calls', right: true }, { k: 'm', l: 'Meetings', right: true },
    { k: 'w', l: 'Won', right: true, r: r => F.money(r.w, 1) },
  ]
  const seqRows: SeqRow[] = S.sequences.filter(s => bs.includes(s.businessId) && s.status !== 'draft').map(s => ({ ...seqStats(s), id: s.id, seqId: s.id }))
  const seqCols: Col<SeqRow>[] = [
    {
      k: 's', l: 'Sequence', sort: r => Q.seq(r.id)?.name,
      r: r => <span className="row"><BizDot b={Q.seq(r.id)?.businessId ?? ''} /><span className="trunc" style={{ maxWidth: 180 }}>{Q.seq(r.id)?.name}</span></span>,
    },
    { k: 'snd', l: 'Sender', sort: r => Q.mailbox(Q.seq(r.id)?.mailboxId)?.address, r: r => Q.mailbox(Q.seq(r.id)?.mailboxId)?.address.split('@')[0] },
    { k: 'sent', l: 'Sent', right: true }, { k: 'replies', l: 'Replies', right: true }, { k: 'positive', l: 'Positive', right: true },
    { k: 'bounced', l: 'Bounces', right: true }, { k: 'unsub', l: 'Unsubs', right: true },
  ]

  return (
    <div className="page">
      <PageHead title="Reports" sub={`${PER[per][0]} · recalculated from live records`}>
        <Btn icon="download" disabled={empty} onClick={exp}>Export CSV</Btn>
      </PageHead>
      <div className="card" style={{ marginBottom: 14 }}>
        <FilterBar>
          <Sel className="sm" style={{ width: 130 }} value={per} onChange={v => setPer(v as PeriodKey)} aria-label="Period" options={(Object.keys(PER) as PeriodKey[]).map(k => [k, PER[k][0]] as const)} />
          {sc.length > 1 && <Sel className="sm" style={{ width: 150 }} value={bz} onChange={setBz} aria-label="Business" placeholder="All businesses" options={sc.map(b => [b, `${Q.biz(b)?.name ?? b} pipeline`] as const)} />}
          <Sel className="sm" style={{ width: 150 }} value={tm} onChange={v => { setTm(v); setU('') }} aria-label="Team" placeholder="All teams" options={S.teams.filter(t => bs.includes(t.businessId)).map(t => [t.id, t.name] as const)} />
          <Sel className="sm" style={{ width: 150 }} value={u} onChange={v => { setU(v); setTm('') }} aria-label="User" placeholder="All users" options={users.map(x => [x, Q.user(x)?.name ?? x] as const)} />
          <Sel className="sm" style={{ width: 130 }} value={src} onChange={setSrc} aria-label="Source" placeholder="Any source" options={SOURCES} />
          <Sel className="sm" style={{ width: 140 }} value={ind} onChange={setInd} aria-label="Industry" placeholder="Any industry" options={INDUSTRIES} />
          <Sel className="sm" style={{ width: 120 }} value={ds} onChange={setDs} aria-label="Deal status" placeholder="Any status" options={[['open', 'Open'], ['won', 'Won'], ['lost', 'Lost']]} />
        </FilterBar>
      </div>
      {empty ? (
        <Card>
          <Empty icon="chart" title="No reports available for these filters" body="There is no recorded activity or deal data for this combination. Widen the date range or clear filters." action={<Btn onClick={reset}>Reset filters</Btn>} />
        </Card>
      ) : (
        <>
          <h3 className="b" style={{ margin: '4px 0 10px' }}>Sales activity</h3>
          <div className="grid g6" style={{ marginBottom: 16 }}>
            <Kpi label="Emails sent" value={c('email_out')} onClick={actNav('email_out')} />
            <Kpi label="Calls completed" value={c('call')} onClick={actNav('call')} />
            <Kpi label="Meetings booked" value={c('meeting_booked')} onClick={actNav('meeting_booked')} />
            <Kpi label="Meetings completed" value={c('meeting')} onClick={actNav('meeting')} />
            <Kpi label="LinkedIn tasks" value={c('linkedin_conn') + c('linkedin_msg')} />
            <Kpi label="Follow-ups completed" value={S.tasks.filter(t => bs.includes(t.businessId) && t.status === 'Completed' && (t.completedAt ?? '') >= from && inIds(t.assigneeId)).length} />
            <Kpi label="New contacts" value={leads} />
            <Kpi label="New companies" value={S.companyRels.filter(r => bs.includes(r.businessId) && r.createdAt >= from).length} />
            <Kpi label="New deals" value={newDeals.length} />
            <Kpi label="Overdue tasks" value={S.tasks.filter(t => bs.includes(t.businessId) && Q.overdue(t) && inIds(t.assigneeId)).length} tone="bad2" onClick={() => UI.nav('tasks', { q: { view: 'overdue' } })} />
          </div>
          <h3 className="b" style={{ margin: '4px 0 10px' }}>Conversion</h3>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <Kpi label="Outreach → reply" value={rate(replied.size, emailed.size)} sub={`${replied.size} of ${emailed.size} contacts emailed`} />
            <Kpi label="Positive reply rate" value={rate(posC.size, replied.size)} sub={`${posC.size} positive`} />
            <Kpi label="Reply → meeting" value={rate(repMeet, replied.size)} />
            <Kpi label="Lead → meeting" value={rate(meetC.size, emailed.size)} sub="Estimated · per contact" />
            <Kpi label="Meeting → deal" value={rate([...meetCo].filter(x => !!x && dealCo.has(x)).length, meetCo.size)} sub="Estimated · per company" />
            <Kpi label="Win rate" value={rate(won.length, closed.length)} sub={`${won.length} won / ${closed.length} closed`} />
            <Kpi label="Average deal cycle" value={cyc != null ? `${cyc} days` : '—'} sub={cyc != null ? 'Won deals in period' : 'No won deals'} />
            <Kpi label="Average deal value" value={F.money(deals.length ? sum(deals, d => d.value) / deals.length : null, 1)} />
          </div>
          <h3 className="b" style={{ margin: '4px 0 10px' }}>Revenue</h3>
          <div className="grid g6" style={{ marginBottom: 16 }}>
            <Kpi label="Open pipeline" value={F.money(sum(open, d => d.value), 1)} />
            <Kpi label="Weighted pipeline" value={F.money(sum(open, Q.weighted), 1)} />
            <Kpi label="Won revenue" value={F.money(sum(won, d => d.value), 1)} tone="ok" />
            <Kpi label="Lost revenue" value={F.money(sum(lost, d => d.value), 1)} />
            <Kpi label="Forecast (commit)" value={F.money(sum(open.filter(d => d.forecast === 'Commit'), Q.weighted), 1)} />
            <Kpi label="Recurring (won ARR)" value={F.money(sum(deals.filter(d => d.status === 'won' && d.recurring), d => d.value), 1)} />
          </div>
          <div className="grid g2" style={{ marginBottom: 14 }}>
            <Card title="Sales activity trend" right={<Legend items={[['Emails', 'var(--acc)', LINE_DASH[0]], ['Calls', '#0E8A7E', LINE_DASH[1]], ['Meetings', '#D9572B', LINE_DASH[2]], ['LinkedIn', '#8E8897', LINE_DASH[3]]]} />}>
              <Line label="Sales activity trend by week" labels={weeks.map(x => x.l)} series={[
                { n: 'Emails', c: 'var(--acc)', v: w('email_out') }, { n: 'Calls', c: '#0E8A7E', v: w('call') },
                { n: 'Meetings', c: '#D9572B', v: w('meeting_booked') }, { n: 'LinkedIn', c: '#8E8897', v: w('linkedin_conn') },
              ]} />
            </Card>
            <Card title="Revenue forecast (weighted, by expected close)" right={<Legend items={[['Commit', 'var(--acc)'], ['Best case / pipeline', 'var(--acc-line)']]} />}>
              <Bars label="Revenue forecast by expected close" stacked series={['Commit', 'Best case / pipeline']} data={fm} colors={['var(--acc)', 'var(--acc-line)']} fmt={v => F.money(v, 1)} />
            </Card>
            <Card title="Funnel">
              <Funnel label="Outreach funnel" steps={[{ l: 'Contacts emailed', v: emailed.size }, { l: 'Replied', v: replied.size }, { l: 'Positive', v: posC.size }, { l: 'Meetings', v: meetC.size }, { l: 'Deals won', v: won.length }]} />
            </Card>
            <Card title={pl?.stages.length ? `${pl.name} — stage conversion` : 'Pipeline breakdown by business'} pad={!pl?.stages.length}>
              {pl?.stages.length ? (
                <table className="tbl">
                  <thead>
                    <tr><th>Stage</th><th style={R}>Open</th><th style={R}>Value</th><th style={R}>Reached</th><th style={R}>Conv. to next</th></tr>
                  </thead>
                  <tbody>
                    {pl.stages.filter(s => !s.lost).map((s, i, arr) => {
                      const reached = deals.filter(d => d.businessId === pb && d.stageHistory.some(h => h.stageId === s.id)).length
                      const nx = arr[i + 1]
                      const rn = nx ? deals.filter(d => d.businessId === pb && d.stageHistory.some(h => h.stageId === nx.id)).length : null
                      const here = open.filter(d => d.stageId === s.id)
                      return (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td style={R}>{here.length}</td>
                          <td style={R} className="num">{F.money(sum(here, d => d.value), 1)}</td>
                          <td style={R}>{reached}</td>
                          <td style={R}>{nx && rn != null ? rate(rn, reached) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <Bars label="Open pipeline by business" data={bs.map(b => ({ l: Q.biz(b)?.name ?? b, v: sum(open.filter(d => d.businessId === b), d => d.value), c: Q.biz(b)?.accent }))} fmt={v => F.money(v, 1)} />
              )}
            </Card>
          </div>
          <div className="grid g2">
            <Card title="Activity by salesperson" pad={false}>
              <DataTable rows={userRows} cols={userCols} empty={<Empty icon="users" title="No salespeople in this view" body="Add members with a sales role, or widen the business filter." />} />
            </Card>
            <Card title="Sequence performance by sender" pad={false}>
              <DataTable rows={seqRows} cols={seqCols} onRow={r => UI.nav('sequence', { id: r.id })} empty={<Empty icon="mail" title="No sequences have sent yet" body="Active and paused sequences appear here once they start sending." />} />
              <div className="faint xs" style={{ padding: 10 }}>Open rates are excluded. Simulated opens are an unreliable engagement signal.</div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
