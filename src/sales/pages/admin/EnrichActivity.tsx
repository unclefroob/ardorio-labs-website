import { useCallback, useEffect, useState } from 'react'
import type { BusinessId, EnrichLogEntry, EnrichLogOutcome } from '../../api/contract'
import { fetchEnrichLog } from '../../ai/client'
import { F } from '../../data/F'
import { BizChip, Btn, Chip } from '../../kit'

const OUTCOME: Record<EnrichLogOutcome, { label: string; tone: string }> = {
  ok: { label: 'OK', tone: 'ok' },
  provider_error: { label: 'Provider error', tone: 'bad' },
  bad_output: { label: 'Unusable answer', tone: 'warn' },
  cap: { label: 'Limit reached', tone: 'warn' },
}

/** What a call returned, from the server's own counts. Zeros are left out. */
export function countsText(e: EnrichLogEntry): string {
  const c = e.counts
  const parts = e.tool === 'find'
    ? [[c.found, 'found'], [c.withheld, 'withheld']]
    : [[c.published, 'published'], [c.inferred, 'inferred'], [c.unconfirmed, 'unconfirmed'], [c.withheld, 'withheld']]
  const shown = parts.filter(([n]) => typeof n === 'number' && n > 0).map(([n, l]) => `${n} ${l}`)
  return shown.length ? shown.join(', ') : 'No values'
}

type State = { s: 'loading' } | { s: 'error'; message: string } | { s: 'ok'; entries: EnrichLogEntry[] }

/** The business's last 20 enrichment calls (admins only: the server enforces it). Shows only what the server logged. */
export function EnrichActivity({ b, showBiz }: { b: BusinessId; showBiz?: boolean }) {
  const [st, setSt] = useState<State>({ s: 'loading' })
  const [nonce, setNonce] = useState(0)
  const load = useCallback((signal: AbortSignal) => {
    void fetchEnrichLog(b, { limit: 20, signal }).then(r => {
      if (signal.aborted || r.status === 'cancelled') return
      setSt(r.status === 'ok' ? { s: 'ok', entries: r.entries.slice(0, 20) } : { s: 'error', message: r.message })
    })
  }, [b])
  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => ac.abort()
  }, [load, nonce])

  return (
    <div className="col" style={{ gap: 2 }}>
      {showBiz && <div className="row sm"><BizChip b={b} /></div>}
      {st.s === 'loading' && <div className="faint sm" role="status" style={{ padding: '4px 0' }}>Loading…</div>}
      {st.s === 'error' && (
        <div className="row sm" role="alert" style={{ padding: '4px 0' }}>
          <span className="faint">Activity unavailable. {st.message}</span>
          <Btn size="xs" kind="ghost" onClick={() => { setSt({ s: 'loading' }); setNonce(n => n + 1) }}>Retry</Btn>
        </div>
      )}
      {st.s === 'ok' && !st.entries.length && <div className="faint sm" style={{ padding: '4px 0' }}>No enrichment calls yet</div>}
      {st.s === 'ok' && st.entries.map(e => (
        <div key={e.id} className="row wrap sm" style={{ padding: '3px 0', gap: 6 }}>
          <span className="faint xs" title={F.dt(e.at)}>{F.rel(e.at)}</span>
          <b>{e.userName}</b>
          <span>{e.tool === 'find' ? 'Find people' : 'Enrich contact'}</span>
          <Chip tone={OUTCOME[e.outcome]?.tone}>{OUTCOME[e.outcome]?.label ?? e.outcome}</Chip>
          <span className="faint xs">{countsText(e)}</span>
        </div>
      ))}
    </div>
  )
}
