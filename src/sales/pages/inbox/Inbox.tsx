import { useEffect, useMemo, useRef, useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { simThread } from '../../data/simulated'
import { useMailState } from '../../mail/client'
import { S, useStore } from '../../data/store'
import type { Message, Thread } from '../../data/types'
import { BizDot, Btn, Chip, CLS_TONE, Empty, Icon, SearchInp, Sel, SimChip } from '../../kit'
import { UI, type Route } from '../../ui/store'
import { MailHealth, mayRun, NotInCrm, SyncLine, useUnmatched } from './parts/MailHealth'
import { RowBtn } from './parts/RowBtn'
import { ThreadView } from './parts/ThreadView'

const FOLD = [
  ['all', 'Inbox', 'inbox'],
  ['unread', 'Unread', 'mail'],
  ['needs', 'Needs reply', 'reply'],
  ['positive', 'Positive responses', 'star'],
  ['sent', 'Sent', 'send'],
  ['shared', 'Shared inbox', 'users'],
  ['mine', 'Assigned to me', 'user'],
  ['private', 'My private email', 'lock'],
  ['drafts', 'Drafts', 'edit'],
  ['archived', 'Archived', 'archive'],
] as const
type Fold = (typeof FOLD)[number][0]
const isFold = (v: unknown): v is Fold => FOLD.some(f => f[0] === v)
const POSITIVE = ['Interested', 'Meeting Requested', 'More Information Requested']

const navBtn = { width: '100%' } as const

/** Re-render once a minute so “5m ago” moves on its own, rather than whenever some unrelated change lands. */
function useMinute(): void {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 60000)
    return () => clearInterval(id)
  }, [])
}

