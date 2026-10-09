import { useState, type FC, type ReactNode } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Deal } from '../../data/types'
import { Banner, BizDot, Btn, Chip, DataTable, Empty, Icon, Menu, Owner, type Col, type MenuItem } from '../../kit'
import { UI } from '../../ui/store'

export interface CoordProps { companyId: string; contactId?: string }
export interface ColMenuProps { cols: ReadonlyArray<{ k: string; l?: ReactNode; fixed?: boolean }>; hid: string[]; tog: (k: string) => void }
export interface ViewsProps { page: string; q: Record<string, unknown>; apply: (q: Record<string, unknown>) => void }
export interface DealTableProps { rows: Deal[]; hideCo?: boolean }

interface CoordRow { b: BusinessId; owner: string; open?: boolean; seq?: boolean; person?: boolean; visible: boolean; seqName?: string }

const LIVE = ['active', 'awaiting_approval', 'awaiting_task']

function coordInfo(companyId: string, contactId?: string): CoordRow[] {
  const cur = Q.scope()
  const out: CoordRow[] = []
  for (const r of Q.relsOf(companyId)) {
    // A single-business workspace only flags the others; the all-businesses view flags the businesses you do not already work in.
    if (cur.includes(r.businessId) && Q.wsBiz()) continue
    if (!Q.wsBiz() && Q.member(r.businessId)) continue
    const open = S.deals.some(d => d.companyId === companyId && d.businessId === r.businessId && d.status === 'open')
    const seq = S.enrolments.some(e => e.businessId === r.businessId && LIVE.includes(e.status) && Q.contact(e.contactId)?.companyId === companyId)
    if (open || seq || (r.lastContacted && F.days(r.lastContacted, F.nowIso()) < 30)) out.push({ b: r.businessId, owner: r.ownerId, open, seq, visible: Q.member(r.businessId) })
  }
  if (contactId) {
    for (const e of S.enrolments.filter(x => x.contactId === contactId && LIVE.includes(x.status) && x.ownerId !== Q.me().id)) {
      if (!out.some(o => o.b === e.businessId && o.person)) out.push({ b: e.businessId, owner: e.ownerId, seq: true, person: true, visible: Q.member(e.businessId), seqName: Q.seq(e.seqId)?.name })
    }
  }
  return out
}

export const Coord: FC<CoordProps> = ({ companyId, contactId }) => {
  const c = coordInfo(companyId, contactId)
  if (!c.length) return null
  const fromB = Q.wsBiz() ?? Q.defaultBiz()
  return (
    <Banner
      tone="warn"
      action={
        <Btn size="sm" icon="swap" disabled={!Q.anyEdit()} onClick={() => UI.open('crossIntro', { companyId, toBiz: c[0].b, fromBiz: fromB })}>
          {c[0].visible ? 'Coordinate outreach' : 'Request introduction'}
        </Btn>
      }
    >
      <b>{c.some(x => x.person) ? 'This contact is already being approached by another salesperson.' : 'This organisation already has active sales engagement elsewhere in your portfolio.'}</b>
      <div className="sm" style={{ marginTop: 2 }}>
        {c.map((x, i) => (
          <div key={i}>
            {x.visible ? (
              <>
                <BizDot b={x.b} /> {Q.biz(x.b)?.name} — owner {Q.user(x.owner)?.name ?? 'unassigned'}
                {x.open ? ' · open opportunity' : ''}
                {x.seq ? ' · active outreach' + (x.seqName ? ' (“' + x.seqName + '”)' : '') : ''}
              </>
            ) : (
              <>
                <Icon n="lock" s={11} /> {Q.biz(x.b)?.name} — active engagement (details restricted)
              </>
            )}
          </div>
        ))}
      </div>
    </Banner>
  )
}

/** Returns [hiddenColumnKeys, toggle]; the choice is remembered per browser. */
export function useColumns(key: string, defs: string[]): [string[], (k: string) => void] {
  const [hid, setHid] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('salesos.cols.' + key)
      const v: unknown = raw ? JSON.parse(raw) : null
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : defs
    } catch {
      return defs
    }
  })
  const tog = (k: string): void => {
    const n = hid.includes(k) ? hid.filter(x => x !== k) : hid.concat(k)
    setHid(n)
    try {
      localStorage.setItem('salesos.cols.' + key, JSON.stringify(n))
    } catch {
      /* private mode or blocked storage: the choice just lasts for this visit */
    }
  }
  return [hid, tog]
}

export const ColMenu: FC<ColMenuProps> = ({ cols, hid, tog }) => (
  <Menu
    align="right"
    trigger={<Btn size="sm" icon="cols">Columns</Btn>}
    items={cols.filter(c => c.l && !c.fixed).map((c): MenuItem => ({ label: String(c.l), checked: !hid.includes(c.k), onClick: () => tog(c.k) }))}
  />
)

export const Views: FC<ViewsProps> = ({ page, q, apply }) => {
  const mine = S.savedViews.filter(v => v.page === page && v.ownerId === Q.me().id)
  const items: MenuItem[] = [
    { label: 'Saved views', head: true },
    ...mine.map((v): MenuItem => ({ label: v.name, onClick: () => apply(v.q) })),
    !mine.length && { label: 'No saved views', disabled: true },
    '-',
    {
      label: 'Save current view…', icon: 'plus',
      onClick: () => UI.ask(n => {
        if (n.trim()) {
          Act.saveView(page, n.trim(), q)
          UI.toast('View saved')
        }
      }, 'Name this view'),
    },
    { label: 'Reset filters', icon: 'refresh', onClick: () => apply({}) },
  ]
  return <Menu trigger={<Btn size="sm" icon="layers" iconRight="down">Views</Btn>} items={items} />
}

export const DealTable: FC<DealTableProps> = ({ rows, hideCo }) => {
  const cols: Array<Col<Deal> | false> = [
    { k: 'title', l: 'Deal', r: d => <span className="row"><BizDot b={d.businessId} />{Q.member(d.businessId) ? <b>{d.title}</b> : <span className="faint"><Icon n="lock" s={11} /> Restricted deal</span>}</span> },
    !hideCo && { k: 'co', l: 'Company', r: d => Q.company(d.companyId)?.name ?? '—', sort: d => Q.company(d.companyId)?.name },
    { k: 'stage', l: 'Stage', r: d => <Chip tone={d.status === 'won' ? 'ok' : d.status === 'lost' ? 'bad' : ''}>{Q.stage(d)?.name ?? '—'}</Chip>, sort: d => d.probability },
    { k: 'value', l: 'Value', right: true, r: d => <span className="num">{F.money(d.value)}</span> },
    { k: 'mrr', l: 'MRR', right: true, r: d => (d.mrr ? <span className="num">{F.money(d.mrr)}</span> : '—') },
    { k: 'close', l: 'Close', r: d => F.date(d.close) },
    { k: 'o', l: 'Owner', r: d => <Owner id={d.ownerId} /> },
  ]
  return (
    <DataTable
      rows={rows}
      onRow={d => { if (Q.member(d.businessId)) UI.nav('deal', { id: d.id }) }}
      empty={<Empty icon="kanban" title="No deals" body="Deals for this record will appear here once one is created." />}
      cols={cols.filter((c): c is Col<Deal> => !!c)}
    />
  )
}
