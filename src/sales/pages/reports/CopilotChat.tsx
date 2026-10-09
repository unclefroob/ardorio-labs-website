import { useEffect, useRef, useState } from 'react'
import { copilot, type AiTag } from '../../ai/client'
import type { CopilotContext, CopilotItem, CopilotResult } from '../../ai/local'
import { SalesHttpError } from '../../api/http'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { AiBadge, AiNotConfigured, Btn, Icon, Spinner } from '../../kit'
import { UI, type Route } from '../../ui/store'

export interface ChatCtx extends CopilotContext {
  companyId?: string
  label?: string
}

export type ChatMsg =
  | { me: true; t: string }
  | { me?: false; r: CopilotResult; ai: AiTag | null; failed?: boolean }

export function ctxOf(route: Route | undefined | null): ChatCtx | null {
  if (!route) return null
  if (route.page === 'contact') return { contactId: route.id, label: Q.contact(route.id)?.name }
  if (route.page === 'deal') return { dealId: route.id, label: Q.deal(route.id)?.title }
  if (route.page === 'company') return { companyId: route.id, label: Q.company(route.id)?.name }
  return null
}

const SUGGEST = [
  'Which of my Rosterio prospects should I call today?',
  "Which Ardorio deals haven't been contacted for two weeks?",
  "Which schools have shown interest in PathIQ but haven't booked a meeting?",
  'Which companies could be suitable for both Ardorio and Advanta?',
  'Summarise my current pipeline',
  'Draft a follow-up email for this contact',
]

const ICON: Record<string, string> = { deal: 'kanban', contact: 'user', company: 'building', task: 'checksq', thread: 'mail' }
const TONE: Record<string, string> = { bad: 'var(--bad2)', ok: 'var(--ok)', warn: 'var(--warn)' }
const MAX_Q = 1000

function isMsg(x: unknown): x is ChatMsg {
  if (typeof x !== 'object' || x === null) return false
  const m = x as { me?: unknown; t?: unknown; r?: unknown }
  if (m.me === true) return typeof m.t === 'string'
  const r = m.r as { text?: unknown; items?: unknown } | undefined
  return !!r && typeof r.text === 'string' && Array.isArray(r.items)
}

function loadChat(key: string): ChatMsg[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(raw) ? raw.filter(isMsg) : []
  } catch {
    return []
  }
}

function saveChat(key: string, m: ChatMsg[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(m.slice(-30)))
  } catch {
    /* storage blocked: the conversation just does not survive a reload */
  }
}

function failMsg(e: unknown): string {
  if (e instanceof SalesHttpError && e.status === 429) return 'Copilot is rate limited right now. Try again in a minute.'
  if (e instanceof SalesHttpError && e.status === 403) return "You don't have access to that."
  return 'I could not complete that request. Try rephrasing, or ask again in a moment.'
}

function openItem(it: CopilotItem, ask: (t: string) => void): void {
  if (it.kind === 'prompt') ask(it.line)
  else if (!it.id) return
  else if (it.kind === 'deal') UI.nav('deal', { id: it.id })
  else if (it.kind === 'contact') UI.nav('contact', { id: it.id })
  else if (it.kind === 'company') UI.nav('company', { id: it.id })
  else if (it.kind === 'task') UI.drawer('task', { id: it.id })
  else if (it.kind === 'thread') UI.nav('inbox', { id: it.id })
}

function followUp(id: string | null | undefined): void {
  const d = Q.deal(id)
  if (!d) return
  if (!UI.guard(d.businessId, 'Creating tasks')) return
  Act.createTask({
    title: `Follow up — ${d.title}`, type: 'Follow-up', businessId: d.businessId, assigneeId: d.ownerId,
    due: F.addDays(`${F.today()}T10:00`, 0), dealId: d.id, companyId: d.companyId, contactId: d.primaryContact, source: 'AI Copilot',
  })
  UI.toast(`Follow-up task created for ${Q.user(d.ownerId)?.name ?? 'the owner'}`)
}

