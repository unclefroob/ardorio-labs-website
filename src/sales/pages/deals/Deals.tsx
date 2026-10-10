import { useState } from 'react'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { BusinessId, Deal } from '../../data/types'
import { BizDot, Btn, Chip, Ck, DataTable, Empty, Icon, Owner, SearchInp, Seg, Sel } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { tryMove } from '../../shared/moves'
import { TONE } from '../../kit/util'
import type { Route } from '../../ui/store'
import { UI } from '../../ui/store'
import { DealCard } from './DealCard'

const SOURCES = ['Outbound', 'Referral', 'Inbound enquiry', 'Event', 'Partner', 'Cross-business introduction', 'Sequence reply']
const strQ = (v: unknown): string => (typeof v === 'string' ? v : '')

export function Deals({ route }: { route: Route }) {
  useStore()
  const q0 = route.q ?? {}
  const mem = Q.scope()
  const stageQ = strQ(q0.stage)
  const stB = stageQ ? stageQ.split('_')[0] : null
  const [view, setView] = useState(strQ(q0.view) === 'list' ? 'list' : 'board')
  const [b, setB] = useState<string>(stB || Q.wsBiz() || mem[0] || '')
  const pb = (mem as string[]).includes(b) ? (b as BusinessId) : mem[0]
  const [own, setOwn] = useState('')
  const [pri, setPri] = useState('')
  const [risk, setRisk] = useState(!!q0.risk)
  const [cl, setCl] = useState('')
  const [src, setSrc] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(strQ(q0.status) || 'open')
  const [over, setOver] = useState<string | null>(null)
  const [minV, setMinV] = useState('')
  const [stF, setStF] = useState(stageQ)

  if (!pb) {
    return (
      <div className="page">
        <PageHead title="Deals & Pipeline" />
        <Empty icon="lock" title="No business access" body="You are not a member of any business yet. Ask an administrator to add you." />
      </div>
    )
  }

  const pl = Q.pipeline(pb)
  const all = Q.deals()
  const today = F.today()
  const closeBy = cl ? F.addDays(F.nowIso(), +cl).slice(0, 10) : ''
  const base = all.filter(
    d =>
      (!own || d.ownerId === own) && (!pri || d.priority === pri) && (!risk || Q.risk(d)) && (!src || d.source === src) &&
      (!q || d.name.toLowerCase().includes(q.toLowerCase())) && (!closeBy || d.close <= closeBy) && (!minV || d.value >= +minV),
  )
  const bd = base.filter(d => d.businessId === pb)
  const list = base.filter(d => (view === 'list' && Q.wsBiz() === null ? true : d.businessId === pb) && (status === 'all' || d.status === status) && (!stF || d.stageId === stF))
  const owners = [...new Set(all.map(d => d.ownerId))]
  const openDeals = bd.filter(Q.open)
  const sub = (view === 'board' ? pl.name + ' · ' : '') + openDeals.length + ' open · ' + F.money(openDeals.reduce((s, d) => s + d.value, 0), 1) + ' pipeline · ' + F.money(bd.reduce((s, d) => s + Q.weighted(d), 0), 1) + ' weighted'
  const newDeal = (
    <Btn kind="pri" icon="plus" disabled={!Q.anyEdit()} onClick={() => UI.open('newDeal', { businessId: pb })}>New deal</Btn>
  )

  if (!all.length) {
    return (
      <div className="page" style={{ maxWidth: 'none' }}>
        <PageHead title="Deals & Pipeline">{newDeal}</PageHead>
        <div className="card">
          <Empty
            icon="kanban"
            title="No deals yet"
            body={Q.anyEdit() ? 'Create your first deal to start tracking the pipeline. Deals link a company, its stakeholders and a stage.' : 'No deals have been created for your businesses yet.'}
            action={Q.anyEdit() ? <Btn kind="pri" icon="plus" onClick={() => UI.open('newDeal', { businessId: pb })}>New deal</Btn> : undefined}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHead title="Deals & Pipeline" sub={sub}>
        <Seg value={view} onChange={setView} opts={[['board', 'Board', 'kanban'], ['list', 'List', 'list']]} />
        <Btn icon="spark" disabled={!Q.canEdit(pb)} onClick={() => UI.open('checkSignals', { businessId: pb })} title="Search the web for hiring, expansion and funding news on companies with open deals">Check signals</Btn>
        {newDeal}
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 12, gap: 8 }}>
        {(view === 'board' || Q.wsBiz()) && mem.length > 1 && (
          <Seg value={pb} onChange={v => { setB(v); setStF('') }} opts={mem.map(x => [x, Q.biz(x)?.name ?? x] as const)} />
        )}
        <SearchInp value={q} onChange={setQ} placeholder="Search deals" w={200} />
        <Sel className="sm" style={{ width: 150 }} aria-label="Owner" value={own} onChange={setOwn} placeholder="Any owner" options={owners.map(u => [u, Q.user(u)?.name ?? 'Unknown user'] as const)} />
        <Sel className="sm" style={{ width: 110 }} aria-label="Priority" value={pri} onChange={setPri} placeholder="Any priority" options={['High', 'Medium', 'Low']} />
        <Sel className="sm" style={{ width: 150 }} aria-label="Close date" value={cl} onChange={setCl} placeholder="Any close date" options={[['14', 'Closing in 14 days'], ['30', 'Closing in 30 days'], ['90', 'Closing in 90 days']]} />
        <Sel className="sm" style={{ width: 130 }} aria-label="Source" value={src} onChange={setSrc} placeholder="Any source" options={SOURCES} />
        <Sel className="sm" style={{ width: 130 }} aria-label="Value" value={minV} onChange={setMinV} placeholder="Any value" options={[['10000', 'A$10k+'], ['50000', 'A$50k+'], ['100000', 'A$100k+']]} />
        <Ck checked={risk} onChange={setRisk}>At risk only</Ck>
        {view === 'list' && (
          <>
            <Sel className="sm" style={{ width: 120 }} aria-label="Status" value={status} onChange={setStatus} options={[['open', 'Open'], ['won', 'Won'], ['lost', 'Lost'], ['all', 'All statuses']]} />
            <Sel className="sm" style={{ width: 150 }} aria-label="Stage" value={stF} onChange={setStF} placeholder="Any stage" options={pl.stages.map(s => [s.id, s.name] as const)} />
          </>
        )}
      </div>
      {view === 'board' ? (
        pl.stages.length === 0 ? (
          <div className="card">
            <Empty icon="kanban" title="No pipeline stages" body={`The ${Q.biz(pb)?.name ?? ''} pipeline has no stages yet. An administrator can set them up under Pipelines.`} />
          </div>
        ) : (
          <div className="kb">
            {pl.stages.map(s => {
              const ds = bd.filter(d => d.stageId === s.id).filter(d => !(s.won || s.lost) || F.days(d.closedAt || d.stageChangedAt, F.nowIso()) <= 90)
              return (
                <div
                  key={s.id}
                  className={'kc' + (over === s.id ? ' over' : '')}
                  style={s.won || s.lost ? { width: 220, opacity: 0.92 } : undefined}
                  onDragOver={e => { e.preventDefault(); setOver(s.id) }}
                  onDragLeave={() => setOver(null)}
                  onDrop={e => {
                    e.preventDefault()
                    setOver(null)
                    const id = e.dataTransfer.getData('text/plain')
                    if (id) tryMove(id, s.id)
                  }}
                >
                  <div className="kc-h">
                    <div className="row">
                      <b className="sm" style={s.won ? { color: 'var(--ok)' } : s.lost ? { color: 'var(--fg3)' } : undefined}>{s.name}</b>
                      <span className="faint xs">{s.prob}%</span>
                      <span className="sp" />
                      <span className="chip">{ds.length}</span>
                    </div>
                    <div className="faint xs num" style={{ marginTop: 2 }}>
                      {F.money(ds.reduce((x, d) => x + d.value, 0), 1)}
                      {!s.won && !s.lost && ' · ' + F.money(ds.reduce((x, d) => x + Q.weighted(d), 0), 1) + ' wtd'}
                      {s.required.length > 0 && (
                        <span title={'Required: ' + s.required.join(', ')}> · <Icon n="lock" s={10} /> {s.required.length} req.</span>
                      )}
                    </div>
                  </div>
                  <div className="kc-b">
                    {ds.length ? (
                      ds.sort((a, c) => c.value - a.value).map(d => <DealCard key={d.id} d={d} />)
                    ) : (
                      <div className="faint xs" style={{ textAlign: 'center', padding: '18px 0' }}>{bd.length ? 'No deals in this stage' : 'No deals in this pipeline yet'}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        <div className="card">
          <DataTable<Deal>
            rows={list}
            onRow={d => UI.nav('deal', { id: d.id })}
            sortInit={['close', 1]}
            empty={<Empty icon="kanban" title="No deals match" body="Change filters or create a new deal." />}
            cols={[
              { k: 'name', l: 'Deal', r: d => <span className="row"><BizDot b={d.businessId} /><div><b>{d.title}</b><div className="faint xs">{Q.company(d.companyId)?.name ?? '—'}</div></div></span> },
              { k: 'stage', l: 'Stage', r: d => <Chip tone={d.status === 'won' ? 'ok' : d.status === 'lost' ? 'bad' : ''}>{Q.stage(d)?.name ?? 'Removed stage'}</Chip>, sort: d => d.probability },
              { k: 'value', l: 'Value', right: true, r: d => <span className="num">{F.money(d.value)}</span> },
              { k: 'mrr', l: 'MRR', right: true, r: d => (d.mrr ? <span className="num">{F.money(d.mrr)}</span> : '—') },
              { k: 'probability', l: 'Prob.', right: true, r: d => d.probability + '%' },
              { k: 'w', l: 'Weighted', right: true, r: d => <span className="num">{F.money(Q.weighted(d), 1)}</span>, sort: d => Q.weighted(d) },
              { k: 'score', l: 'Score', right: true, r: d => { const v = Q.dealScore(d); return v === null ? '—' : <span className="num" title="Best lead score among the deal's contacts, including saved web signals">{v}</span> }, sort: d => Q.dealScore(d) ?? -1 },
              { k: 'close', l: 'Close', r: d => <span style={{ color: d.status === 'open' && d.close < today ? 'var(--bad2)' : undefined }}>{F.date(d.close)}</span> },
              { k: 'o', l: 'Owner', r: d => <Owner id={d.ownerId} />, sort: d => Q.user(d.ownerId)?.name ?? '' },
              { k: 'lastActivity', l: 'Last activity', r: d => F.rel(d.lastActivity) },
              { k: 'r', l: 'Risk', r: d => { const r = Q.risk(d); return r ? <Chip tone={r.level === 'high' ? 'bad' : 'warn'} title={r.reasons.join(' · ')}>{r.reasons[0]}</Chip> : '—' }, sort: d => Q.risk(d)?.reasons.length ?? 0 },
              { k: 'source', l: 'Source' },
              { k: 'priority', l: 'Priority', r: d => <Chip tone={TONE[d.priority]}>{d.priority}</Chip> },
            ]}
          />
        </div>
      )}
    </div>
  )
}
