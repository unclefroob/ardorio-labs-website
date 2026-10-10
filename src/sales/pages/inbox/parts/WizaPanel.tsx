import { useEffect, useRef, useState } from 'react'
import { aiNotConfigured, enrichContact, enrichUsage } from '../../../ai/client'
import { getEnrich, getUsage, remaining, useEnrichUsage } from '../../../ai/enrichCache'
import type { BusinessId } from '../../../api/contract'
import { Q } from '../../../data/Q'
import { useStore } from '../../../data/store'
import { AiNotConfigured, Banner, Btn, Card, Chip, Ck, CtLink, Empty, FilterBar, SearchInp } from '../../../kit'
import { UI } from '../../../ui/store'
import { includesCI } from './util'

type RowState = 'queued' | 'running' | 'cached' | 'found' | 'none' | 'withheld' | 'failed' | 'cancelled' | 'skipped'
const TONE: Record<RowState, string> = { queued: '', running: 'info', cached: 'ok', found: 'ok', none: '', withheld: 'warn', failed: 'bad', cancelled: '', skipped: 'warn' }
const LABEL: Record<RowState, string> = {
  queued: 'Queued', running: 'Searching…', cached: 'Already looked up', found: 'Found', none: 'Nothing found', withheld: 'Withheld — no verifiable source',
  failed: 'Failed', cancelled: 'Cancelled', skipped: 'Not run',
}
const FIELD: Record<string, string> = { email: 'email', email2: 'email 2', phone: 'phone', mobile: 'mobile', title: 'title', linkedin: 'LinkedIn' }

interface Row { state: RowState; note?: string }

