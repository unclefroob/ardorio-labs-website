import { useEffect, useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { isProviderEnabled } from '../../data/session'
import type { BusinessId, EnrichUsage } from '../../api/contract'
import type { Mailbox } from '../../data/types'
import { Av, Banner, BizChip, Btn, Card, Chip, DataTable, Empty, Icon, Menu, Sim, Spinner, Toggle, type Col } from '../../kit'
import { enrichUsage } from '../../ai/client'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

const BOUNDARIES = ['Email provider', 'Email sync', 'Email sending', 'Lead enrichment', 'Company research', 'AI assistant', 'Sequence scheduler', 'Notifications', 'Authentication', 'Audit logging']
const LI = ['Saving and opening profile URLs', 'Manual logging of connection requests, messages and responses', 'Manual LinkedIn tasks inside sequences']

export function Integrations() {
  const me = Q.me()
  const adm = Q.anyAdmin()
  const [busy, setBusy] = useState<string | null>(null)
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
    { k: 'send', l: 'Sending', nosort: true, r: m => <Toggle on={m.canSend} label={`Allow sending from ${m.address}`} onChange={v => Act.setMailbox(m.id, { canSend: v })} disabled={m.ownerId !== me.id && !adm} /> },
    {
      k: 'a', l: '', nosort: true,
      r: m => (m.ownerId === me.id || adm) && (busy === m.id
        ? <span className="row sm"><Spinner />Connecting…</span>
        : m.status === 'connected'
          ? <Btn size="xs" kind="ghost" onClick={() => connect(m.id, { status: 'disconnected' })}>Disconnect</Btn>
          : <Btn size="xs" kind="pri" onClick={() => connect(m.id, { status: 'connected' })}>Reconnect</Btn>),
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
              : <Btn size="xs" kind="ghost" onClick={() => connect(m.id, { status: m.status === 'connected' ? 'disconnected' : 'connected' })}>{m.status === 'connected' ? 'Disconnect' : 'Reconnect'}</Btn>}
          </span>
        )
      },
    },
  ]

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHead title="Integrations" sub="All integrations are mock providers. No real credentials are requested or stored." />
      <div className="col" style={{ gap: 14 }}>
        <Card title="Google Workspace / Gmail: personal accounts" icon="mail" right={<Sim>Mock Gmail provider</Sim>} pad={false}>
          <DataTable
            rows={personal}
            cols={personalCols}
            empty={<Empty icon="mail" title="No personal mailbox connected" body="Mailboxes are provisioned for your account by an administrator. Once one is added you can connect it here and choose whether sequences may send from it." />}
          />
        </Card>
        <Card title="Shared business inboxes" icon="users" pad={false}>
          <DataTable
            rows={shared}
            cols={sharedCols}
            empty={<Empty icon="inbox" title="No shared inboxes" body="Shared inboxes for your businesses will appear here, with the people who are authorised to use them." />}
          />
          <div className="faint xs" style={{ padding: 10 }}>Production design: delegated or authorised shared-mailbox access. Knowing an address never grants access.</div>
        </Card>
        <div className="grid g2">
          <EnrichCard />
          <div className="col" style={{ gap: 14 }}>
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
    </Card>
  )
}
