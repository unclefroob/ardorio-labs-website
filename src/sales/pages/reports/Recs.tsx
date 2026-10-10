import { useEffect, useMemo, useState } from 'react'
import { cross, type CrossItem } from '../../ai/rules'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { BizDot, Btn, Card, Chip, DataTable, Empty, Link, Owner, Sel, Seg, type Col } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI, type Route } from '../../ui/store'
import { RecRow } from './RecRow'

const CROSS = '__cross'
type CrossRow = CrossItem & { id: string }

function CrossTable() {
  const rows = useMemo<CrossRow[]>(() => cross().map(x => ({ ...x, id: x.key })), [])
  const nameOf = (id: string): string => Q.company(id)?.name ?? ''
  const cols: Col<CrossRow>[] = [
    {
      k: 'c', l: 'Company', sort: x => nameOf(x.companyId),
      r: x => (
        <div>
          <Link to="company" id={x.companyId}>{nameOf(x.companyId)}</Link>
          <div className="faint xs">{Q.company(x.companyId)?.industry}</div>
        </div>
      ),
    },
    {
      k: 'f', l: 'Existing', nosort: true,
      r: x => (
        <span className="row" style={{ gap: 4 }}>
          {Q.relsOf(x.companyId).map(r => <span key={r.id} title={Q.biz(r.businessId)?.name}><BizDot b={r.businessId} /></span>)}
          {x.activeElsewhere && <Chip tone="acc">Active deal</Chip>}
        </span>
      ),
    },
    { k: 't', l: 'Suggested', nosort: true, r: x => <span className="row"><BizDot b={x.toBiz} /><b className="sm">{Q.biz(x.toBiz)?.name}</b></span> },
    { k: 'r', l: 'Reason', wrap: true, nosort: true, r: x => <span className="sm">{x.reason}</span> },
    {
      k: 's', l: 'Stakeholders', nosort: true,
      r: x => x.stakeholders.length
        ? <>{x.stakeholders.slice(0, 2).map(i => Q.contact(i)?.name).join(', ')}{x.stakeholders.length > 2 ? ` +${x.stakeholders.length - 2}` : ''}</>
        : <span className="faint">Gap</span>,
    },
    { k: 'o', l: 'Existing owner', nosort: true, r: x => (Q.member(x.fromBiz) ? <Owner id={x.ownerId} /> : <Chip icon="lock">{Q.biz(x.fromBiz)?.name} team</Chip>) },
    { k: 'st', l: 'Status', nosort: true, r: x => <Chip tone={x.status === 'requested' ? 'info' : ''}>{x.status === 'requested' ? 'Intro requested' : 'Open'}</Chip> },
    {
      k: 'a', l: '', nosort: true,
      r: x => (
        <span className="row" style={{ gap: 2 }}>
          <Btn size="xs" kind="pri" disabled={!Q.anyEdit()} onClick={() => UI.open('crossIntro', { companyId: x.companyId, toBiz: x.toBiz, fromBiz: x.fromBiz })}>Act</Btn>
          <Btn size="xs" kind="ghost" disabled={!Q.anyEdit()} onClick={() => {
            Act.crossDismiss(x.key)
            UI.toast('Dismissed')
          }}>Dismiss</Btn>
        </span>
      ),
    },
  ]
  return (
    <Card pad={false} title="Cross-business opportunity intelligence" right={<Chip icon="spark" title="Suggested by fixed rules over company size and locations, not by an AI model">Rules-based, from company profile</Chip>}>
      <DataTable
        rows={rows}
        cols={cols}
        empty={<Empty icon="swap" title="No cross-business suggestions" body="Companies that already work with one business and fit another appear here once their size and locations are on file." />}
      />
    </Card>
  )
}

const STATUS = [['New', 'New'], ['Accepted', 'Accepted'], ['Completed', 'Completed'], ['Dismissed', 'Dismissed'], ['Expired', 'Expired'], ['', 'All']] as const

export function Recs({ route }: { route: Route }) {
  useEffect(() => { if (Q.anyEdit()) Act.refreshRecs() }, [])
  const [st, setSt] = useState('New')
  const q = route.q?.type
  const [ty, setTy] = useState(typeof q === 'string' ? q : '')
  const all = S.recs.filter(r => Q.inScope(r.businessId))
  const types = [...new Set(all.map(r => r.type))]
  const isCross = ty === CROSS
  const nc = useMemo(() => cross().length, [])
  const rows = all.filter(r => (!st || r.status === st) && (!ty || r.type === ty)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const options = [...types.map(t => [t, t] as const), [CROSS, `Cross-business opportunities (${nc})`] as const]
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <PageHead title="Recommendations" sub="Explainable next-best actions with evidence from your records. Nothing changes until you act.">
        <Btn icon="refresh" disabled={!Q.anyEdit()} onClick={() => {
          Act.refreshRecs()
          UI.toast('Recommendations refreshed')
        }}>Refresh</Btn>
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {!isCross && <Seg value={st} onChange={setSt} opts={STATUS} />}
        <Sel className="sm" style={{ width: 240 }} value={ty} onChange={setTy} placeholder="All next-best actions" options={options} aria-label="Recommendation type" />
      </div>
      {isCross ? (
        <CrossTable />
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {rows.length ? (
            rows.slice(0, 60).map(r => <RecRow key={r.id} r={r} />)
          ) : (
            <Card>
              <Empty
                icon="bulb"
                title={all.length ? 'No recommendations match' : 'No recommendations yet'}
                body={all.length ? 'Try another status or type.' : 'Recommendations appear as deals stall, replies arrive and meetings approach.'}
                action={all.length ? <Btn onClick={() => { setSt(''); setTy('') }}>Show all</Btn> : undefined}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
