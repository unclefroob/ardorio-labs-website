import type { DragEvent } from 'react'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import type { Deal } from '../../data/types'
import { Av, Btn, Chip, Icon, Link, Menu } from '../../kit'
import { tryMove } from '../../shared/moves'
import { UI } from '../../ui/store'

export function DealCard({ d }: { d: Deal }) {
  const co = Q.company(d.companyId)
  const rk = Q.risk(d)
  const nt = Q.nextTask(d)
  const pl = Q.pipeline(d.businessId)
  const can = Q.canEdit(d.businessId)
  const start = (e: DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.setData('text/plain', d.id)
    e.currentTarget.classList.add('drag')
  }
  const end = (e: DragEvent<HTMLDivElement>): void => e.currentTarget.classList.remove('drag')
  return (
    <div className="dc" draggable={can} onDragStart={start} onDragEnd={end} onClick={() => UI.nav('deal', { id: d.id })}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="b sm" style={{ lineHeight: 1.3 }}>
            <Link to="deal" id={d.id}>{d.title}</Link>
          </div>
          <div className="faint xs trunc">{co?.name ?? '—'}</div>
        </div>
        {rk && (
          <span title={rk.reasons.join(' · ')}>
            <Icon n="alert" s={14} style={{ color: rk.level === 'high' ? 'var(--bad2)' : 'var(--warn)' }} />
          </span>
        )}
      </div>
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <span className="b num sm">{F.money(d.value, 1)}</span>
        {!!d.mrr && d.businessId === 'ros' && <span className="faint xs num">{F.money(d.mrr)}/mo</span>}
        <span className="sp" />
        {d.priority === 'High' && <Chip tone="bad">High</Chip>}
        <Av u={Q.user(d.ownerId)} s={20} />
      </div>
      <div className="faint xs row" style={{ marginTop: 6, gap: 6 }}>
        <Icon n="cal" s={11} />
        {F.date(d.close)}
        <span>·</span>
        <Icon n="activity" s={11} />
        {F.rel(d.lastActivity)}
      </div>
      {nt ? (
        <div className="xs trunc" style={{ marginTop: 4, color: Q.overdue(nt) ? 'var(--bad2)' : 'var(--fg2)' }}>
          <Icon n="checksq" s={11} /> {nt.title}
        </div>
      ) : (
        d.status === 'open' && <div className="xs" style={{ marginTop: 4, color: 'var(--warn)' }}>No next step</div>
      )}
      {can && (
        <div style={{ marginTop: 6 }}>
          <Menu
            trigger={<Btn size="xs" kind="ghost" iconRight="down" aria-label={`Move ${d.title} to stage`}>Move</Btn>}
            items={pl.stages.filter(s => s.id !== d.stageId).map(s => ({ label: s.name, right: s.prob + '%', onClick: () => tryMove(d.id, s.id) }))}
          />
        </div>
      )}
    </div>
  )
}
