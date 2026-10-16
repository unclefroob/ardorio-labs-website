import { useCallback, useEffect, useState } from 'react'
import { backfillApi, connectMailboxApi, dismissUnmatchedApi, syncMailboxApi, unmatchedApi, type UnmatchedSender } from '../../../api/mailboxes'
import { SalesHttpError } from '../../../api/http'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { flushAll, pollOnce } from '../../../data/sync'
import type { Mailbox } from '../../../data/types'
import { Banner, Btn, Empty, Skel } from '../../../kit'
import { leaveTo } from '../../../mail/navigate'
import { UI } from '../../../ui/store'

/** Who may connect, sync and see the not-yet-contacts of a mailbox (the server's rule): a personal one's owner, a shared one's admins. */
export const mayRun = (m: Mailbox): boolean => (m.type === 'personal' ? m.ownerId === Q.me().id : m.businessIds.some(b => Q.canAdmin(b)))

const fail = (e: unknown, fallback: string): void => UI.toast(e instanceof SalesHttpError ? e.message : fallback, 'bad')

/**
 * Mailboxes that are not bringing mail in: disconnected (Google stopped accepting the connection) or failing to read. Said in the Inbox,
 * where the missing mail would otherwise just quietly not appear, with the fix one click away for whoever can do it.
 */
export function MailHealth({ mbs }: { mbs: Mailbox[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const bad = mbs.filter(m => m.status !== 'connected' || m.syncError)
  if (!bad.length) return null
  const reconnect = async (m: Mailbox): Promise<void> => {
    setBusy(m.id)
    try { leaveTo((await connectMailboxApi(m.id)).url) } catch (e) { setBusy(null); fail(e, 'Could not reach the server. Try again.') }
  }
  return (
    <div className="col" style={{ gap: 6, marginBottom: 8 }}>
      {bad.slice(0, 2).map(m => (
        <Banner key={m.id} tone="warn">
          <span className="col" style={{ gap: 4 }}>
            <span className="sm">
              <b>{m.address}</b> {m.status !== 'connected' ? 'is disconnected, so new mail is not arriving.' : m.syncError}
            </span>
            {mayRun(m) && m.status !== 'connected' && (
              <span><Btn size="xs" kind="pri" loading={busy === m.id} onClick={() => void reconnect(m)}>{busy === m.id ? 'Opening Google…' : 'Reconnect Gmail'}</Btn></span>
            )}
          </span>
        </Banner>
      ))}
      {bad.length > 2 && <span className="faint xs">{bad.length - 2} more mailbox{bad.length - 2 === 1 ? '' : 'es'} need attention in Integrations.</span>}
    </div>
  )
}

/** "Synced 2m ago · Refresh": when mail was last read, and a way to read it now rather than wait for the next run. */
export function SyncLine({ mbs }: { mbs: Mailbox[] }) {
  const [busy, setBusy] = useState(false)
  const mine = mbs.filter(m => m.status === 'connected' && mayRun(m))
  const last = mbs.map(m => m.lastSync).filter((x): x is string => !!x).sort((a, b) => F.ms(b) - F.ms(a))[0]
  if (!mbs.some(m => m.status === 'connected')) return null
  const refresh = async (): Promise<void> => {
    setBusy(true)
    try {
      const rs = await Promise.allSettled(mine.map(m => syncMailboxApi(m.id)))
      await pollOnce()
      const n = rs.reduce((t, r) => t + (r.status === 'fulfilled' ? r.value.stored : 0), 0)
      if (rs.every(r => r.status === 'rejected')) fail((rs[0] as PromiseRejectedResult).reason, 'Could not reach the server. Try again.')
      else UI.toast(n ? `${n} new message${n === 1 ? '' : 's'}` : 'Up to date')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="row xs faint" style={{ marginTop: 6, gap: 6, minHeight: 22 }}>
      <span>{last ? 'Synced ' + F.rel(last) : 'Not synced yet'}</span>
      {mine.length > 0 && <Btn size="xs" kind="ghost" icon="refresh" loading={busy} onClick={() => void refresh()}>{busy ? 'Checking…' : 'Check now'}</Btn>}
    </div>
  )
}

interface Row extends UnmatchedSender { mailboxId: string }

/** Load the not-yet-contacts of the mailboxes this person runs, newest first. */
export function useUnmatched(mbs: Mailbox[]): { rows: Row[]; loading: boolean; reload: () => void; drop: (r: Row) => void } {
  const ids = mbs.filter(m => m.status === 'connected' && mayRun(m)).map(m => m.id).join(',')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!ids) return
    let live = true
    setLoading(true) // eslint-disable-line react-hooks/set-state-in-effect -- marks the fetch this effect starts
    void Promise.allSettled(ids.split(',').map(id => unmatchedApi(id).then(r => r.senders.map(s => ({ ...s, mailboxId: id })))))
      .then(rs => {
        if (!live) return
        setRows(rs.flatMap(r => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)))
        setLoading(false)
      })
    return () => { live = false }
  }, [ids, n])
  const reload = useCallback(() => setN(x => x + 1), [])
  const drop = useCallback((r: Row) => setRows(xs => xs.filter(x => !(x.address === r.address && x.mailboxId === r.mailboxId))), [])
  return { rows: ids ? rows : [], loading, reload, drop }
}

