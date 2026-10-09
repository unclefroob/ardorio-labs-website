import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { AuditEntry, BusinessId, OrgSettings, Suppression } from '../../data/types'
import {
  Banner, Btn, Card, Chip, Ck, CtLink, DataTable, Empty, Fld, FilterBar, Icon, Inp, Link, Owner, SearchInp, Sel, Seg, TA, Tabs,
  download, toCSV, type Col,
} from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'

const TZ = ['Australia/Melbourne', 'Australia/Sydney', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide']
const ACCENTS = ['#4F46E5', '#2563EB', '#0E8A7E', '#059669', '#8B2FFC', '#C026D3', '#D9572B', '#B45309']

function Tick({ children }: { children: string }) {
  return <div className="row"><Icon n="check" s={13} style={{ color: 'var(--ok)' }} />{children}</div>
}

function OrgSettingsTab() {
  const sup = Q.isSuper()
  const [f, set] = useF<OrgSettings>({ ...S.org, notif: { ...S.org.notif } })
  const [limit, setLimit] = useState(String(S.org.sendingLimit))
  const save = (): void => {
    const n = Math.max(0, Math.trunc(Number(limit)))
    if (!f.name.trim() || !Number.isFinite(n)) {
      UI.toast('Enter an organisation name and a valid sending limit', 'bad')
      return
    }
    Act.setOrg({ ...f, name: f.name.trim(), sendingLimit: n })
    UI.toast('Organisation settings saved')
  }
  return (
    <Card title="Organisation" right={sup && <Btn size="sm" kind="pri" onClick={save}>Save</Btn>}>
      {!sup && <Banner icon="lock">Only Super Administrators can change organisation settings.</Banner>}
      <div className="grid g3" style={{ marginTop: sup ? 0 : 12 }}>
        <Fld label="Organisation name"><Inp value={f.name} onChange={v => set('name', v)} disabled={!sup} /></Fld>
        <Fld label="Default time zone"><Sel value={f.tz} onChange={v => set('tz', v)} options={TZ.includes(f.tz) ? TZ : [f.tz, ...TZ]} disabled={!sup} /></Fld>
        <Fld label="Currency"><Sel value={f.currency} onChange={v => set('currency', v)} options={[f.currency || 'AUD']} disabled={!sup} /></Fld>
        <Fld label="Date format"><Sel value={f.dateFormat} onChange={v => set('dateFormat', v)} options={['D MMM YYYY', 'DD/MM/YYYY']} disabled={!sup} /></Fld>
        <Fld label="Org-wide daily sending limit"><Inp value={limit} onChange={setLimit} inputMode="numeric" disabled={!sup} /></Fld>
        <Fld label="Default notifications">
          <div className="col" style={{ gap: 4 }}>
            <Ck checked={f.notif.inApp} onChange={v => set('notif', { ...f.notif, inApp: v })} disabled={!sup}>In-app</Ck>
            <Ck checked={false} disabled onChange={() => undefined}>Email (not available yet)</Ck>
          </div>
        </Fld>
      </div>
      <div className="b sm" style={{ marginTop: 16, marginBottom: 8 }}>Businesses</div>
      {S.businesses.length ? (
        <div className="grid g4">
          {S.businesses.map(b => (
            <div key={b.id} className="card card-b">
              <div className="row"><span className="ws-mark" style={{ background: b.accent, width: 24, height: 24, fontSize: 11 }}>{b.name[0]}</span><b>{b.name}</b></div>
              <div className="faint xs" style={{ marginTop: 6 }}>{b.currency} · {b.tz}</div>
              <div className="faint xs">{Q.usersIn(b.id).length} users · {S.teams.filter(t => t.businessId === b.id).length} teams</div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="building" title="No businesses" body="Businesses are created by the platform team." />
      )}
    </Card>
  )
}

function BizPicker({ value, onChange }: { value: BusinessId; onChange: (b: BusinessId) => void }) {
  const bs = Q.myBiz().filter(b => Q.canAdmin(b))
  return <Seg value={value} onChange={v => onChange(v as BusinessId)} opts={bs.map(x => [x, Q.biz(x)?.name ?? x] as const)} />
}

function BizProfile({ b }: { b: BusinessId }) {
  const bz = Q.biz(b)
  const pl = Q.pipeline(b)
  const [f, set] = useF({ name: bz?.name ?? '', desc: bz?.desc ?? '', accent: bz?.accent ?? ACCENTS[0] })
  if (!bz) return <Banner tone="bad">This business no longer exists.</Banner>
  const members = S.users.filter(u => u.active && !u.super && u.m[b])
  return (
    <div className="grid g2">
      <Card title="Business profile" right={<Btn size="sm" kind="pri" disabled={!f.name.trim()} onClick={() => { Act.setBiz(b, { ...f, name: f.name.trim() }); UI.toast('Saved') }}>Save</Btn>}>
        <div className="col gap12">
          <Fld label="Business name"><Inp value={f.name} onChange={v => set('name', v)} /></Fld>
          <Fld label="Description"><TA value={f.desc} onChange={v => set('desc', v)} rows={3} /></Fld>
          <Fld label="Brand accent">
            <div className="row">
              {ACCENTS.map(c => (
                <button key={c} type="button" aria-label={c} aria-pressed={f.accent === c} onClick={() => set('accent', c)} style={{ width: 26, height: 26, borderRadius: 6, background: c, border: f.accent === c ? '2px solid var(--fg)' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
          </Fld>
        </div>
      </Card>
      <Card title="Configuration">
        <dl className="dl">
          <dt>Pipeline</dt>
          <dd><Link to="pipelines">{pl.name || 'Not set up'}</Link> · {pl.stages.length} stages</dd>
          <dt>Team members</dt>
          <dd>{members.length ? members.map(u => u.name).join(', ') : <span className="faint">No members yet</span>}</dd>
          <dt>Sales targets</dt>
          <dd><Link to="goals">{S.goals.filter(g => g.businessId === b).length} goals</Link></dd>
          <dt>Email</dt>
          <dd>{S.mailboxes.filter(m => m.businessIds.includes(b)).length} mailboxes · <Link to="integrations">Manage</Link></dd>
          <dt>Sequences</dt>
          <dd>{S.sequences.filter(s => s.businessId === b).length} · default mode approval for new sequences</dd>
          <dt>Templates</dt>
          <dd><Link to="templates">{S.templates.filter(t => t.businessId === b).length} templates</Link></dd>
        </dl>
      </Card>
    </div>
  )
}

function BizSettings() {
  const bs = Q.myBiz().filter(b => Q.canAdmin(b))
  const [b, setB] = useState<BusinessId | undefined>(bs[0])
  if (!b) return <Card><Empty icon="building" title="No businesses to administer" body="You need the admin role in a business to edit its profile." /></Card>
  return (
    <div className="col" style={{ gap: 14 }}>
      <BizPicker value={b} onChange={setB} />
      <BizProfile key={b} b={b} />
    </div>
  )
}

const SCORING: ReadonlyArray<readonly [string, number, (n: string) => string]> = [
  ['Company fit', 30, n => `Target industry, size and locations for ${n}`],
  ['Decision-maker relevance', 20, () => 'Title matches target roles; seniority'],
  ['Engagement activity', 20, () => 'Replies, connected calls, meetings in the last 30 days'],
  ['Buying signals', 20, () => 'Open deal, positive reply, meeting booked, research'],
  ['Data completeness', 10, () => 'Email, phone, LinkedIn, verification'],
]
const SAFETY = [
  'Simulated or low-confidence output is always labelled',
  'Facts are separated from inferred suggestions',
  'Material record changes require approval',
  'Responses respect business permissions',
  'Private correspondence is never exposed across businesses',
  'Emails and enrolments are never sent or created silently',
  'External content is treated as untrusted information',
]

function AiProfile({ b }: { b: BusinessId }) {
  const bz = Q.biz(b)
  const [f, set] = useF({ knowledge: bz?.knowledge ?? '', style: bz?.style ?? '' })
  if (!bz) return <Banner tone="bad">This business no longer exists.</Banner>
  return (
    <div className="grid g2">
      <Card title={`${bz.name} product knowledge & messaging`} right={<Btn size="sm" kind="pri" onClick={() => { Act.setBiz(b, f); UI.toast('AI settings saved') }}>Save</Btn>}>
        <div className="col gap12">
          <Fld label="Product knowledge" hint="Sent to the AI with research, drafting and copilot requests"><TA value={f.knowledge} onChange={v => set('knowledge', v)} rows={5} /></Fld>
          <Fld label="Suggested messaging style"><TA value={f.style} onChange={v => set('style', v)} rows={3} /></Fld>
          <Banner tone="info">Deals are flagged as stale after 10 days without activity. Recommendations and cross-business suggestions follow fixed rules and are not configurable per business.</Banner>
        </div>
      </Card>
      <Card title="Lead scoring rules (0–100)">
        <div className="col" style={{ gap: 8 }}>
          {SCORING.map(([l, w, d]) => (
            <div key={l}>
              <div className="row sm"><b>{l}</b><span className="sp" /><span className="num">{w} pts</span></div>
              <div className="faint xs">{d(bz.name)}</div>
            </div>
          ))}
          <div className="sm" style={{ marginTop: 6 }}>Target industries: {bz.industries.join(', ') || '—'}</div>
          <div className="sm">Target roles: {bz.roles.join(', ') || '—'}</div>
          <Banner tone="info">Scores never use protected or sensitive personal characteristics.</Banner>
        </div>
      </Card>
    </div>
  )
}

function AiSettings() {
  const bs = Q.myBiz().filter(b => Q.canAdmin(b))
  const [b, setB] = useState<BusinessId | undefined>(bs[0])
  return (
    <div className="col" style={{ gap: 14 }}>
      {b ? (
        <>
          <BizPicker value={b} onChange={setB} />
          <AiProfile key={b} b={b} />
        </>
      ) : (
        <Card><Empty icon="spark" title="No businesses to administer" body="You need the admin role in a business to edit its AI settings." /></Card>
      )}
      <Card title="AI safety">
        <div className="grid g2 sm">{SAFETY.map(x => <Tick key={x}>{x}</Tick>)}</div>
      </Card>
    </div>
  )
}

const CHECKS = [
  'Contact has a usable email address',
  'Contact is not suppressed (global suppressions override all businesses)',
  'Outreach permission basis is recorded',
  'Sender mailbox is authorised and connected',
  'Template variables are fully resolved',
  'Sequence is active and the step is due',
  'No substantive human reply since enrolment',
  'No meeting booked that ends outreach',
  'No duplicate send for this step',
  'Within daily limit and business-day sending window',
]

function remove(s: Suppression): void {
  UI.confirm({
    title: 'Remove suppression?',
    body: 'Removing a suppression can re-enable outreach. Only do this with a documented basis (for example the contact asked to be re-subscribed). This is audited.',
    danger: true,
    confirm: 'Remove',
    onConfirm: () => { Act.removeSuppression(s.id); UI.toast('Suppression removed') },
  })
}

function Outreach() {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const all = S.suppressions.filter(s => !s.removed && (s.scope === 'global' || Q.inScope(s.businessId)))
  const rows = all.filter(s => !needle || `${Q.contact(s.contactId)?.name ?? ''} ${s.email ?? ''}`.toLowerCase().includes(needle))
  const adm = Q.anyAdmin()
  const cols: Col<Suppression>[] = [
    { k: 'c', l: 'Contact', sort: s => Q.contact(s.contactId)?.name ?? '', r: s => (s.contactId ? <CtLink id={s.contactId} /> : '—') },
    { k: 'email', l: 'Email', r: s => s.email || '—' },
    { k: 'scope', l: 'Scope', r: s => <Chip tone={s.scope === 'global' ? 'bad' : ''}>{s.scope === 'global' ? 'Global' : Q.biz(s.businessId)?.name ?? 'Business'}</Chip> },
    { k: 'reason', l: 'Reason' },
    { k: 'date', l: 'Date', r: s => F.dt(s.date) },
    { k: 'source', l: 'Source', max: 260, r: s => <span className="trunc" style={{ display: 'block' }} title={s.source}>{s.source}</span> },
    { k: 'by', l: 'By', sort: s => (s.by === 'system' ? 'System' : Q.user(s.by)?.name ?? ''), r: s => (s.by === 'system' ? 'System' : Q.user(s.by)?.name ?? '—') },
    { k: 'a', l: '', nosort: true, r: s => adm && (s.scope !== 'global' || Q.isSuper()) && <Btn size="xs" kind="ghost" onClick={() => remove(s)}>Remove</Btn> },
  ]
  return (
    <div className="col" style={{ gap: 14 }}>
      <Card title="Sending checks" icon="shield">
        <div className="grid g2 sm">{CHECKS.map(x => <Tick key={x}>{x}</Tick>)}</div>
        <div className="faint xs" style={{ marginTop: 10 }}>Enriched email addresses are not assumed to be permitted for outreach.</div>
      </Card>
      <Card title={`Suppression list (${rows.length})`} pad={false} right={Q.anyEdit() && <Btn size="sm" icon="plus" onClick={() => UI.open('addSuppression')}>Add suppression</Btn>}>
        <FilterBar><SearchInp value={q} onChange={setQ} placeholder="Search contact or email" /></FilterBar>
        <DataTable
          rows={rows}
          cols={cols}
          empty={all.length
            ? <Empty icon="search" title="No suppressions match" body={`Nothing matches “${q}”.`} action={<Btn size="sm" onClick={() => setQ('')}>Clear search</Btn>} />
            : <Empty icon="shield" title="No suppressions" body="Contacts who unsubscribe, bounce or ask not to be contacted are listed here and are never emailed." />}
        />
      </Card>
    </div>
  )
}

function actorName(a: AuditEntry): string {
  return a.actorId === 'system' ? 'System' : Q.user(a.actorId)?.name ?? a.actorId
}

function Audit() {
  const [q, setQ] = useState('')
  const [u, setU] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = S.audit
    .filter(a => (!u || a.actorId === u) && (!needle || `${a.action} ${a.target}`.toLowerCase().includes(needle)))
    .slice()
    .reverse()
  const cols: Col<AuditEntry>[] = [
    { k: 'ts', l: 'Time', r: a => F.dt(a.ts) },
    { k: 'actor', l: 'Actor', sort: actorName, r: a => (a.actorId === 'system' ? <Chip>System</Chip> : <Owner id={a.actorId} />) },
    { k: 'action', l: 'Action', r: a => <b className="sm">{a.action}</b> },
    { k: 'target', l: 'Detail', wrap: true },
  ]
  const filtered = !!(q || u)
  return (
    <Card pad={false}>
      <FilterBar>
        <SearchInp value={q} onChange={setQ} placeholder="Search actions" />
        <Sel className="sm" style={{ width: 180 }} value={u} onChange={setU} placeholder="Any actor" options={[['system', 'System'] as const, ...S.users.map(x => [x.id, x.name] as const)]} />
        <span className="sp" />
        <Btn size="sm" icon="download" disabled={!rows.length} onClick={() => download('audit.csv', toCSV([['Time', 'Actor', 'Action', 'Detail'], ...rows.map(a => [a.ts, actorName(a), a.action, a.target])]))}>Export</Btn>
      </FilterBar>
      <DataTable
        rows={rows}
        page={50}
        cols={cols}
        empty={filtered
          ? <Empty icon="search" title="No matching entries" body="Try a different search or actor." action={<Btn size="sm" onClick={() => { setQ(''); setU('') }}>Clear filters</Btn>} />
          : <Empty icon="clock" title="No audit history yet" body="Role changes, settings changes and other administrative actions are recorded here." />}
      />
    </Card>
  )
}

export function Settings() {
  const adm = Q.anyAdmin()
  const [tab, setTab] = useState(adm ? 'org' : 'outreach')
  const tabs: Array<[string, string]> = adm
    ? [['org', 'Organisation'], ['biz', 'Businesses'], ['ai', 'AI settings'], ['outreach', 'Outreach & suppression'], ['audit', 'Audit history']]
    : [['outreach', 'Outreach & suppression']]
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHead title="Settings" sub="Organisation, business, AI and outreach configuration" />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <div style={{ marginTop: 14 }}>
        {tab === 'org' && adm && <OrgSettingsTab />}
        {tab === 'biz' && adm && <BizSettings />}
        {tab === 'ai' && adm && <AiSettings />}
        {tab === 'outreach' && <Outreach />}
        {tab === 'audit' && adm && <Audit />}
      </div>
    </div>
  )
}
