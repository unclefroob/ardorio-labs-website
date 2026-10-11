import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isFailure, type EnrichFailure } from '../../../ai/client'
import { checkCompany } from '../../../ai/intelRun'
import type { CompanyContactItem, CompanySignal, IntelKind, SignalKind, TechItem } from '../../../api/contract'
import { Act } from '../../../data/Act'
import { Q } from '../../../data/Q'
import { ageDays, SIGNAL_MAX_AGE_DAYS } from '../../../data/signalAdjust'
import { useStore } from '../../../data/store'
import type { BusinessId, Company, Intel } from '../../../data/types'
import { AiNotConfigured, Btn, Card, Chip, Empty, Icon, Skel, Spinner } from '../../../kit'
import { FailureBanner } from '../../../modals/comms/Enrich'
import { CheckNote, ClosureReview, Src } from '../../../shared/IntelBits'
import { checkedLine, copyText } from '../../../shared/intelText'
import { useLookups, type Lookups } from '../../../shared/useLookups'
import { UI } from '../../../ui/store'

const SIGNAL_LABEL: Record<SignalKind, string> = {
  expansion: 'Expansion', funding: 'Funding', hiring: 'Hiring', leadership: 'Leadership', closure: 'Closure', award: 'Award', news: 'News',
}
const SIGNAL_TONE: Record<SignalKind, string> = { expansion: 'ok', funding: 'ok', hiring: 'info', leadership: 'info', closure: 'bad', award: 'ok', news: '' }
const CATEGORY_LABEL: Record<TechItem['category'], string> = { rostering: 'Rostering', hr: 'HR', payroll: 'Payroll', pos: 'POS', other: 'Other' }
const FIELD_LABEL: Record<CompanyContactItem['field'], string> = { phone: 'Phone', email: 'General email', address: 'Address' }
const FIELD_ICON: Record<CompanyContactItem['field'], string> = { phone: 'phone', email: 'mail', address: 'pin' }

const sigs = (r: Intel | undefined): CompanySignal[] => (r?.kind === 'signals' ? (r.items as CompanySignal[]) : [])
const tools = (r: Intel | undefined): TechItem[] => (r?.kind === 'tech' ? (r.items as TechItem[]) : [])
const details = (r: Intel | undefined): CompanyContactItem[] => (r?.kind === 'contact' ? (r.items as CompanyContactItem[]) : [])

interface LookupState {
  busy: boolean
  fail: EnrichFailure | null
  /** Values the server dropped on the last run in this session. */
  withheld: number
  run: () => void
  cancel: () => void
}

function useLookup(kind: IntelKind, c: Company, b: BusinessId): LookupState {
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<EnrichFailure | null>(null)
  const [withheld, setWithheld] = useState(0)
  const live = useRef<AbortController | null>(null)
  useEffect(() => () => live.current?.abort(), [])

  const run = (): void => {
    if (live.current || !UI.guard(b, 'Checking the web')) return
    const ac = new AbortController()
    live.current = ac
    setBusy(true)
    setFail(null)
    void checkCompany(kind, c.id, b, { signal: ac.signal }).then(o => {
      if (live.current !== ac) return
      live.current = null
      setBusy(false)
      if (isFailure(o)) setFail(o)
      else setWithheld(o.withheld)
    })
  }
  const cancel = (): void => {
    live.current?.abort()
    live.current = null
    setBusy(false)
    setFail({ status: 'cancelled' })
  }
  return { busy, fail, withheld, run, cancel }
}

interface ShellProps {
  title: string
  icon: string
  kind: IntelKind
  c: Company
  b: BusinessId
  rec: Intel | undefined
  lk: Lookups
  what: string
  children: ReactNode
  extra?: ReactNode
}