export function Inbox({ route }: { route: Route }) {
  const version = useStore()
  useMinute()
  const me = Q.me()
  const mail = useMailState().s
  const live = mail === 'live'
  const [fold, setFold] = useState<Fold>(isFold(route.q?.folder) ? route.q.folder : 'all')
  const [mb, setMb] = useState('')
  const [q, setQ] = useState('')
  // The open conversation lives in the address (/sales/inbox/<id>), so links from a company, deal or toast open it, and Back works.
  const sel = route.id ?? null
  const target = typeof route.q?.msg === 'string' ? route.q.msg : undefined
  // Conversations opened in this folder stay listed until you change folder, even once they no longer match it (opening an unread one
  // reads it; “Doesn't need a reply” clears it), so nothing vanishes from under the pointer.
  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set(sel ? [sel] : []))
  const select = (id: string | null, msg?: string): void => {
    UI.replace('inbox', { ...(id ? { id } : {}), q: { ...(fold !== 'all' ? { folder: fold } : {}), ...(msg ? { msg } : {}) } })
  }
  const [others, setOthers] = useState(false)
  const changeFold = (f: Fold): void => {
    setFold(f)
    setOthers(false)
    setKeep(new Set(sel ? [sel] : []))
    UI.replace('inbox', { ...(sel ? { id: sel } : {}), q: f !== 'all' ? { folder: f } : {} })
  }

  const all = Q.threads().filter(Q.threadBody)
  // One pass over the messages per change, not one per conversation per render.
  const byThread = useMemo(() => {
    const m = new Map<string, Message[]>()
    for (const x of S.messages) {
      const l = m.get(x.threadId)
      if (l) l.push(x)
      else m.set(x.threadId, [x])
    }
    return m
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps -- the store mutates in place; its version is the change signal
  const msgsOf = (t: Thread): Message[] => byThread.get(t.id) ?? []
  const match = (t: Thread): boolean => {
    if (t.id === sel || keep.has(t.id)) return true
    if (fold !== 'archived' && t.archived) return false
    const ms = msgsOf(t)
    switch (fold) {
      case 'unread': return t.unread
      case 'needs': return t.needsReply
      case 'positive': return POSITIVE.includes(t.classification?.cat ?? '')
      case 'sent': return ms.some(m => m.dir === 'out' && m.status === 'sent')
      case 'shared': return t.visibility === 'shared'
      case 'mine': return t.assigneeId === me.id
      case 'private': return t.visibility === 'private'
      case 'drafts': return ms.some(m => m.status === 'draft')
      case 'archived': return t.archived
      // As in Gmail: a conversation is in the Inbox once they have written. Mail you sent that nobody has answered yet is under Sent.
      default: return ms.some(m => m.dir === 'in' && m.status !== 'discarded')
    }
  }
  const needle = q.trim().toLowerCase()
  const rows = all
    .filter(match)
    .filter(t => (!mb || t.mailboxId === mb) && (!needle || `${t.subject} ${Q.contact(t.contactId)?.name ?? ''} ${Q.company(t.companyId)?.name ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => F.ms(b.updatedAt) - F.ms(a.updatedAt))

  const counts: Partial<Record<Fold, number>> = {
    unread: all.filter(x => x.unread && !x.archived).length,
    needs: all.filter(x => x.needsReply && !x.archived).length,
  }
  const t = sel ? Q.thread(sel) : undefined
  const restricted = !!t && !Q.threadBody(t)
  const mbs = S.mailboxes.filter(m => m.businessIds.some(Q.inScope) && (m.type === 'shared' ? Q.member(m.businessIds[0]) : m.ownerId === me.id))
  const foldLabel = others ? 'Not in SalesOS yet' : FOLD.find(f => f[0] === fold)?.[1] ?? ''
  const unmatched = useUnmatched(live ? mbs : [])
  const runsAny = live && mbs.some(m => m.status === 'connected' && mayRun(m))
  const filtered = !!(needle || mb)
  const canCompose = Q.anyEdit()
  const clear = (): void => { setQ(''); setMb('') }

  // On a narrow screen the open conversation replaces the list, so start it at the top of the screen. (A conversation you can read
  // scrolls itself to the message you came for; this covers the private-conversation notice.)
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (sel && restricted && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches) top.current?.scrollIntoView?.({ block: 'start' })
  }, [sel, restricted])

  // Reading an unread conversation marks it read whichever way it was opened (a click here or a link from elsewhere).
  useEffect(() => {
    const x = sel ? Q.thread(sel) : undefined
    if (x && x.unread && Q.threadBody(x) && Q.canEdit(x.businessId)) Act.markThread(x.id, { unread: false })
  }, [sel])

  const open = (x: Thread): void => {
    setKeep(k => (k.has(x.id) ? k : new Set([...k, x.id])))
    select(x.id)
  }

  /** After archiving the open conversation: drop it from the list and open the next one down. */
  const archived = (id: string): void => {
    const i = rows.findIndex(r => r.id === id)
    const next = rows[i + 1] ?? rows[i - 1]
    setKeep(k => { const n = new Set(k); n.delete(id); return n })
    select(next && next.id !== id ? next.id : null)
  }

  const empty = (() => {
    if (all.length === 0) {
      return (
        <Empty
          icon="inbox" title="No conversations yet"
          body="Emails linked to your contacts and companies appear here once a mailbox is connected and you send or receive a message."
          action={<Btn kind="pri" icon="edit" disabled={!canCompose} onClick={() => UI.open('compose')}>Compose</Btn>}
        />
      )
    }
    if (filtered) {
      return <Empty icon="search" title="No conversations match" body="Try a different search or mailbox." action={<Btn onClick={clear}>Clear filters</Btn>} />
    }
    return <Empty icon="inbox" title="Nothing in this folder" body={`No conversations under “${foldLabel}” for your accessible mailboxes.`} action={fold !== 'all' ? <Btn onClick={() => changeFold('all')}>Show all conversations</Btn> : undefined} />
  })()

  return (
    <div className={'inbox' + (t ? ' has-sel' : '')} ref={top}>
      <h1 className="sr-only">Inbox</h1>
      <div className="ib-l">
        <Btn kind="pri" icon="edit" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} disabled={!canCompose} onClick={() => UI.open('compose')}>Compose</Btn>
        {FOLD.map(([k, l, ic]) => {
          const n = counts[k]
          return (
            <button key={k} type="button" className={'ni' + (fold === k ? ' on' : '')} style={navBtn} aria-current={fold === k ? 'true' : undefined} onClick={() => changeFold(k)}>
              <Icon n={ic} s={14} />{l}{n ? <span className="cnt">{n}</span> : null}
            </button>
          )
        })}
        <div className="ng">Mailboxes</div>
        <button type="button" className={'ni' + (!mb ? ' on' : '')} style={navBtn} aria-current={!mb ? 'true' : undefined} onClick={() => setMb('')}><Icon n="layers" s={14} />All mailboxes</button>
        {mbs.map(m => (
          <button key={m.id} type="button" className={'ni' + (mb === m.id ? ' on' : '')} style={navBtn} aria-current={mb === m.id ? 'true' : undefined} onClick={() => setMb(m.id)} title={m.address}>
            <span className="dot" style={{ background: m.status === 'connected' ? 'var(--ok)' : 'var(--bad2)' }} />
            <span className="trunc">{m.address}</span>
          </button>
        ))}
        {mbs.length === 0 && <div className="faint xs" style={{ padding: '6px 10px' }}>No mailboxes connected. Connect one in Integrations.</div>}
        {runsAny && (
          <button type="button" className={'ni' + (others ? ' on' : '')} style={navBtn} aria-current={others ? 'true' : undefined} onClick={() => { setOthers(true); unmatched.reload() }}>
            <Icon n="users" s={14} />Not in SalesOS yet{unmatched.rows.length ? <span className="cnt">{unmatched.rows.length}</span> : null}
          </button>
        )}
        <div className="faint xs" style={{ padding: '12px 10px' }}>{live ? 'CRM-relevant conversations only: mail to and from people in your CRM, read from Gmail. Sending is switched on per mailbox in Integrations.' : 'CRM-relevant conversations only. No real email is sent or received yet: mail here is simulated and marked Simulated.'}</div>
      </div>
      <div className="ib-m">
        <div style={{ padding: 10, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--surf)', zIndex: 2 }}>
          <div className="hamb" style={{ marginBottom: 8 }}>
            <Sel style={{ width: '100%' }} aria-label="Folder" value={fold} onChange={v => { if (isFold(v)) changeFold(v) }} options={FOLD.map(f => [f[0], f[1]] as [string, string])} />
          </div>
          {live && <MailHealth mbs={mbs} />}
          <div className="row" style={{ marginBottom: 8 }}>
            <b>{foldLabel}</b>
            <span className="faint xs">{others ? unmatched.rows.length : rows.length}</span>
            <span className="sp" />
            {filtered && <Btn size="xs" kind="ghost" onClick={clear}>Clear</Btn>}
            {Q.anyAdmin() && mail === 'off' && <Btn size="xs" icon="reply" onClick={() => UI.open('simReply', {})}>Simulate reply</Btn>}
          </div>
          {!others && <SearchInp value={q} onChange={setQ} w={400} placeholder="Search conversations" />}
          {live && <SyncLine mbs={mbs} />}
        </div>
        {others ? <NotInCrm u={unmatched} /> : rows.length ? rows.map(x => {
          const ms = msgsOf(x)
          const last = ms.filter(m => m.status !== 'discarded').sort((a, b) => F.ms(a.ts) - F.ms(b.ts)).pop()
          const sim = simThread(x, ms)
          const c = Q.contact(x.contactId)
          const prefix = last ? (last.status === 'draft' ? 'Draft — ' : last.dir === 'out' ? 'You: ' : '') : ''
          return (
            <RowBtn key={x.id} on={sel === x.id} unread={x.unread} onClick={() => open(x)}>
              <span className="row" style={{ gap: 6, width: '100%' }}>
                {x.unread && <span className="dot" style={{ background: 'var(--acc)' }} />}
                <span className="sm b trunc" style={{ flex: 1 }}>{c?.name ?? last?.from}</span>
                <span className="faint xs">{F.rel(x.updatedAt)}</span>
              </span>
              <span className="sm subj trunc" style={{ width: '100%' }}>{x.subject}</span>
              <span className="faint xs th-snip">{last ? prefix + F.plain(last.body).slice(0, 240) : ''}</span>
              <span className="row" style={{ gap: 4, marginTop: 2 }}>
                <BizDot b={x.businessId} s={6} />
                {x.visibility === 'private' && <Icon n="lock" s={10} style={{ color: 'var(--fg3)' }} />}
                {x.classification && <Chip tone={CLS_TONE(x.classification.cat)}>{x.classification.cat}</Chip>}
                {x.seqId && <Chip>Sequence</Chip>}
                {x.needsReply && <Chip tone="warn">Needs reply</Chip>}
                {x.relation === 'customer' && <Chip tone="ok">Customer</Chip>}
                {sim && <SimChip>{sim === 'all' ? 'Simulated' : 'Includes simulated'}</SimChip>}
              </span>
            </RowBtn>
          )
        }) : empty}
      </div>
      <div className="ib-r">
        {t ? (
          restricted ? (
            <div style={{ padding: 30 }}>
              <Btn kind="ghost" size="sm" icon="left" className="hamb" style={{ marginBottom: 10 }} onClick={() => select(null)}>Back to conversations</Btn>
              <Empty icon="lock" title="Private conversation" body={`This email belongs to ${Q.user(t.ownerId)?.name ?? 'another user'}’s personal mailbox and has not been shared with you. Only limited metadata is visible.`} />
            </div>
          ) : <ThreadView key={t.id} t={t} target={target} onClose={() => select(null)} onArchived={archived} />
        ) : (
          <div style={{ padding: 30 }}>
            <Empty icon="mail" title="Select a conversation" body="Open a thread to read it, reply, and review AI classification." />
          </div>
        )}
      </div>
    </div>
  )
}