export function WizaPanel({ onImport }: { onImport: () => void }) {
  useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [order, setOrder] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'warn' | 'bad' | 'info'; text: string } | null>(null)
  const live = useRef<AbortController | null>(null)
  const notConfigured = aiNotConfigured('xai')

  // Only contacts in a business the user can edit can be enriched, and each lookup is billed to that business.
  const bizOf = (id: string): BusinessId | undefined => {
    const ct = Q.contact(id)
    const b = ct ? Q.primaryBiz(ct) : undefined
    return b && Q.canEdit(b) ? b : undefined
  }
  const all = Q.contacts().filter(c => bizOf(c.id))
  const pool = all
    .filter(c => !q || includesCI(c.name + ' ' + (Q.company(c.companyId)?.name ?? ''), q))
    .sort((a, c) => Number(!!a.email) + Number(!!(a.phone || a.mobile)) - (Number(!!c.email) + Number(!!(c.phone || c.mobile))))
    .slice(0, 40)

  const home = Q.defaultBiz()
  const usage = useEnrichUsage(home)
  const left = remaining(usage)

  useEffect(() => {
    if (!home || notConfigured) return   // refreshed on every open; the usage endpoint is free
    const ac = new AbortController()
    void enrichUsage(home, ac.signal)
    return () => ac.abort()
  }, [home, notConfigured])
  useEffect(() => () => live.current?.abort(), [])

  const set = (id: string, r: Row): void => setRows(p => ({ ...p, [id]: r }))

  const run = async (): Promise<void> => {
    if (running || !sel.length) return
    setMsg(null)
    // Allowance is per business, so check each business the selection bills to before the first call.
    const byBiz = new Map<BusinessId, number>()
    for (const id of sel) {
      const b = bizOf(id)
      if (b && !getEnrich(id)) byBiz.set(b, (byBiz.get(b) ?? 0) + 1)
    }
    const ac = new AbortController()
    live.current = ac
    setRunning(true)
    try {
      for (const b of byBiz.keys()) {
        await enrichUsage(b, ac.signal)   // always fresh before checking the allowance
      }
      if (ac.signal.aborted) return
      for (const [b, n] of byBiz) {
        const l = remaining(getUsage(b))
        if (l !== null && n > l) {
          setMsg({ tone: 'warn', text: `${Q.biz(b)?.name ?? b} has ${l} lookup(s) left this month but ${n} are selected. Deselect ${n - l} and try again; nothing was run.` })
          return
        }
      }
      const ids = [...sel]
      setOrder(ids)
      setRows(Object.fromEntries(ids.map(id => [id, { state: 'queued' } as Row])))
      let streak = 0
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const stopRest = (state: RowState, note?: string): void => {
          setRows(p => {
            const next = { ...p }
            for (const rest of ids.slice(i)) if (next[rest]?.state === 'queued' || next[rest]?.state === 'running') next[rest] = { state, note }
            return next
          })
        }
        if (ac.signal.aborted) return stopRest('cancelled')
        if (getEnrich(id)) { set(id, { state: 'cached' }); continue }
        const b = bizOf(id)
        if (!b) { set(id, { state: 'failed', note: 'No edit access' }); continue }
        set(id, { state: 'running' })
        const o = await enrichContact(id, b, { signal: ac.signal })
        if (o.status === 'cancelled') return stopRest('cancelled')
        if (o.status === 'cap') {
          set(id, { state: 'skipped', note: 'Monthly limit reached' })
          stopRest('skipped', 'Monthly limit reached')
          return setMsg({ tone: 'warn', text: `Stopped: the monthly limit for ${Q.biz(b)?.name ?? b} is reached. The rest were not run.` })
        }
        if (o.status === 'notConfigured') {
          stopRest('skipped', 'Grok is not configured')
          return setMsg({ tone: 'warn', text: 'Stopped: Grok is not configured on the server.' })
        }
        if (o.status === 'found' || o.status === 'none' || o.status === 'withheld') {
          streak = 0
          set(id, { state: o.status })
        } else {
          streak++
          set(id, { state: 'failed', note: o.status === 'providerError' ? 'Service problem (not counted)' : o.status === 'badOutput' ? 'Unusable answer (counted)' : 'message' in o ? o.message : 'Failed' })
          if (streak >= 3) {
            stopRest('skipped', 'Stopped after 3 failures')
            return setMsg({ tone: 'bad', text: 'Stopped after 3 failures in a row. Try again shortly.' })
          }
        }
      }
    } finally {
      if (live.current === ac) live.current = null
      setRunning(false)
    }
  }

  const cancel = (): void => {
    live.current?.abort()
  }

  const total = order.length
  const finished = order.filter(id => rows[id] && rows[id].state !== 'queued' && rows[id].state !== 'running').length
  const toCall = sel.filter(id => !getEnrich(id)).length
  const selBiz = [...new Set(sel.map(bizOf))]
  const selLeft = selBiz.length === 1 && selBiz[0] ? remaining(getUsage(selBiz[0])) : left
  const over = selLeft !== null && toCall > selLeft

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <AiNotConfigured provider="xai" />
        {!notConfigured && usage && <Chip>{left} of {usage.limit} lookups left this month</Chip>}
        <span className="sm muted">Grok searches public web and X sources. Results are suggestions to review, never applied automatically.</span>
      </div>
      <Card title="Find & enrich existing contacts" icon="zap" pad={false}>
        {all.length === 0 ? (
          <Empty icon="users" title="No contacts to enrich yet" body="Import leads or add a contact, then enrich them here." action={<Btn kind="pri" icon="upload" onClick={onImport}>Import leads</Btn>} />
        ) : (
          <>
            <FilterBar>
              <SearchInp value={q} onChange={setQ} placeholder="Search contacts" w={200} />
              <span className="sp" />
              {running
                ? <Btn size="sm" onClick={cancel}>Cancel batch</Btn>
                : <Btn size="sm" kind="pri" disabled={!sel.length || notConfigured || selLeft === 0 || over} onClick={() => void run()}>{'Enrich ' + (sel.length || '') + ' selected'}</Btn>}
            </FilterBar>
            {over && <Banner tone="warn">{toCall} selected but only {selLeft} lookup(s) left this month. Deselect {toCall - (selLeft ?? 0)} to run the batch.</Banner>}
            {running && (
              <div style={{ padding: '8px 12px' }}>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished} aria-label="Batch progress" style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${total ? (finished / total) * 100 : 0}%`, background: 'var(--acc)', transition: 'width .2s' }} />
                </div>
                <div className="faint xs" style={{ marginTop: 4 }}>{finished} of {total} done. Each lookup takes 30–60 s. Cancelling stops the batch, but a request already sent still counts against the allowance.</div>
              </div>
            )}
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {pool.map(c => (
                <div key={c.id} className="row" style={{ padding: '6px 12px', borderBottom: '1px solid var(--line)' }}>
                  <Ck checked={sel.includes(c.id)} disabled={running} label={'Select ' + c.name} onChange={on => setSel(on ? sel.concat(c.id) : sel.filter(x => x !== c.id))} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm b">{c.name}</div>
                    <div className="faint xs trunc">{Q.company(c.companyId)?.name}</div>
                  </div>
                  {!c.email && <Chip tone="warn">No email</Chip>}
                  {!(c.phone || c.mobile) && <Chip tone="warn">No phone</Chip>}
                </div>
              ))}
              {!pool.length && <Empty icon="search" title="No contacts match" body="Try a different name or company." action={<Btn size="sm" onClick={() => setQ('')}>Clear search</Btn>} />}
            </div>
          </>
        )}
      </Card>
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      {total > 0 && (
        <Card title="Batch results" pad={false}>
          <div className="tw">
            <table className="tbl">
              <thead><tr><th scope="col">Contact</th><th scope="col">Status</th><th scope="col">Suggested</th><th scope="col" aria-label="Actions" /></tr></thead>
              <tbody>
                {order.map(id => {
                  const r = rows[id] ?? { state: 'queued' as RowState }
                  const hit = getEnrich(id)?.res
                  const fields = hit && hit.status === 'found' ? [...new Set(hit.suggestions.map(s => FIELD[s.field] ?? s.field))] : []
                  return (
                    <tr key={id}>
                      <td><CtLink id={id} /></td>
                      <td><Chip tone={TONE[r.state]}>{LABEL[r.state]}</Chip>{r.note && <span className="faint xs" style={{ marginLeft: 6 }}>{r.note}</span>}</td>
                      <td className="w sm">{fields.length ? fields.join(', ') : '—'}</td>
                      <td>{fields.length > 0 && <Btn size="xs" onClick={() => UI.open('enrich', { contactId: id })}>Review &amp; apply</Btn>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