/** Shared frame: last-checked line, Refresh with its cost, and the empty / not-configured / busy / error states. */
function IntelShell({ title, icon, kind, c, b, rec, lk, what, children, extra }: ShellProps) {
  const st = useLookup(kind, c, b)
  const canRun = Q.canEdit(b)
  const blocked = lk.notConfigured || lk.capped || !canRun
  const verb = rec ? 'Refresh' : 'Check'
  return (
    <Card
      title={title}
      icon={icon}
      right={
        st.busy ? (
          <Btn size="sm" onClick={st.cancel}>Cancel</Btn>
        ) : (
          <Btn size="sm" icon="refresh" disabled={blocked} onClick={st.run} title={!canRun ? 'You need edit access to this business' : 'Searches the public web. Uses 1 lookup.'}>
            {verb} · 1 lookup
          </Btn>
        )
      }
    >
      <div aria-live="polite" className="col" style={{ gap: 10 }}>
        {st.busy && (
          <div className="col" style={{ gap: 8 }} aria-busy="true">
            <div className="row sm"><Spinner />Searching the public web for {what} at {c.name}… this can take 30–60 s.</div>
            <Skel rows={2} />
          </div>
        )}
        {st.fail && <FailureBanner o={st.fail} onRetry={st.run} />}
        {!st.busy && lk.notConfigured && !rec && (
          <Empty icon="spark" title="Grok is not configured" body="The server has no xAI key, so this can't be looked up. Nothing is shown rather than guessing." />
        )}
        {!st.busy && !rec && !lk.notConfigured && !st.fail && (
          <Empty icon={icon} title="Not checked yet" body={`Search the public web for ${what} at ${c.name}. Everything shown links to the page it came from.`} />
        )}
        {rec && (
          <>
            <div className="row wrap xs faint" style={{ gap: 6 }}>
              <span>{checkedLine(rec)}</span>
              {rec.model && <span>· {rec.provider === 'xai' ? 'Grok' : 'Claude'} ({rec.model})</span>}
            </div>
            {rec.items.length === 0 && !st.busy && (
              <div className="sm muted">Nothing found{st.withheld > 0 ? `; ${st.withheld} value(s) were withheld because no source could be checked` : ''}.</div>
            )}
            {children}
            {st.withheld > 0 && rec.items.length > 0 && <div className="xs faint">{st.withheld} value(s) withheld: no verifiable source.</div>}
            {extra}
            <div className="xs faint">{rec.disclaimer}</div>
          </>
        )}
        {lk.capped && lk.usage && (
          <div className="xs" style={{ color: 'var(--warn)' }} role="status">{lk.pausedLabel}. Monthly limit reached ({lk.usage.used} of {lk.usage.limit}). What is already saved still counts in scores and opening lines.</div>
        )}
      </div>
    </Card>
  )
}

function SignalsCard(p: { c: Company; b: BusinessId; lk: Lookups }) {
  const rec = Q.intel(p.c.id, 'signals', p.b)
  const items = [...sigs(rec)].sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))
  return (
    <IntelShell title="Company signals" icon="zap" kind="signals" what="news, hiring and expansion" rec={rec} {...p}>
      {items.length > 0 && (
        <ul className="col" style={{ gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map(s => {
            const old = s.date ? ageDays(s.date) > SIGNAL_MAX_AGE_DAYS : false
            const open = s.kind === 'closure' && !s.review
            return (
              <li key={s.kind + s.headline + s.sourceUrl}>
                <div className="row wrap" style={{ gap: 6 }}>
                  <Chip tone={SIGNAL_TONE[s.kind]}>{SIGNAL_LABEL[s.kind] ?? s.kind}</Chip>
                  {s.hrOps && <Chip tone="info" title="A hiring signal for an HR, payroll, people or operations role">HR/ops hiring</Chip>}
                  {s.date && <span className="xs faint">{s.date}</span>}
                  {old && <span className="xs faint" title={`Signals older than ${SIGNAL_MAX_AGE_DAYS} days do not change the score`}>older than 6 months</span>}
                  {!s.date && <span className="xs faint" title="A signal needs its own date to count towards the score or an opening line">undated, not counted</span>}
                  {s.kind === 'closure' && s.review && <Chip tone={s.review === 'confirmed' ? 'bad' : ''}>{s.review === 'confirmed' ? 'Closure confirmed' : 'Closure dismissed'}</Chip>}
                </div>
                <div className="sm" style={{ marginTop: 2 }}>{s.headline}</div>
                <div className="xs"><Src url={s.sourceUrl} /></div>
                {open && <div style={{ marginTop: 4 }}><ClosureReview companyId={p.c.id} b={p.b} closure={s} /></div>}
              </li>
            )
          })}
        </ul>
      )}
    </IntelShell>
  )
}

