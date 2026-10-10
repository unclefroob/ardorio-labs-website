import { useState } from 'react'
import type { RosterioPushEntry, RosterioPushOutcome } from '../../api/contract'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { retryFailedPushes, useRosterioStatus } from '../../data/rosterio'
import { Banner, Btn, Card, Chip, Spinner } from '../../kit'
import { UI } from '../../ui/store'

const OUTCOME: Record<RosterioPushOutcome, { label: string; tone: string }> = {
  ok: { label: 'Sent', tone: 'ok' },
  failed: { label: 'Could not send', tone: 'bad' },
  skipped: { label: 'Not sent', tone: 'warn' },
}

function Row({ e }: { e: RosterioPushEntry }) {
  const o = OUTCOME[e.outcome] ?? { label: String(e.outcome), tone: '' }
  return (
    <div className="row wrap sm" style={{ padding: '3px 0', gap: 6 }}>
      <span className="faint xs" title={F.dt(e.at)}>{F.rel(e.at)}</span>
      <b>{Q.deal(e.dealId)?.title ?? 'A deal'}</b>
      <Chip tone={o.tone}>{o.label}</Chip>
      {e.reason && <span className="faint xs">{e.reason}</span>}
    </div>
  )
}

/** Whether Rosterio is switched on, and what happened to the last deals sent across. The URL and key are never shown. */
export function RosterioLinkCard() {
  const st = useRosterioStatus()
  const [busy, setBusy] = useState(false)
  if (!Q.member('ros')) return null
  const canRetry = Q.canAdmin('ros')

  const retry = async (): Promise<void> => {
    setBusy(true)
    const r = await retryFailedPushes()
    setBusy(false)
    UI.toast(r.ok ? 'Retried the failed sends' : r.message, r.ok ? 'ok' : 'bad')
  }

  const configured = st.s === 'ok' && st.status.configured
  return (
    <Card title="Rosterio CRM link" icon="zap">
      {(st.s === 'idle' || st.s === 'loading') && <div className="faint sm" role="status">Loading…</div>}
      {st.s === 'error' && (
        <div className="row sm" role="alert">
          <span className="faint">Status unavailable. {st.message}</span>
          <Btn size="xs" kind="ghost" onClick={st.reload}>Retry</Btn>
        </div>
      )}
      {st.s === 'ok' && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <Chip tone={configured ? 'ok' : 'warn'}>{configured ? 'Set up' : 'Not set up'}</Chip>
            <span className="faint xs">Rosterio deals are sent to Rosterio as leads. Accounts are only created when someone presses Provision.</span>
          </div>
          {!configured && <Banner tone="info">Not set up: ask an admin to set the Rosterio URL and key.</Banner>}
          {configured && (
            <div className="col" style={{ gap: 4 }}>
              {st.status.pendingFailures > 0 ? (
                <Banner
                  tone="warn"
                  action={canRetry ? <Btn size="sm" disabled={busy} onClick={() => void retry()}>{busy ? 'Retrying…' : 'Retry failed pushes'}</Btn> : undefined}
                >
                  {st.status.pendingFailures === 1 ? '1 deal could not be sent to Rosterio.' : `${st.status.pendingFailures} deals could not be sent to Rosterio.`}
                  {!canRetry && ' An admin can retry them.'}
                </Banner>
              ) : (
                <div className="sm"><b>No failed sends</b></div>
              )}
              <div className="b sm" style={{ marginTop: 10 }}>Last 20 sends</div>
              {busy && <Spinner />}
              {st.status.recent.length
                ? st.status.recent.slice(0, 20).map((e, i) => <Row key={e.at + e.dealId + i} e={e} />)
                : <div className="faint sm" style={{ padding: '4px 0' }}>Nothing has been sent to Rosterio yet.</div>}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
