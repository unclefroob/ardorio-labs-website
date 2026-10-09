import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Banner, Btn } from '../kit'
import { F } from '../data/F'
import { formatOffset, getOffsetMinutes, useNow } from '../data/clock'
import { usePrompts, userName, removePrompt, type ConflictPrompt } from '../data/conflicts'
import { fieldLabel, formatFieldValue } from '../data/fieldLabels'
import { deleteAnyway, keepMineFields, keepTheirs, keepTheirsFields, restoreDeleted } from '../data/resolve'
import { flushAll, useSyncStatus } from '../data/sync'
import { useLeaseStatus } from '../engine/lease'
import { Icon } from '../kit'

function plural(n: number, w: string): string {
  return `${n} ${w}${n === 1 ? '' : 's'}`
}

/** Save and refresh problems. Hidden while everything is working. */
export function SyncBanner() {
  const s = useSyncStatus()
  const lease = useLeaseStatus()
  const out: ReactNode[] = []
  if (s.state === 'expired') {
    return (
      <div className="col" style={{ gap: 8, padding: '8px 18px 0' }}>
        <Banner tone="bad" action={<Btn size="sm" kind="pri" onClick={() => window.location.assign('/admin/login')}>Sign in</Btn>}>
          Your session expired. Unsaved changes were discarded. Sign in again.
        </Banner>
      </div>
    )
  }
  if (s.state === 'offline') {
    out.push(
      <Banner key="off" tone="warn" icon="alert">
        You're offline. {s.queued ? `${plural(s.queued, 'change')} will be saved when you reconnect.` : 'Changes will be saved when you reconnect.'}
      </Banner>,
    )
  } else if (s.failures >= 2 || s.state === 'error') {
    out.push(
      <Banner key="err" tone="bad" action={<Btn size="sm" onClick={() => void flushAll()}>Retry now</Btn>}>
        Changes aren't being saved{s.message ? `: ${s.message}` : ''}. {s.queued ? `${plural(s.queued, 'change')} waiting.` : ''} We'll keep retrying; don't close this tab.
      </Banner>,
    )
  } else if (s.pollFailures >= 2) {
    out.push(
      <Banner key="poll" tone="warn">
        Can't refresh from the server. What you see may be out of date.
      </Banner>,
    )
  }
  if (!lease.ok) {
    out.push(
      <Banner key="lease" tone="warn" icon="pause">
        Automations paused. This tab can't confirm it should run sequences; they resume when the connection does.
      </Banner>,
    )
  }
  if (!out.length) return null
  return <div className="col" style={{ gap: 8, padding: '8px 18px 0' }}>{out}</div>
}

/** The clock chip. With a non-zero offset it says so plainly. */
export function ClockBanner() {
  useNow()
  const off = getOffsetMinutes()
  return (
    <span className="clock hide-m" title={off ? 'The clock is shifted' : 'Current time'} style={{ cursor: 'default' }}>
      <Icon n="clock" s={13} />
      {F.dt(F.nowIso())}
      {off !== 0 && <span className="b" style={{ color: 'var(--warn)' }}>· Demo clock {formatOffset(off)}</span>}
    </span>
  )
}

type FieldPrompt = Extract<ConflictPrompt, { kind: 'field' }>