/**
 * People who wrote in but are not in SalesOS, so their mail was not filed (the Inbox holds CRM mail only). Add one as a contact and their
 * last 90 days of mail is filed straight away; or dismiss them.
 */
export function NotInCrm({ u }: { u: ReturnType<typeof useUnmatched> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const key = (r: Row): string => r.mailboxId + '|' + r.address
  const dismiss = async (r: Row): Promise<void> => {
    setBusy(key(r))
    try { await dismissUnmatchedApi(r.mailboxId, r.address); u.drop(r) } catch (e) { fail(e, 'Could not reach the server. Try again.') } finally { setBusy(null) }
  }
  const add = (r: Row): void => {
    const mb = Q.mailbox(r.mailboxId)
    UI.open('newContact', {
      email: r.address, name: r.name, businessId: mb?.businessIds.find(b => Q.canEdit(b)),
      onCreated: () => {
        setBusy(key(r))
        void (async () => {
          try {
            // The contact must be on the server before its mail can be matched to it.
            await flushAll()
            const out = await backfillApi(r.mailboxId, r.address)
            await pollOnce()
            u.drop(r)
            UI.toast(out.stored ? `Contact added. ${out.stored} message${out.stored === 1 ? '' : 's'} filed in the Inbox.` : 'Contact added. New mail from them will appear in the Inbox.')
          } catch (e) {
            fail(e, 'Contact added, but their earlier mail could not be filed yet. It will be when they next write.')
          } finally {
            setBusy(null)
          }
        })()
      },
    })
  }
  // Shaped like the list that is coming, so it does not jump from a lone spinner to a page of rows.
  if (u.loading && !u.rows.length) return <div style={{ padding: '8px 14px' }}><Skel rows={4} table label="Loading people who wrote in" /></div>
  if (!u.rows.length) return <Empty icon="users" title="Everyone who wrote in is in SalesOS" body="Mail from people who are not contacts is not filed here. When someone new writes to a mailbox you run, they are listed here to add." />
  return (
    <div>
      <div className="faint xs" style={{ padding: '8px 14px' }}>These people wrote to your mailboxes but are not contacts, so their mail is not in the Inbox. Add one to file their last 90 days of mail.</div>
      {u.rows.map(r => (
        <div key={key(r)} className="th" style={{ cursor: 'default' }}>
          <span className="row" style={{ gap: 6, width: '100%' }}>
            <span className="sm b trunc" style={{ flex: 1 }}>{r.name || r.address}</span>
            <span className="faint xs">{F.rel(r.at)}</span>
          </span>
          {r.name && <span className="faint xs trunc">{r.address}</span>}
          <span className="sm trunc">{r.subject}{r.count > 1 ? <span className="faint xs"> · {r.count} messages</span> : null}</span>
          <span className="row" style={{ gap: 4, marginTop: 4 }}>
            <Btn size="xs" icon="plus" loading={busy === key(r)} onClick={() => add(r)}>{busy === key(r) ? 'Filing…' : 'Add contact'}</Btn>
            <Btn size="xs" kind="ghost" disabled={busy === key(r)} onClick={() => void dismiss(r)}>Dismiss</Btn>
          </span>
        </div>
      ))}
    </div>
  )
}
