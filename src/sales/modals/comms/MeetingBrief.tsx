import { useMemo } from 'react'
import { localAi } from '../../ai/client'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { Av, Btn, Chip, Empty, Icon, Modal } from '../../kit'
import { UI } from '../../ui/store'
import { MissingModal } from '../entities/guards'
import { WebBrief } from './WebBrief'

export function MeetingBrief({ id }: { id?: string }) {
  const m = id ? Q.meeting(id) : undefined
  const b = useMemo(() => (m ? localAi.meetingBrief(m) : null), [m])
  if (!m || !b) return <MissingModal title="Meeting briefing" what="Meeting" />
  const stage = b.deal ? Q.stage(b.deal)?.name : undefined
  return (
    <Modal
      title={'Briefing: ' + m.title}
      icon="spark"
      sub={F.dt(m.start) + ' · ' + m.duration + ' min · ' + m.type}
      width={680}
      footer={
        <>
          <Btn onClick={UI.close}>Close</Btn>
          {m.dealId && <Btn onClick={() => { UI.close(); UI.nav('deal', { id: m.dealId ?? undefined }) }}>Open deal</Btn>}
          <Btn kind="pri" onClick={() => { UI.close(); UI.open('logMeeting', { id: m.id }) }}>Open meeting notes</Btn>
        </>
      }
    >
      <div className="col gap12">
        <div className="row"><Chip icon="spark" title="Assembled by rules from CRM records. No AI model is used for this briefing.">Briefing assembled from CRM records</Chip></div>
        {b.deal && (
          <div className="card card-b row wrap">
            <Icon n="kanban" />
            <b>{b.deal.title}</b>
            {stage && <Chip>{stage}</Chip>}
            <span className="num">{F.money(b.deal.value)}</span>
            {b.risks.map(r => <Chip key={r} tone="warn">{r}</Chip>)}
          </div>
        )}
        <div>
          <div className="b sm" style={{ marginBottom: 6 }}>Attendees</div>
          {b.people.length ? (
            b.people.map(p => (
              <div key={p.id} className="row sm" style={{ padding: '4px 0' }}>
                <Av name={p.name} s={22} />
                <b>{p.name}</b>
                <span className="muted">{p.title}</span>
                <Chip>{p.role}</Chip>
                <span className="sp" />
                <span className="faint xs">{p.last ? 'Last: ' + (p.last.subject ?? '').slice(0, 40) + ' · ' + F.rel(p.last.ts) : 'No prior interaction'}</span>
              </div>
            ))
          ) : (
            <Empty icon="users" title="No attendees recorded" body="Add participants in the meeting notes so the briefing can show their history." />
          )}
        </div>
        {b.lastMeeting && (
          <div>
            <div className="b sm">Last meeting ({F.date(b.lastMeeting.start)})</div>
            <div className="muted sm" style={{ marginTop: 4 }}>{b.lastMeeting.summary || 'No summary was recorded.'}</div>
          </div>
        )}
        <div className="grid g2">
          <div>
            <div className="b sm" style={{ marginBottom: 6 }}>Suggested agenda</div>
            <ol className="sm" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{b.agenda.map(a => <li key={a}>{a}</li>)}</ol>
          </div>
          <div>
            <div className="b sm" style={{ marginBottom: 6 }}>Questions to cover</div>
            <ul className="sm" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{b.questions.map(a => <li key={a}>{a}</li>)}</ul>
          </div>
        </div>
        <WebBrief meeting={m} />
        <div>
          <div className="b sm" style={{ marginBottom: 6 }}>Recent activity</div>
          {b.recent.length ? b.recent.map(a => <div key={a.id} className="sm muted">· {a.subject} <span className="faint">({F.rel(a.ts)})</span></div>) : <div className="faint sm">No activity recorded for this company yet.</div>}
        </div>
      </div>
    </Modal>
  )
}
