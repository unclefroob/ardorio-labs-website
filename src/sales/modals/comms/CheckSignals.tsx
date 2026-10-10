import { useEffect, useRef, useState } from 'react'
import { checkCompany } from '../../ai/intelRun'
import { isFailure, type EnrichFailure } from '../../ai/client'
import type { BusinessId } from '../../api/contract'
import { Q } from '../../data/Q'
import { ageDays } from '../../data/signalAdjust'
import { useStore } from '../../data/store'
import { AiNotConfigured, Banner, Btn, Chip, Ck, Empty, Modal, Spinner } from '../../kit'
import { daysAgo } from '../../shared/intelText'
import { useLookups } from '../../shared/useLookups'
import { FailureBanner } from './Enrich'
import { UI } from '../../ui/store'
import { NoEditModal } from '../entities/guards'

/** A company is pre-selected when its signals were never checked, or not for this many days. */
export const STALE_DAYS = 30

interface Row { companyId: string; name: string; deals: number; checkedAt: string | undefined }

export function CheckSignals({ businessId }: { businessId?: BusinessId }) {
  const b = [businessId, Q.defaultBiz()].find((x): x is BusinessId => !!x && Q.canEdit(x))
  if (!b) return <NoEditModal title="Check signals" what="check company signals" />
  return <Flow b={b} />
}

type Run =
  | { state: 'idle' }
  | { state: 'running'; done: number; total: number; current: string }
  | { state: 'finished'; checked: string[]; stopped?: EnrichFailure; skipped: number; failedBad: string[]; cancelled: boolean }

function Flow({ b }: { b: BusinessId }) {
  useStore()
  const lk = useLookups(b)
  const rows: Row[] = (() => {
    const byCo = new Map<string, Row>()
    for (const d of Q.deals()) {
      if (d.businessId !== b || d.status !== 'open' || !d.companyId) continue
      const co = Q.company(d.companyId)
      if (!co || co.archived) continue
      const cur = byCo.get(co.id)
      if (cur) cur.deals++
      else byCo.set(co.id, { companyId: co.id, name: co.name, deals: 1, checkedAt: Q.intel(co.id, 'signals', b)?.ts })
    }
    return [...byCo.values()].sort((x, y) => x.name.localeCompare(y.name))
  })()
  const stale = (r: Row): boolean => !r.checkedAt || ageDays(r.checkedAt) > STALE_DAYS
  const [pick, setPick] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map(r => [r.companyId, stale(r)])))
  const [run, setRun] = useState<Run>({ state: 'idle' })
  const live = useRef<AbortController | null>(null)
  useEffect(() => () => live.current?.abort(), [])

  const chosen = rows.filter(r => pick[r.companyId])
  const left = lk.left
  const over = left !== null && chosen.length > left
  const running = run.state === 'running'

  const start = async (): Promise<void> => {
    if (running || !chosen.length || over) return
    const ac = new AbortController()
    live.current = ac
    const queue = chosen
    const checked: string[] = []
    const failedBad: string[] = []
    let stopped: EnrichFailure | undefined
    for (let i = 0; i < queue.length; i++) {
      setRun({ state: 'running', done: i, total: queue.length, current: queue[i].name })
      const o = await checkCompany('signals', queue[i].companyId, b, { signal: ac.signal })
      if (isFailure(o)) {
        if (o.status === 'badOutput') { failedBad.push(queue[i].name); continue }
        stopped = o
        break
      }
      checked.push(queue[i].name)
    }
    live.current = null
    setRun({ state: 'finished', checked, stopped, failedBad, cancelled: stopped?.status === 'cancelled', skipped: queue.length - checked.length - failedBad.length })
  }
  const cancel = (): void => live.current?.abort()

  const body = lk.notConfigured ? (
    <FailureBanner o={{ status: 'notConfigured' }} onRetry={() => undefined} />
  ) : rows.length === 0 ? (
    <Empty icon="briefcase" title="No open deals" body={`There are no open ${Q.biz(b)?.name ?? ''} deals with a company to check.`} />
  ) : run.state === 'running' ? (
    <div className="col gap12" aria-busy="true">
      <div className="row" role="status" aria-live="polite"><Spinner />Checking {run.current} ({run.done + 1} of {run.total})…</div>
      <div className="faint xs">Each company can take 30 to 60 seconds. Cancelling stops waiting, but a request already sent still counts against the allowance.</div>
    </div>
  ) : run.state === 'finished' ? (
    <div className="col gap12" role="status" aria-live="polite">
      {run.stopped && run.stopped.status !== 'cancelled' && <FailureBanner o={run.stopped} onRetry={() => setRun({ state: 'idle' })} />}
      {run.cancelled && <Banner tone="info">Cancelled. A request already sent may still have been counted.</Banner>}
      <div className="sm">
        <b>{run.checked.length}</b> {run.checked.length === 1 ? 'company' : 'companies'} checked and saved.
        {run.failedBad.length > 0 && <> {run.failedBad.length} gave an answer that could not be used ({run.failedBad.join(', ')}).</>}
        {run.skipped > 0 && <> {run.skipped} not checked.</>}
      </div>
    </div>
  ) : (
    <div className="col gap12">
      <div className="muted sm">
        Searches the public web for hiring, expansion, funding and closure news about companies on your open {Q.biz(b)?.name ?? ''} deals. Each company uses one lookup. Nothing runs until you press Check.
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
        {rows.map(r => (
          <div key={r.companyId} className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
            <Ck checked={!!pick[r.companyId]} onChange={v => setPick(p => ({ ...p, [r.companyId]: v }))} label={'Check ' + r.name}>
              <b className="sm">{r.name}</b>
            </Ck>
            <span className="sp" />
            <span className="faint xs">{r.deals} open {r.deals === 1 ? 'deal' : 'deals'}</span>
            <Chip tone={r.checkedAt ? undefined : 'warn'}>{r.checkedAt ? 'Checked ' + daysAgo(r.checkedAt) : 'Never checked'}</Chip>
          </div>
        ))}
      </div>
      {lk.capped && lk.usage && <FailureBanner o={{ status: 'cap', usage: lk.usage }} onRetry={() => undefined} />}
      {over && <Banner tone="warn">You selected {chosen.length} but only {left} {left === 1 ? 'lookup is' : 'lookups are'} left this month. Untick some to continue.</Banner>}
    </div>
  )

  const cost = lk.notConfigured || run.state !== 'idle' || rows.length === 0 ? null : (
    <span className="sm muted">{left !== null && lk.usage ? `This will use ${chosen.length} of ${left} remaining lookups` : `This will use ${chosen.length} ${chosen.length === 1 ? 'lookup' : 'lookups'}`}</span>
  )

  return (
    <Modal
      title="Check signals on open deals"
      icon="spark"
      width={680}
      sub={<span className="row" style={{ gap: 6 }}><AiNotConfigured provider="xai" />{!lk.notConfigured && lk.label && <Chip>{lk.label}</Chip>}</span>}
      footer={
        running ? <Btn onClick={cancel}>Cancel</Btn> : (
          <>
            {cost}
            <span className="sp" />
            <Btn onClick={UI.close}>Close</Btn>
            {run.state !== 'finished' && !lk.notConfigured && rows.length > 0 && (
              <Btn kind="pri" icon="search" disabled={!chosen.length || over || lk.capped} onClick={() => void start()}>Check {chosen.length || ''} {chosen.length === 1 ? 'company' : 'companies'}</Btn>
            )}
          </>
        )
      }
    >
      {body}
    </Modal>
  )
}
