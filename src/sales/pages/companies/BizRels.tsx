import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { Company } from '../../data/types'
import { cross } from '../../ai/rules'
import { BizDot, Btn, Card, Chip, DlLink, Icon, Owner, Sel } from '../../kit'
import { UI } from '../../ui/store'

const STATUSES = ['Prospecting', 'Active opportunity', 'Customer', 'Nurture', 'Not applicable']

export function BizRels({ c }: { c: Company }) {
  const sugg = cross().filter(x => x.companyId === c.id)
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid g2">
        {S.businesses.map(bz => {
          const r = Q.rel(c.id, bz.id)
          const mem = Q.member(bz.id)
          const ds = S.deals.filter(d => d.companyId === c.id && d.businessId === bz.id)
          const op = ds.filter(Q.open)
          const sg = sugg.find(x => x.toBiz === bz.id)
          return (
            <Card
              key={bz.id}
              title={<span className="row"><BizDot b={bz.id} />{bz.name}</span>}
              right={
                r
                  ? (mem ? <Chip tone={op.length ? 'acc' : ''}>{op.length ? 'Active opportunity' : r.status}</Chip> : <Chip icon="lock">Restricted</Chip>)
                  : <Chip>{sg ? 'Potential fit' : 'No relationship'}</Chip>
              }
            >
              {r && mem && (
                <div className="col" style={{ gap: 8 }}>
                  <dl className="dl">
                    <dt>Owner</dt>
                    <dd className="row">
                      <Owner id={r.ownerId} />
                      {Q.canManage(bz.id) && <Btn size="xs" kind="ghost" onClick={() => UI.open('reassign', { kind: 'rel', id: r.id, businessId: bz.id })}>Reassign</Btn>}
                    </dd>
                    <dt>Status</dt>
                    <dd>
                      {Q.canEdit(bz.id)
                        ? <Sel className="sm" style={{ width: 180 }} aria-label={bz.name + ' relationship status'} value={r.status} onChange={v => Act.updateRel(r.id, { status: v })} options={STATUSES.includes(r.status) ? STATUSES : [r.status, ...STATUSES]} />
                        : r.status}
                    </dd>
                    <dt>Priority</dt>
                    <dd>{r.priority}</dd>
                    <dt>Lead source</dt>
                    <dd>{r.source}</dd>
                    <dt>Last contacted</dt>
                    <dd>{r.lastContacted ? F.rel(r.lastContacted) : '—'}</dd>
                    <dt>Deals</dt>
                    <dd>
                      {ds.length
                        ? ds.map(d => <div key={d.id}><DlLink id={d.id} /> <span className="faint xs">{Q.stage(d)?.name} · {F.money(d.value, true)}</span></div>)
                        : '—'}
                    </dd>
                  </dl>
                </div>
              )}
              {r && !mem && (
                <div className="col" style={{ gap: 8 }}>
                  <div className="sm muted">
                    {op.length ? 'This business has an active engagement with ' + c.name + '. Deal values, emails and notes are restricted to its team.' : 'This business has a relationship with ' + c.name + '.'}
                  </div>
                  <Btn size="sm" icon="swap" disabled={!Q.anyEdit()} onClick={() => UI.open('crossIntro', { companyId: c.id, toBiz: bz.id, fromBiz: Q.wsBiz() ?? Q.defaultBiz() })}>Request introduction</Btn>
                </div>
              )}
              {!r && (
                <div className="col" style={{ gap: 8 }}>
                  {sg ? (
                    <div className="ai card-b">
                      <div className="ai-h"><Icon n="spark" s={13} />Fit signal</div>
                      <div className="sm" style={{ marginTop: 4 }}>{sg.reason}</div>
                      <div className="faint xs" style={{ marginTop: 4 }}>{sg.stakeholders.length} relevant stakeholder(s) on file</div>
                    </div>
                  ) : (
                    <div className="faint sm">{bz.id === 'pth' && !/Education|Career/.test(c.industry) ? 'Not applicable for this organisation type.' : 'No active relationship.'}</div>
                  )}
                  <div className="row wrap" style={{ gap: 6 }}>
                    {Q.canEdit(bz.id) && <Btn size="sm" icon="plus" onClick={() => { Act.linkCompany(c.id, bz.id); UI.toast(bz.name + ' relationship created — master company reused') }}>Create {bz.name} relationship</Btn>}
                    {sg && <Btn size="sm" icon="swap" onClick={() => UI.open('crossIntro', { companyId: c.id, toBiz: bz.id, fromBiz: sg.fromBiz })}>Cross-business introduction</Btn>}
                    {sg && <Btn size="sm" kind="ghost" onClick={() => { Act.crossDismiss(sg.key); UI.toast('Suggestion dismissed') }}>Dismiss</Btn>}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