function TechCard(p: { c: Company; b: BusinessId; lk: Lookups }) {
  useStore()
  const rec = Q.intel(p.c.id, 'tech', p.b)
  const items = tools(rec)
  const known = new Set((Array.isArray(p.c.tech) ? p.c.tech : []).map(x => x.toLowerCase()))
  const fresh = items.filter(t => !known.has(t.name.trim().toLowerCase()))
  const comps = items.filter(t => t.competitor)
  const add = (): void => {
    if (!UI.guard(p.b, 'Updating technology')) return
    const n = Act.addKnownTech(p.c.id, fresh.map(t => t.name))
    UI.toast(n ? `${n} tool${n === 1 ? '' : 's'} added to ${p.c.name}'s known technology` : 'Already in known technology')
  }
  return (
    <IntelShell
      title="Technology & competitors"
      icon="plug"
      kind="tech"
      what="the tools they use"
      rec={rec}
      {...p}
      extra={items.length > 0 && Q.canEdit(p.b) ? (
        <div className="row">
          <Btn size="sm" icon="plus" disabled={fresh.length === 0} onClick={add}>Add to known technology</Btn>
          <span className="xs faint">{fresh.length ? `${fresh.length} not yet on the company record` : 'All already on the company record'}</span>
        </div>
      ) : null}
    >
      {comps.length > 0 && (
        <div className="row sm" role="status" style={{ gap: 6, color: 'var(--warn)' }}>
          <Icon n="flag" s={14} /><b>Uses a competitor: {comps.map(t => t.name).join(', ')}</b>
        </div>
      )}
      {items.length > 0 && (
        <ul className="col" style={{ gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map(t => (
            <li key={t.name + t.sourceUrl}>
              <div className="row wrap" style={{ gap: 6 }}>
                <b className="sm">{t.name}</b>
                <Chip>{CATEGORY_LABEL[t.category] ?? t.category}</Chip>
                {t.competitor && <Chip tone="warn" icon="flag">Competitor</Chip>}
              </div>
              <div className="sm muted">{t.evidence}</div>
              <div className="row wrap xs" style={{ gap: 8 }}><Src url={t.sourceUrl} /><CheckNote check={t.sourceCheck} /></div>
            </li>
          ))}
        </ul>
      )}
    </IntelShell>
  )
}

function ContactCard(p: { c: Company; b: BusinessId; lk: Lookups }) {
  const rec = Q.intel(p.c.id, 'contact', p.b)
  const items = details(rec)
  return (
    <IntelShell title="Company contact details" icon="building" kind="contact" what="a switchboard, general inbox and address" rec={rec} {...p}>
      {items.length > 0 && (
        <ul className="col" style={{ gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map(i => (
            <li key={i.field + i.value}>
              <div className="row wrap" style={{ gap: 8 }}>
                <Icon n={FIELD_ICON[i.field]} s={14} />
                <span className="xs faint" style={{ minWidth: 86 }}>{FIELD_LABEL[i.field] ?? i.field}</span>
                <span className="sm" style={{ overflowWrap: 'anywhere' }}>{i.value}</span>
                <Btn size="xs" kind="ghost" icon="copy" aria-label={`Copy ${FIELD_LABEL[i.field].toLowerCase()}`} onClick={() => copyText(i.value, UI.toast, `${FIELD_LABEL[i.field]} copied`)}>Copy</Btn>
              </div>
              <div className="row wrap xs" style={{ gap: 8, marginLeft: 22 }}><Src url={i.sourceUrl} /><CheckNote check={i.sourceCheck} /></div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && <div className="xs faint">Company-level details only. They stay on this page and are not added to the company or any contact.</div>}
    </IntelShell>
  )
}

/** The three web-intelligence cards on the company Intelligence tab. */
export function WebIntel({ c, b }: { c: Company; b: BusinessId }) {
  useStore()
  const lk = useLookups(b)
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap">
        <b className="sm">Web intelligence</b>
        <AiNotConfigured provider="xai" />
        {!lk.notConfigured && lk.label && <Chip>{lk.label}</Chip>}
        <span className="sp" />
        <span className="xs faint">Each check searches the public web and uses 1 lookup from the monthly allowance.</span>
      </div>
      {lk.competitorRule === true && (
        <div className="xs faint">Tools on {Q.biz(b)?.name ?? 'this business'}'s competitor list add 10 to the lead score.</div>
      )}
      <div className="grid g3">
        <SignalsCard c={c} b={b} lk={lk} />
        <TechCard c={c} b={b} lk={lk} />
        <ContactCard c={c} b={b} lk={lk} />
      </div>
    </div>
  )
}