function FieldCard({ p, done }: { p: FieldPrompt; done: (msg: string) => void }) {
  const who = [...new Set(p.fields.map(f => userName(f.changedBy)))]
  const names = who.length > 2 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who.join(' and ')
  const titleId = `cf-t-${p.id}`
  const many = p.fields.length > 1
  const mine = (paths: string[], what: string) => {
    keepMineFields(p, paths)
    done(`Kept your ${what}.`)
  }
  const theirs = (paths: string[], what: string) => {
    keepTheirsFields(p, paths)
    done(`Kept ${what} from ${names}.`)
  }
  return (
    <section className="banner warn cf" role="alert" aria-labelledby={titleId}>
      <Icon n="alert" s={15} style={{ marginTop: 1, color: 'var(--warn)' }} />
      <div className="cf-body">
        <div id={titleId} className="cf-head">
          <span className="b">{names}</span> also changed this {p.label}. Choose which value to keep for {many ? 'each field' : 'this field'}.
        </div>
        <ul className="cf-list">
          {p.fields.map(f => {
            const label = fieldLabel(p.collection, p.recId, f.path)
            const m = formatFieldValue(p.collection, p.recId, f.path, f.mine)
            const t = f.theirsDeleted ? 'removed' : formatFieldValue(p.collection, p.recId, f.path, f.theirs)
            return (
              <li key={f.path} className="cf-field">
                <div className="cf-name b">{label}</div>
                <div className="cf-vals">
                  <div className="cf-val"><span className="muted">Yours:</span> <span className="cf-text">{m}</span></div>
                  <div className="cf-val"><span className="muted">Theirs:</span> <span className="cf-text">{t}</span></div>
                </div>
                <div className="cf-acts">
                  <Btn size="sm" onClick={() => mine([f.path], `value for ${label}`)}>
                    Keep mine<span className="sr-only"> for {label}</span>
                  </Btn>
                  <Btn size="sm" onClick={() => theirs([f.path], `value for ${label}`)}>
                    Keep theirs<span className="sr-only"> for {label}</span>
                  </Btn>
                </div>
              </li>
            )
          })}
        </ul>
        {many && (
          <div className="cf-all">
            <Btn size="sm" kind="pri" onClick={() => mine(p.fields.map(f => f.path), 'values')}>Keep all mine</Btn>
            <Btn size="sm" onClick={() => theirs(p.fields.map(f => f.path), 'values')}>Keep all theirs</Btn>
          </div>
        )}
      </div>
    </section>
  )
}

function DeletedCard({ p, done }: { p: Extract<ConflictPrompt, { kind: 'deleted' }>; done: (msg: string) => void }) {
  return (
    <section className="banner warn cf" role="alert">
      <Icon n="alert" s={15} style={{ marginTop: 1, color: 'var(--warn)' }} />
      <div className="cf-body">
        <span className="b">{p.by}</span> deleted this {p.label} while you were editing it. Restore it with your changes, or leave it deleted.
      </div>
      <div className="cf-acts">
        <Btn size="sm" kind="pri" onClick={() => { restoreDeleted(p); done(`Restored the ${p.label}.`) }}>Restore</Btn>
        <Btn size="sm" onClick={() => { removePrompt(p.id); done(`Left the ${p.label} deleted.`) }}>Leave deleted</Btn>
      </div>
    </section>
  )
}

/** Questions the server left for the user after a save did not simply apply. */
export function ConflictBar() {
  const prompts = usePrompts()
  const box = useRef<HTMLDivElement>(null)
  const [said, setSaid] = useState('')
  const acted = useRef(false)
  const done = (msg: string) => {
    acted.current = true
    setSaid(msg)
  }
  useEffect(() => {
    if (!acted.current) return
    acted.current = false
    box.current?.querySelector<HTMLElement>('button')?.focus()
  }, [prompts])
  return (
    <div className="col cf-bar" style={{ gap: 8, padding: prompts.length ? '8px 18px 0' : 0 }} ref={box}>
      <div className="sr-only" role="status" aria-live="polite">{said}</div>
      {prompts.map(p => {
        if (p.kind === 'field') return <FieldCard key={p.id} p={p} done={done} />
        if (p.kind === 'deleted') return <DeletedCard key={p.id} p={p} done={done} />
        return (
          <Banner
            key={p.id}
            tone="warn"
            action={
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Btn size="sm" kind="danger" onClick={() => { deleteAnyway(p); done(`Deleted the ${p.label}.`) }}>Delete anyway</Btn>
                <Btn size="sm" onClick={() => { keepTheirs(p); done(`Kept the ${p.label}.`) }}>Keep it</Btn>
              </div>
            }
          >
            <span className="b">{p.by}</span> changed this {p.label} after you deleted it. Delete anyway?
          </Banner>
        )
      })}
    </div>
  )
}
