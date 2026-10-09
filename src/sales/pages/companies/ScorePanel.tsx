import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Contact } from '../../data/types'
import { Btn, Card, Chip, Prog, ScoreRing, useSim } from '../../kit'
import { UI } from '../../ui/store'

export function ScorePanel({ ct, b }: { ct: Contact; b: BusinessId }) {
  const [busy, run] = useSim(600)
  const [, bump] = useState(0)
  const s = Q.score(ct.id, b)
  const r = Q.crel(ct.id, b)

  const flag = (): void => {
    if (!r) return
    Act.updateCrel(r.id, { scoreFlag: 'Marked inaccurate by ' + Q.me().name + ' · ' + F.date(F.nowIso()) })
    UI.toast('Score flagged as inaccurate')
  }
  const review = (): void => {
    const manager = S.teams.find(t => t.businessId === b)?.managerId
    Act.createTask({
      title: 'Review lead score for ' + ct.name + ' (' + s.total + ')',
      type: 'Administrative',
      businessId: b,
      assigneeId: manager || Q.me().id,
      due: F.addDays(F.nowIso().slice(0, 10) + 'T10:00', 1),
      contactId: ct.id,
      companyId: ct.companyId,
      source: 'Score review request',
    })
    UI.toast('Manager review requested')
  }

  return (
    <Card
      title={'Lead score · ' + (Q.biz(b)?.name ?? '')}
      icon="target"
      right={<Btn size="xs" kind="ghost" icon="refresh" disabled={busy} onClick={() => run(() => { bump(x => x + 1); UI.toast('Score recalculated: ' + Q.score(ct.id, b).total) })}>{busy ? '…' : 'Recalculate'}</Btn>}
    >
      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <ScoreRing v={s.total} s={58} />
        <div>
          <Chip tone={Q.scoreTone(s.label)}>{s.label}</Chip>
          <div className="sm muted" style={{ marginTop: 4 }}>Explainable, business-specific. No personal or sensitive attributes are used.</div>
        </div>
      </div>
      <div className="col" style={{ gap: 7 }}>
        {s.parts.map(([l, v, m]) => (
          <div key={l}>
            <div className="row xs"><span className="muted">{l}</span><span className="sp" /><span className="num">{v}/{m}</span></div>
            <Prog v={m ? (v / m) * 100 : 0} h={5} />
          </div>
        ))}
      </div>
      {s.pos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="b xs">Positive signals</div>
          {s.pos.map(p => <div key={p} className="sm" style={{ color: 'var(--ok)' }}>+ {p}</div>)}
        </div>
      )}
      {s.missing.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="b xs">Missing information</div>
          {s.missing.map(p => <div key={p} className="sm muted">– {p}</div>)}
        </div>
      )}
      {s.next && (
        <div className="card card-b" style={{ marginTop: 10, background: 'var(--surf2)' }}>
          <div className="xs faint">Recommended next action</div>
          <div className="sm b">{s.next}</div>
        </div>
      )}
      {r?.scoreFlag && <div className="xs" style={{ marginTop: 8, color: 'var(--warn)' }}>Flagged: {r.scoreFlag}</div>}
      {Q.canEdit(b) && (
        <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>
          {s.missing.length > 0 && <Btn size="xs" icon="zap" onClick={() => UI.open('enrich', { contactId: ct.id })}>Fill gaps with Wiza</Btn>}
          <Btn size="xs" kind="ghost" icon="flag" disabled={!r} onClick={flag}>Flag inaccurate</Btn>
          <Btn size="xs" kind="ghost" onClick={review}>Request manager review</Btn>
        </div>
      )}
    </Card>
  )
}
