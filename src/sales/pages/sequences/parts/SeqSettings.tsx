import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { S } from '../../../data/store'
import { Card, Ck, Fld, Inp, Sel, TA, Toggle } from '../../../kit'
import type { Draft } from './conds'

const ALL_EXITS = ['Human reply', 'Meeting booked', 'Unsubscribe', 'Invalid email', 'Manually removed', 'Eligibility revoked']
const LOCKED = ['Human reply', 'Unsubscribe']

export function SeqSettings({ dr, upd, can, s }: { dr: Draft; upd: (p: Partial<Draft>) => void; can: boolean; s: Draft }) {
  const mbs = S.mailboxes.filter(m => m.businessIds.includes(dr.businessId))
  const versions = s.versions ?? []
  return (
    <div className="split">
      <Card title="Configuration">
        <div className="grid g2">
          <Fld label="Name" style={{ gridColumn: '1/-1' }}><Inp value={dr.name} onChange={v => upd({ name: v })} disabled={!can} /></Fld>
          <Fld label="Description" style={{ gridColumn: '1/-1' }}><TA value={dr.description} onChange={v => upd({ description: v })} rows={2} disabled={!can} /></Fld>
          <Fld label="Owner">
            <Sel value={dr.ownerId} onChange={v => upd({ ownerId: v })} disabled={!can} options={Q.usersIn(dr.businessId).map(u => [u.id, u.name + (u.id === Q.me().id ? ' (you)' : '')] as const)} />
          </Fld>
          <Fld label="Sender mailbox">
            <Sel value={dr.mailboxId} onChange={v => upd({ mailboxId: v })} disabled={!can} placeholder={mbs.length ? 'Select mailbox…' : 'No mailbox for this business'} options={mbs.map(m => [m.id, m.address + (m.status !== 'connected' ? ' (disconnected)' : '')] as const)} />
          </Fld>
          <Fld label="Daily sending limit"><Inp value={dr.dailyLimit} onChange={v => upd({ dailyLimit: +v || 0 })} disabled={!can} inputMode="numeric" /></Fld>
          <Fld label="Sending window">
            <div className="row" style={{ gap: 6 }}>
              <Inp aria-label="Window start hour" value={dr.window[0]} onChange={v => upd({ window: [+v || 0, dr.window[1]] })} style={{ width: 60 }} disabled={!can} inputMode="numeric" />
              <span>to</span>
              <Inp aria-label="Window end hour" value={dr.window[1]} onChange={v => upd({ window: [dr.window[0], +v || 0] })} style={{ width: 60 }} disabled={!can} inputMode="numeric" />
              <span className="faint sm">hrs (Melbourne)</span>
            </div>
          </Fld>
          <Fld label="Business days only"><Toggle on={dr.businessDays} label="Business days only" disabled={!can} onChange={v => upd({ businessDays: v })} /></Fld>
          <Fld label="Shared with team"><Toggle on={dr.shared} label="Shared with team" disabled={!can} onChange={v => upd({ shared: v })} /></Fld>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="b sm" style={{ marginBottom: 6 }}>Exit conditions</div>
          <div className="col" style={{ gap: 4 }}>
            {ALL_EXITS.map(e => (
              <Ck key={e} checked={dr.exits.includes(e)} disabled={!can || LOCKED.includes(e)} onChange={v => upd({ exits: v ? dr.exits.concat(e) : dr.exits.filter(x => x !== e) })}>
                {e}
                {LOCKED.includes(e) && <span className="faint xs"> · always on</span>}
              </Ck>
            ))}
          </div>
        </div>
      </Card>
      <Card title="Version history">
        {versions.length ? (
          versions.slice().reverse().map(v => (
            <div key={v.n} className="row sm" style={{ padding: '4px 0' }}>
              <b>v{v.n + 1}</b>
              <span className="muted">{v.steps} steps before change</span>
              <span className="sp" />
              <span className="faint xs">{Q.user(v.by)?.name ?? 'Unknown user'} · {F.dt(v.ts)}</span>
            </div>
          ))
        ) : (
          <div className="faint sm">v1 — created {F.date(s.createdAt)} by {Q.user(s.createdBy)?.name ?? 'Unknown user'}</div>
        )}
        <div className="faint xs" style={{ marginTop: 8 }}>Edits apply to future steps of existing enrolments; already-executed steps are unchanged.</div>
      </Card>
    </div>
  )
}
