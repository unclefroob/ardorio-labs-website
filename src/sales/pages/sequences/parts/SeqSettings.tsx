import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { S } from '../../../data/store'
import { Card, Fld, Icon, Inp, Seg, Sel, TA, Toggle } from '../../../kit'
import { dueWords, KINDS, LEAD_FOR_RULES, ruleFor, type ReplyKind, type ReplyRule } from '../../../shared/replyRules'
import type { Draft } from './conds'


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
      </Card>
      <ReplyRules dr={dr} upd={upd} can={can} />
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

type Rules = Partial<Record<ReplyKind, Partial<ReplyRule>>>

/** "When they reply": what happens after a reply stops the sequence, by kind. The business's defaults, or changed for this sequence. */
function ReplyRules({ dr, upd, can }: { dr: Draft; upd: (p: Partial<Draft>) => void; can: boolean }) {
  const biz = Q.biz(dr.businessId)
  const bizRules = (biz as { replyRules?: Rules } | undefined)?.replyRules
  const own = dr.replyRules as Rules | undefined
  const custom = !!own
  const edit = can && custom
  const set = (kind: ReplyKind, p: Partial<ReplyRule>): void => {
    const cur = ruleFor(kind, own, bizRules)
    upd({ replyRules: { ...(own ?? {}), [kind]: { ...cur, ...p } } })
  }
  return (
    <Card
      title="When they reply"
      right={<Seg value={custom ? 'own' : 'biz'} onChange={v => { if (can) upd({ replyRules: v === 'own' ? { ...(own ?? {}) } : undefined }) }} opts={[['biz', `${biz?.name ?? 'Business'} defaults`], ['own', 'Changed for this sequence']]} />}
      pad={false}
    >
      <div className="faint sm" style={{ padding: '10px 16px' }}>Every reply stops this sequence for that person the moment it arrives. These rules decide what happens next.</div>
      <table className="tbl">
        <thead><tr><th>They say</th><th>SalesOS does straight away</th><th>Then</th></tr></thead>
        <tbody>
          {KINDS.map(({ kind, label, example, does }) => {
            const r = ruleFor(kind, own, bizRules)
            return (
              <tr key={kind}>
                <td><b>{label}</b><div className="faint xs">{example}</div></td>
                <td className="xs">{does}{r.leadStatus && kind !== 'ooo' ? <>, sets the lead to <b>{r.leadStatus}</b></> : null}</td>
                <td>
                  {kind === 'ooo' ? (
                    <Sel aria-label="Then, for out of office" value={r.then} onChange={v => set(kind, { then: v as ReplyRule['then'] })} disabled={!edit} options={[['continue', 'Carry on where it left off'], ['end', 'End the sequence']]} />
                  ) : (
                    <div className="col" style={{ gap: 6 }}>
                      <Sel aria-label={'Then, for ' + label} value={r.then} onChange={v => set(kind, { then: v as ReplyRule['then'] })} disabled={!edit} options={[['task', 'Make a task'], ['restart', 'Start again later'], ['nothing', 'Nothing more']]} />
                      {r.then === 'task' && (
                        <div className="row" style={{ gap: 6 }}>
                          <Inp aria-label={'Task for ' + label} value={r.taskTitle ?? ''} onChange={v => set(kind, { taskTitle: v })} disabled={!edit} style={{ flex: 1 }} />
                          <Sel aria-label={'Due, for ' + label} value={String(r.taskDays ?? 0)} onChange={v => set(kind, { taskDays: +v })} disabled={!edit} options={[['0', 'today'], ['1', 'tomorrow'], ['3', 'in 3 days'], ['7', 'in a week']]} style={{ width: 120 }} />
                        </div>
                      )}
                      {r.then === 'restart' && (
                        <Sel aria-label={'Start again, for ' + label} value={String(r.restartDays ?? 60)} onChange={v => set(kind, { restartDays: +v })} disabled={!edit} options={[['30', 'from step 1 in 30 days'], ['60', 'from step 1 in 60 days'], ['90', 'from step 1 in 90 days'], ['180', 'from step 1 in 6 months']]} />
                      )}
                      <Sel aria-label={'Lead status, for ' + label} value={r.leadStatus ?? ''} onChange={v => set(kind, { leadStatus: v || undefined })} disabled={!edit} placeholder="Leave the lead status" options={LEAD_FOR_RULES.map(x => [x, 'Set lead to ' + x] as const)} />
                      {!edit && r.then === 'task' && <span className="faint xs">Task: {r.taskTitle}, {dueWords(r.taskDays)}</span>}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          <tr><td><b>Unsubscribe</b><div className="faint xs">“Please remove me”</div></td><td className="xs">Stops it and adds them to {biz?.name ?? 'the business'}'s suppression list</td><td className="xs faint"><span className="row"><Icon n="lock" s={12} />Always. Opt-outs are never optional.</span></td></tr>
          <tr><td><b>Bounce</b><div className="faint xs">The mail server says the address is bad</div></td><td className="xs">Stops it, suppresses the address everywhere, marks it bounced</td><td className="xs faint"><span className="row"><Icon n="lock" s={12} />Always</span></td></tr>
        </tbody>
      </table>
      <div className="faint xs" style={{ padding: '10px 16px' }}>Replies are sorted by fixed rules on the words they use. If one is sorted wrongly, change its label in the Inbox.</div>
    </Card>
  )
}
