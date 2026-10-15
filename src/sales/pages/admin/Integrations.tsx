import { useEffect, useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { isProviderEnabled } from '../../data/session'
import type { BusinessId, EnrichUsage } from '../../api/contract'
import type { Mailbox } from '../../data/types'
import { Av, Banner, BizChip, Btn, Card, Chip, DataTable, Empty, Icon, Menu, SimChip, Spinner, Toggle, type Col } from '../../kit'
import { enrichUsage } from '../../ai/client'
import { fmtResets, phoneLeft, usePhoneStatus } from '../../phone/client'
import { connectMailboxApi, disconnectMailboxApi, syncMailboxApi } from '../../api/mailboxes'
import { mailReturnMessage, readMailReturn, useMailState } from '../../mail/client'
import { leaveTo } from '../../mail/navigate'
import { SalesHttpError } from '../../api/http'
import { pollOnce } from '../../data/sync'
import { EnrichActivity } from './EnrichActivity'
import { RosterioLinkCard } from './RosterioLinkCard'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

const BOUNDARIES = ['Email provider', 'Email sync', 'Email sending', 'Lead enrichment', 'Company research', 'AI assistant', 'Sequence scheduler', 'Notifications', 'Authentication', 'Audit logging']
const LIVE_NOTE = 'Gmail is read only. SalesOS reads mail to and from people who are in your CRM and files it in the Inbox; it does not send. A personal mailbox is private to its owner: nobody else, including admins, can read it in SalesOS.'
const SIM_NOTE = 'Simulated: no real email is sent yet. Mail from these mailboxes is recorded in SalesOS only and does not count in goals or reports.'
const LI = ['Saving and opening profile URLs', 'Manual logging of connection requests, messages and responses', 'Manual LinkedIn tasks inside sequences']

export function Integrations() {
  const me = Q.me()
  const adm = Q.anyAdmin()
  const [busy, setBusy] = useState<string | null>(null)
  const mail = useMailState()
  const live = mail.s === 'live'
  // Google sends the browser back here with the result of consent in the address; say it once and clear it.
  useEffect(() => {
    const r = readMailReturn(window.location.search)
    if (!r) return
    UI.toast(mailReturnMessage(r))
    window.history.replaceState(null, '', window.location.pathname)
    if (r.ok) void pollOnce()
  }, [])
  const fail = (e: unknown): void => { UI.toast(e instanceof SalesHttpError ? e.message : 'Could not reach the server. Try again.') }
  const goGoogle = async (id: string): Promise<void> => {
    setBusy(id)
    try { leaveTo((await connectMailboxApi(id)).url) } catch (e) { setBusy(null); fail(e) }
  }
  const dropGoogle = async (id: string): Promise<void> => {
    setBusy(id)
    try { await disconnectMailboxApi(id); await pollOnce(); UI.toast('Mailbox disconnected. Mail already in SalesOS stays.') } catch (e) { fail(e) } finally { setBusy(null) }
  }
  const syncNow = async (id: string): Promise<void> => {
    setBusy(id)
    try {
      const r = await syncMailboxApi(id)
      await pollOnce()
      UI.toast(!r.ran ? 'A sync is already running for this mailbox.' : r.stored ? `${r.stored} new message${r.stored === 1 ? '' : 's'} filed` : 'Up to date')
    } catch (e) { fail(e) } finally { setBusy(null) }
  }
  const connect = (id: string, p: Partial<Mailbox>): void => {
    setBusy(id)
    window.setTimeout(() => {
      setBusy(null)
      Act.setMailbox(id, p)
      UI.toast(p.status === 'connected' ? 'Connected (simulated Google consent)' : 'Mailbox disconnected')
    }, 900)
  }
  const personal = S.mailboxes.filter(m => m.type === 'personal' && (m.ownerId === me.id || (adm && m.businessIds.some(b => Q.canAdmin(b)))))
  const shared = S.mailboxes.filter(m => m.type === 'shared' && m.businessIds.some(b => Q.member(b)))

  const personalCols: Col<Mailbox>[] = [
    { k: 'address', l: 'Account', r: m => <div><b>{m.address}</b><div className="faint xs">{Q.user(m.ownerId)?.name}</div></div> },
    { k: 's', l: 'Status', sort: m => m.status, r: m => <Chip tone={m.status === 'connected' ? 'ok' : 'bad'}>{m.status === 'connected' ? 'Connected' : 'Disconnected, reauthorisation required'}</Chip> },
    { k: 'b', l: 'Business', nosort: true, r: m => <span className="row" style={{ gap: 3 }}>{m.businessIds.map(b => <BizChip key={b} b={b} />)}</span> },
    { k: 'sync', l: 'Last sync', sort: m => m.lastSync ?? '', r: m => (m.lastSync ? F.rel(m.lastSync) : 'Never') },
    { k: 'send', l: 'Sending', nosort: true, r: m => live ? <span className="faint xs">Read only</span> : <Toggle on={m.canSend} label={`Allow sending from ${m.address}`} onChange={v => Act.setMailbox(m.id, { canSend: v })} disabled={m.ownerId !== me.id && !adm} /> },
    {
      k: 'a', l: '', nosort: true,
      r: m => {
        const mine = m.ownerId === me.id
        if (live) {
          // Only the owner connects a personal mailbox (the server refuses anyone else); an admin may only disconnect it.
          if (busy === m.id) return <span className="row sm"><Spinner />Working…</span>
          return (
            <span className="row" style={{ gap: 2 }}>
              {m.status === 'connected' && mine && <Btn size="xs" kind="ghost" onClick={() => void syncNow(m.id)}>Sync now</Btn>}
              {m.status === 'connected'
                ? (mine || adm) && <Btn size="xs" kind="ghost" onClick={() => void dropGoogle(m.id)}>Disconnect</Btn>
                : mine && <Btn size="xs" kind="pri" onClick={() => void goGoogle(m.id)}>Connect Gmail</Btn>}
            </span>
          )
        }
        return (mine || adm) && (busy === m.id
          ? <span className="row sm"><Spinner />Connecting…</span>
          : m.status === 'connected'
            ? <Btn size="xs" kind="ghost" onClick={() => connect(m.id, { status: 'disconnected' })}>Disconnect</Btn>
            : <Btn size="xs" kind="pri" onClick={() => connect(m.id, { status: 'connected' })}>Reconnect</Btn>)
      },
    },
  ]
  const sharedCols: Col<Mailbox>[] = [
    { k: 'address', l: 'Mailbox', r: m => <b>{m.address}</b> },
    { k: 'b', l: 'Business', nosort: true, r: m => (m.businessIds[0] ? <BizChip b={m.businessIds[0]} /> : '—') },
    { k: 's', l: 'Status', r: m => <Chip tone={m.status === 'connected' ? 'ok' : 'bad'}>{m.status}</Chip> },
    { k: 'au', l: 'Authorised users', nosort: true, r: m => (m.authorised.length ? <span className="row" style={{ gap: 2 }}>{m.authorised.map(u => <Av key={u} u={Q.user(u)} s={20} />)}</span> : <span className="faint xs">Nobody yet</span>) },
    { k: 'sync', l: 'Last sync', sort: m => m.lastSync ?? '', r: m => (m.lastSync ? F.rel(m.lastSync) : 'Never') },
    {
      k: 'a', l: '', nosort: true,
      r: m => {
        const b = m.businessIds[0]
        if (!b || !Q.canAdmin(b)) return null
        return (
          <span className="row" style={{ gap: 2 }}>
            <Menu
              align="right"
              trigger={<Btn size="xs" kind="ghost" icon="users">Access</Btn>}
              items={Q.usersIn(b).map(u => ({
                label: u.name,
                checked: m.authorised.includes(u.id),
                onClick: () => Act.setMailbox(m.id, { authorised: m.authorised.includes(u.id) ? m.authorised.filter(x => x !== u.id) : m.authorised.concat(u.id) }),
              }))}
            />
            {busy === m.id
              ? <Spinner />
              : live
                ? (
                  <>
                    {m.status === 'connected' && <Btn size="xs" kind="ghost" onClick={() => void syncNow(m.id)}>Sync now</Btn>}
                    <Btn size="xs" kind={m.status === 'connected' ? 'ghost' : 'pri'} onClick={() => void (m.status === 'connected' ? dropGoogle(m.id) : goGoogle(m.id))}>{m.status === 'connected' ? 'Disconnect' : 'Connect Gmail'}</Btn>
                  </>
                )
                : <Btn size="xs" kind="ghost" onClick={() => connect(m.id, { status: m.status === 'connected' ? 'disconnected' : 'connected' })}>{m.status === 'connected' ? 'Disconnect' : 'Reconnect'}</Btn>}
          </span>
        )
      },
    },
  ]

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHead title="Integrations" sub="Connections to other services. Anything marked Simulated is a stand-in: it sends and fetches nothing real." />
      <div className="col" style={{ gap: 14 }}>
        <Card title="Google Workspace / Gmail: personal accounts" icon="mail" right={live ? <Chip tone="ok">Gmail, read only</Chip> : <SimChip>Simulated mailbox</SimChip>} pad={false}>
          <DataTable
            rows={personal}
            cols={personalCols}
            empty={<Empty icon="mail" title="No personal mailbox connected" body="Mailboxes are provisioned for your account by an administrator. Once one is added you can connect it here and choose whether sequences may send from it." />}
          />
          <div className="faint xs" style={{ padding: 10 }}>{live ? LIVE_NOTE : SIM_NOTE}{mail.s === 'off' && mail.reason ? ` Real Gmail is not available yet: ${mail.reason}.` : ''}</div>
        </Card>
        <Card title="Shared business inboxes" icon="users" right={live ? <Chip tone="ok">Gmail, read only</Chip> : <SimChip>Simulated mailbox</SimChip>} pad={false}>
          <DataTable
            rows={shared}
            cols={sharedCols}
            empty={<Empty icon="inbox" title="No shared inboxes" body="Shared inboxes for your businesses will appear here, with the people who are authorised to use them." />}
          />
          <div className="faint xs" style={{ padding: 10 }}>{live ? 'A shared inbox is connected by a business admin signing in as that address. Its mail is shared with that business only. ' : `${SIM_NOTE} `}Knowing an address never grants access.</div>
        </Card>
        <div className="grid g2">
          <EnrichCard />
          <div className="col" style={{ gap: 14 }}>
            {adm && <PhoneCard />}
            <RosterioLinkCard />
            <Card title="LinkedIn" icon="li">
              <div className="sm">Supported:</div>
              <div className="col sm" style={{ gap: 4, marginTop: 6 }}>
                {LI.map(x => <div key={x} className="row"><Icon n="check" s={13} style={{ color: 'var(--ok)' }} />{x}</div>)}
              </div>
              <Banner tone="info">SalesOS does not send LinkedIn messages, scrape profiles or sync LinkedIn inboxes.</Banner>
            </Card>
            <Card title="Service boundaries" icon="layers">
              <div className="sm muted">The UI calls provider interfaces, with mock implementations ready for production adapters:</div>
              <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>{BOUNDARIES.map(x => <Chip key={x}>{x}</Chip>)}</div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

type UsageRow = { s: 'loading' } | { s: 'error' } | { s: 'ok'; usage: EnrichUsage }

/** Grok contact enrichment. The server counter is the source of truth for usage; the log below is what people applied. */
function EnrichCard() {
  const configured = isProviderEnabled('xai')
  const bs = Q.myBiz()
  const key = bs.join(',')
  const [rows, setRows] = useState<Partial<Record<BusinessId, UsageRow>>>({})
  useEffect(() => {
    if (!configured) return
    const ac = new AbortController()
    for (const b of key.split(',').filter((x): x is BusinessId => !!x)) {
      enrichUsage(b, ac.signal).then(r => {
        if (ac.signal.aborted || r.status === 'cancelled') return
        setRows(o => ({ ...o, [b]: r.status === 'ok' ? { s: 'ok', usage: r.usage } : { s: 'error' } }))
      })
    }
    return () => ac.abort()
  }, [configured, key])
  const history = S.wiza.history
  const adminBiz = bs.filter(b => Q.canAdmin(b))
  return (
    <Card title="Contact enrichment (Grok)" icon="zap">
      <div className="row" style={{ marginBottom: 12 }}>
        <Chip tone={configured ? 'ok' : 'warn'}>{configured ? 'Configured' : 'Not configured'}</Chip>
        <span className="faint xs">Looks up published contact details on the web. Results are applied only when someone ticks them.</span>
      </div>
      {!configured && <Banner tone="info">Grok is not configured on the server, so lookups are unavailable. Ask an administrator to set the xAI key.</Banner>}
      {configured && (
        <div className="col" style={{ gap: 4 }}>
          <div className="b sm">Lookups this month</div>
          {bs.map(b => {
            const r = rows[b]
            const u = r?.s === 'ok' ? r.usage : undefined
            return (
              <div key={b} className="row sm" style={{ padding: '3px 0' }}>
                <BizChip b={b} />
                {!r || r.s === 'loading' ? <span className="faint">Loading…</span>
                  : r.s === 'error' || !u ? <span className="faint">Usage unavailable</span>
                  : <><b>{u.used}/{u.limit}</b><span className="faint xs">· resets {F.date(u.resetsOn)} (UTC month)</span></>}
              </div>
            )
          })}
        </div>
      )}
      <div className="b sm" style={{ marginTop: 14 }}>Applied results</div>
      <div className="faint xs">Applied results only. Lookups that were not applied are counted by the server, not listed here.</div>
      {history.length
        ? history.slice(0, 6).map((h, i) => {
          const bad = /fail/i.test(h.action)
          return (
            <div key={i} className="row sm" style={{ padding: '3px 0' }}>
              <Icon n={bad ? 'alert' : 'check'} s={12} style={{ color: bad ? 'var(--bad2)' : 'var(--ok)' }} />
              {h.action}
              <span className="faint xs">· {h.result} · {F.rel(h.ts)}</span>
            </div>
          )
        })
        : <div className="faint sm" style={{ padding: '4px 0' }}>No enrichment has been applied yet.</div>}
      {adminBiz.length > 0 && (
        <>
          <div className="b sm" style={{ marginTop: 14 }}>Enrichment activity</div>
          <div className="faint xs">The last 20 lookups the server ran, whether or not anyone applied them.</div>
          {adminBiz.map(b => <EnrichActivity key={b} b={b} showBiz={adminBiz.length > 1} />)}
        </>
      )}
    </Card>
  )
}

const VENDOR: Record<string, string> = { leadmagic: 'LeadMagic', signalhire: 'SignalHire', wiza: 'Wiza' }

/** Mobile phone lookup. Which vendor is set up on the server and what is used this month. The browser never sees a key. */
export function PhoneCard() {
  const status = usePhoneStatus()
  const st = status.s === 'ok' ? status.status : undefined
  const label = st?.label ?? (st?.provider ? VENDOR[st.provider] : undefined)
  return (
    <Card title="Phone lookup" icon="phone">
      {status.s === 'loading' && <div className="row sm" aria-busy="true"><Spinner />Checking…</div>}
      {status.s === 'error' && <div className="faint sm">Status unavailable right now.</div>}
      {st && (
        <div className="col" style={{ gap: 6 }}>
          <div className="row">
            <Chip tone={st.configured ? 'ok' : 'warn'}>{st.configured ? 'Configured' : 'Not configured'}</Chip>
            {st.configured && label && <span className="sm">Provider: <b>{label}</b></span>}
          </div>
          {st.configured
            ? <div className="sm"><b>{st.usage.used}/{st.usage.limit}</b> lookups used this month <span className="faint xs">· {phoneLeft(st.usage)} left, resets {fmtResets(st.usage.resetsOn)} (UTC month)</span></div>
            : <Banner tone="info">Phone lookup isn't set up. An admin needs to choose a provider on the server.</Banner>}
          <div className="faint xs">Looks up a mobile number from a contact's page when someone clicks Find mobile. Numbers are added only when someone chooses to.</div>
        </div>
      )}
    </Card>
  )
}
