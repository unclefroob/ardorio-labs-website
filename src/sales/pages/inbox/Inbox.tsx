import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Thread } from '../../data/types'
import { BizDot, Btn, Chip, CLS_TONE, Empty, Icon, SearchInp, Sel } from '../../kit'
import { UI, type Route } from '../../ui/store'
import { RowBtn } from './parts/RowBtn'
import { ThreadView } from './parts/ThreadView'

const FOLD = [
  ['all', 'All CRM conversations', 'inbox'],
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

export function Inbox({ route }: { route: Route }) {
  useStore()
  const me = Q.me()
  const [fold, setFold] = useState<Fold>(isFold(route.q?.folder) ? route.q.folder : 'all')
  const [mb, setMb] = useState('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(route.id ?? null)

  const all = Q.threads().filter(Q.threadBody)
  const msgsOf = (t: Thread) => S.messages.filter(m => m.threadId === t.id)
  const match = (t: Thread): boolean => {
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
      default: return ms.some(m => m.status !== 'discarded')
    }
  }
  const needle = q.trim().toLowerCase()
  const rows = all
    .filter(match)
    .filter(t => (!mb || t.mailboxId === mb) && (!needle || `${t.subject} ${Q.contact(t.contactId)?.name ?? ''} ${Q.company(t.companyId)?.name ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const counts: Partial<Record<Fold, number>> = {
    unread: all.filter(x => x.unread && !x.archived).length,
    needs: all.filter(x => x.needsReply && !x.archived).length,
  }
  const t = sel ? Q.thread(sel) : undefined
  const restricted = !!t && !Q.threadBody(t)
  const mbs = S.mailboxes.filter(m => m.businessIds.some(Q.inScope) && (m.type === 'shared' ? Q.member(m.businessIds[0]) : m.ownerId === me.id))
  const foldLabel = FOLD.find(f => f[0] === fold)?.[1] ?? ''
  const filtered = !!(needle || mb)
  const canCompose = Q.anyEdit()
  const clear = (): void => { setQ(''); setMb('') }

  const open = (x: Thread): void => {
    setSel(x.id)
    if (x.unread && Q.canEdit(x.businessId)) Act.markThread(x.id, { unread: false })
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
    return <Empty icon="inbox" title="Nothing in this folder" body={`No conversations under “${foldLabel}” for your accessible mailboxes.`} action={fold !== 'all' ? <Btn onClick={() => setFold('all')}>Show all conversations</Btn> : undefined} />
  })()

  return (
    <div className="inbox">
      <h1 className="sr-only">Inbox</h1>
      <div className="ib-l">
        <Btn kind="pri" icon="edit" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} disabled={!canCompose} onClick={() => UI.open('compose')}>Compose</Btn>
        {FOLD.map(([k, l, ic]) => {
          const n = counts[k]
          return (
            <button key={k} type="button" className={'ni' + (fold === k ? ' on' : '')} style={navBtn} aria-current={fold === k ? 'true' : undefined} onClick={() => setFold(k)}>
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
        <div className="faint xs" style={{ padding: '12px 10px' }}>CRM-relevant conversations only. Gmail sync is simulated.</div>
      </div>
      <div className="ib-m">
        <div style={{ padding: 10, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--surf)', zIndex: 2 }}>
          <div className="hamb" style={{ marginBottom: 8 }}>
            <Sel style={{ width: '100%' }} aria-label="Folder" value={fold} onChange={v => { if (isFold(v)) setFold(v) }} options={FOLD.map(f => [f[0], f[1]] as [string, string])} />
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <b>{foldLabel}</b>
            <span className="faint xs">{rows.length}</span>
            <span className="sp" />
            {filtered && <Btn size="xs" kind="ghost" onClick={clear}>Clear</Btn>}
            {Q.anyAdmin() && <Btn size="xs" icon="reply" onClick={() => UI.open('simReply', {})}>Simulate reply</Btn>}
          </div>
          <SearchInp value={q} onChange={setQ} w={400} placeholder="Search conversations" />
        </div>
        {rows.length ? rows.map(x => {
          const last = msgsOf(x).filter(m => m.status !== 'discarded').sort((a, b) => a.ts.localeCompare(b.ts)).pop()
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
              <span className="faint xs trunc" style={{ width: '100%' }}>{last ? prefix + F.plain(last.body).slice(0, 90) : ''}</span>
              <span className="row" style={{ gap: 4, marginTop: 2 }}>
                <BizDot b={x.businessId} s={6} />
                {x.visibility === 'private' && <Icon n="lock" s={10} style={{ color: 'var(--fg3)' }} />}
                {x.classification && <Chip tone={CLS_TONE(x.classification.cat)}>{x.classification.cat}</Chip>}
                {x.seqId && <Chip>Sequence</Chip>}
                {x.needsReply && <Chip tone="warn">Needs reply</Chip>}
              </span>
            </RowBtn>
          )
        }) : empty}
      </div>
      <div className="ib-r">
        {t ? (
          restricted ? (
            <div style={{ padding: 30 }}>
              <Empty icon="lock" title="Private conversation" body={`This email belongs to ${Q.user(t.ownerId)?.name ?? 'another user'}’s personal mailbox and has not been shared with you. Only limited metadata is visible.`} />
            </div>
          ) : <ThreadView key={t.id} t={t} onClose={() => setSel(null)} />
        ) : (
          <div style={{ padding: 30 }}>
            <Empty icon="mail" title="Select a conversation" body="Open a thread to read it, reply, and review AI classification." />
          </div>
        )}
      </div>
    </div>
  )
}