export function ChatBody({ ctx }: { ctx?: ChatCtx | null }) {
  const key = `salesos.chat.${Q.me().id}`
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => loadChat(key))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    saveChat(key, msgs)
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [msgs, key])

  const ask = (text?: string): void => {
    const t = (text ?? q).trim()
    if (!t || busy) return
    setQ('')
    setMsgs(m => m.concat({ me: true, t }))
    setBusy(true)
    const context = ctx ? { contactId: ctx.contactId, dealId: ctx.dealId, companyId: ctx.companyId } : undefined
    copilot(t, context)
      .then(res => alive.current && setMsgs(m => m.concat({ r: res.value, ai: res.ai })))
      .catch((e: unknown) => alive.current && setMsgs(m => m.concat({ r: { text: failMsg(e), items: [], scope: [] }, ai: null, failed: true })))
      .finally(() => alive.current && setBusy(false))
  }

  return (
    <div className="col" style={{ gap: 12, height: '100%' }}>
      <div className="chat" style={{ flex: 1, overflow: 'auto', paddingBottom: 8 }} aria-live="polite">
        {!msgs.length && (
          <div className="col" style={{ gap: 8 }}>
            <div className="muted sm">
              Ask about your pipeline, prospects, replies or tasks. Answers use live CRM data you can access{ctx?.label ? ` — context: ${ctx.label}` : ''}.
            </div>
            <div><AiNotConfigured /></div>
            {SUGGEST.map(s => (
              <button key={s} type="button" className="btn sm" style={{ justifyContent: 'flex-start', height: 'auto', padding: '7px 10px', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => ask(s)}>
                <Icon n="spark" s={12} />
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.me) return <div key={i} className="bub me">{m.t}</div>
          const dr = m.r.draft
          return (
            <div key={i} className="bub ai2">
              <div className="row xs faint" style={{ marginBottom: 6 }}>
                <Icon n="spark" s={12} />
                Copilot
                <AiBadge tag={m.ai} />
              </div>
              <div className="sm">{m.r.text}</div>
              {m.r.items.length > 0 && (
                <div className="col" style={{ gap: 4, marginTop: 8 }}>
                  {m.r.items.map((it, j) => {
                    const clickable = it.kind !== 'text'
                    const body = (
                      <>
                        {it.kind !== 'prompt' && ICON[it.kind] && <Icon n={ICON[it.kind]} s={13} style={{ color: 'var(--fg3)' }} />}
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div className="sm b trunc">{it.line}</div>
                          {it.meta && <div className="xs" style={{ color: (it.tone && TONE[it.tone]) || 'var(--fg3)' }}>{it.meta}</div>}
                        </div>
                      </>
                    )
                    const box = { gap: 6, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--surf2)' }
                    return (
                      <div key={j} className="row" style={box}>
                        {clickable ? (
                          <button type="button" className="row" style={{ flex: 1, minWidth: 0, gap: 6, background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }} onClick={() => openItem(it, ask)}>{body}</button>
                        ) : (
                          body
                        )}
                        {it.act === 'task' && Q.canEdit(Q.deal(it.id)?.businessId ?? '') && <Btn size="xs" onClick={() => followUp(it.id)}>Create task</Btn>}
                      </div>
                    )
                  })}
                </div>
              )}
              {dr && (
                <div className="card card-b" style={{ marginTop: 8 }}>
                  <div className="b sm">{dr.subject}</div>
                  <div className="sm muted" style={{ whiteSpace: 'pre-wrap', marginTop: 6, maxHeight: 200, overflow: 'auto' }}>{dr.body}</div>
                  <Btn size="sm" kind="pri" icon="mail" style={{ marginTop: 8 }} onClick={() => UI.open('compose', { contactId: dr.contactId, businessId: dr.businessId, dealId: dr.dealId, subject: dr.subject, body: dr.body, ai: m.ai })}>
                    Open in composer
                  </Btn>
                </div>
              )}
            </div>
          )
        })}
        {busy && (
          <div className="bub ai2" role="status">
            <Spinner /> <span className="sm muted">Looking through CRM records…</span>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="row">
        <input className="inp" value={q} maxLength={MAX_Q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Ask Copilot…" aria-label="Ask Copilot" />
        <Btn kind="pri" icon="send" disabled={busy || !q.trim()} onClick={() => ask()} aria-label="Send" />
        {msgs.length > 0 && <Btn kind="ghost" icon="trash" onClick={() => setMsgs([])} title="Clear conversation" aria-label="Clear conversation" />}
      </div>
    </div>
  )
}
