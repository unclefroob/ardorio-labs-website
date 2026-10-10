import { useEffect, useRef, useState, type ReactNode } from 'react'
import { aiNotConfigured, checkEmail, checkLinkedinHint, daysSince, enrichContact, enrichUsage, fetchEnrichLog, isFailure, lastSuccessfulEnrich, RE_ENRICH_DAYS, type EnrichDone, type EnrichFailure, type EnrichOutcome } from '../../ai/client'
import { ageLabel, dropEnrich, fmtReset, getEnrich, remaining, useEnrichUsage } from '../../ai/enrichCache'
import type { EnrichField, EnrichSuggestion, ResearchSource } from '../../api/contract'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Contact } from '../../data/types'
import { AiNotConfigured, Banner, Btn, Chip, Ck, Empty, Fld, Icon, Inp, Modal, Skel, Spinner } from '../../kit'
import { isHttpUrl } from '../../shared/url'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from '../entities/guards'

const LABEL: Record<EnrichField, string> = {
  email: 'Work email', email2: 'Additional business email', mobile: 'Mobile', phone: 'Work phone', title: 'Job title', linkedin: 'LinkedIn URL',
}
const cur = (ct: Contact, k: string): string => {
  const v = ct[k]
  return typeof v === 'string' ? v : ''
}
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A citation as a link. Only http(s) URLs become links; anything else is not shown as one. */
export function SourceLink({ url, label }: { url: string | undefined; label?: string }) {
  if (!url || !isHttpUrl(url)) return <span className="faint">No usable source</span>
  return <a href={url} target="_blank" rel="noreferrer noopener">{label ?? hostOf(url)}</a>
}

/** Whether the server found the value on the page it cited. Text and an icon, never colour alone. */
export function SourceCheckNote({ s }: { s: EnrichSuggestion }) {
  if (s.kind !== 'published' || !s.sourceCheck) return null
  const ok = s.sourceCheck === 'confirmed'
  return (
    <span className="row xs" style={{ gap: 3, display: 'inline-flex' }}>
      <Icon n={ok ? 'check' : 'alert'} s={12} style={{ color: ok ? 'var(--ok)' : 'var(--warn)' }} />
      {ok ? 'Found on page' : "Couldn't confirm on the page, check the source yourself"}
    </span>
  )
}

/** What the server's log says about earlier lookups of this contact. 'unknown' (log unavailable) never blocks a lookup. */
export type Prior = { s: 'loading' } | { s: 'unknown' } | { s: 'none' } | { s: 'known'; days: number; by: string }

const PRIOR_WAIT_MS = 8000

export const whenLabel = (days: number): string => (days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`)

export function Sources({ sources }: { sources: ResearchSource[] }) {
  const ok = sources.filter(s => isHttpUrl(s.url))
  if (!ok.length) return null
  return (
    <div className="faint xs">
      Sources searched:{' '}
      {ok.map((s, i) => <span key={s.url}>{i > 0 && ', '}<SourceLink url={s.url} label={s.title || hostOf(s.url)} /></span>)}
    </div>
  )
}

/**
 * Whether a suggestion starts ticked: published values that fill an empty field. Never ticked: inferred values,
 * values already set, anything that would replace a non-empty value (verified or not), and mobile numbers
 * flagged as possibly personal.
 */
export function defaultPick(ct: Contact, s: EnrichSuggestion): boolean {
  if (s.kind === 'inferred') return false
  if (s.personal) return false
  return !cur(ct, s.field).trim()
}

/** One banner per way a lookup can fail. Each says whether the call was counted. */
export function FailureBanner({ o, onRetry }: { o: EnrichFailure; onRetry: () => void }): ReactNode {
  switch (o.status) {
    case 'notConfigured':
      return <Banner tone="warn"><b>Grok is not configured.</b> The server has no xAI key, so this can't be looked up. Nothing has been made up.</Banner>
    case 'cap':
      return <Banner tone="warn"><b>Monthly limit reached.</b> {o.usage.used} of {o.usage.limit} lookups used this month. The allowance resets on {o.usage.resetsOn ? fmtReset(o.usage.resetsOn) : 'the 1st (UTC)'}.</Banner>
    case 'providerError':
      return <Banner tone="bad" action={<Btn size="sm" onClick={onRetry}>Retry</Btn>}><b>The lookup service had a problem.</b> This call was not counted. {o.message}</Banner>
    case 'badOutput':
      return <Banner tone="warn" action={<Btn size="sm" onClick={onRetry}>Try again</Btn>}><b>The answer could not be used.</b> It was not in a form we can trust, so nothing is shown. This call was counted.</Banner>
    case 'error':
      return <Banner tone="bad" action={<Btn size="sm" onClick={onRetry}>Retry</Btn>}><b>Lookup failed.</b> {o.message}</Banner>
    case 'cancelled':
      return <Banner tone="info">Cancelled. A request already sent may still have been counted against the allowance.</Banner>
  }
}

export function Enrich({ contactId }: { contactId?: string }) {
  const ct = Q.contact(contactId)
  if (!ct) return <MissingModal title="Enrich contact" what="Contact" />
  const b = Q.primaryBiz(ct)
  if (b && !Q.canEdit(b)) return <NoEditModal title={'Enrich contact — ' + ct.name} what="enrich contacts" />
  return <EnrichFlow ct={ct} />
}

function EnrichFlow({ ct }: { ct: Contact }) {
  useStore()
  const b = Q.primaryBiz(ct)
  const usage = useEnrichUsage(b)
  const left = remaining(usage)
  const [hint, setHint] = useState('')
  const [hintErr, setHintErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<EnrichOutcome | null>(() => getEnrich(ct.id)?.res ?? null)
  const [at, setAt] = useState<number | null>(() => getEnrich(ct.id)?.ts ?? null)
  const [cached, setCached] = useState(() => !!getEnrich(ct.id))
  const [pick, setPick] = useState<Record<number, boolean>>(() => {
    const c = getEnrich(ct.id)
    return c ? Object.fromEntries(c.res.suggestions.map((s, i) => [i, defaultPick(ct, s)])) : {}
  })
  const [prior, setPrior] = useState<Prior>({ s: 'loading' })
  const [checking, setChecking] = useState(false)
  // Rows whose email domain cannot receive mail (row index to domain). They were not applied.
  const [blocked, setBlocked] = useState<Record<number, string>>({})
  const live = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const verified = ct.verification === 'Verified'
  const notConfigured = aiNotConfigured('xai')
  const capped = left === 0
  const priorLoading = prior.s === 'loading' && !!b && !notConfigured
  const recent = prior.s === 'known' && prior.days < RE_ENRICH_DAYS

  // Allowance only; this never starts a lookup (the usage endpoint is free). Refreshed on every open so a stale
  // "0 left" or a month rollover never sticks; skipped only when the server has no key.
  useEffect(() => {
    if (!b || notConfigured) return
    const ac = new AbortController()
    void enrichUsage(b, ac.signal)
    return () => ac.abort()
  }, [b, notConfigured])

  // Has this contact been enriched before? Free, and never blocks: a slow or failed log means "unknown".
  useEffect(() => {
    if (!b || notConfigured) return
    const ac = new AbortController()
    let timedOut = false
    const timer = window.setTimeout(() => { timedOut = true; ac.abort() }, PRIOR_WAIT_MS)
    void fetchEnrichLog(b, { contactId: ct.id, limit: 20, signal: ac.signal }).then(r => {
      window.clearTimeout(timer)
      if (ac.signal.aborted && !timedOut) return
      if (r.status !== 'ok') return setPrior({ s: 'unknown' })
      const last = lastSuccessfulEnrich(r.entries)
      setPrior(last ? { s: 'known', days: daysSince(last.at), by: last.userName } : { s: 'none' })
    })
    return () => { window.clearTimeout(timer); ac.abort() }
  }, [b, notConfigured, ct.id])

  // Leaving the modal stops waiting. It cannot recall a request the server has already started.
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; live.current?.abort() }
  }, [])

  const run = async (): Promise<void> => {
    if (!b || busy) return
    const h = checkLinkedinHint(hint)
    if (!h.ok) return setHintErr(h.error)
    setHintErr('')
    setBlocked({})
    const ac = new AbortController()
    live.current = ac
    setBusy(true)
    setOut(null)
    setAt(null)
    setCached(false)
    const o = await enrichContact(ct.id, b, { linkedinHint: h.value, signal: ac.signal })
    if (live.current !== ac) return
    live.current = null
    setBusy(false)
    setOut(o)
    if (o.status === 'found' || o.status === 'none' || o.status === 'withheld') {
      setAt(getEnrich(ct.id)?.ts ?? Date.now())
      setPick(Object.fromEntries(o.suggestions.map((s, i) => [i, defaultPick(Q.contact(ct.id) ?? ct, s)])))
    }
  }

  const cancel = (): void => {
    live.current?.abort()
    live.current = null
    setBusy(false)
    setOut({ status: 'cancelled' })
  }

  const done: EnrichDone | null = out && (out.status === 'found' || out.status === 'none' || out.status === 'withheld') ? out : null
  const rows = done?.suggestions ?? []
  const chosen = rows.filter((_, i) => pick[i])

  const toggle = (i: number, on: boolean): void => {
    const f = rows[i].field
    const next = { ...pick }
    if (on) rows.forEach((r, j) => { if (r.field === f) next[j] = false })
    next[i] = on
    setPick(next)
    if (blocked[i] !== undefined) setBlocked(Object.fromEntries(Object.entries(blocked).filter(([k]) => Number(k) !== i)))
  }

  // Emails are checked for a mail server first. Only a definite "no mail server" stops a row; an unknown answer or a
  // failed check applies as normal (the toast says the domain was not checked). Verification is set by Act, unchanged.
  const apply = async (): Promise<void> => {
    if (!b || !chosen.length || checking) return
    const emailRows = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => pick[i] && (r.field === 'email' || r.field === 'email2'))
    const unchecked: string[] = []
    if (emailRows.length) {
      setChecking(true)
      setBlocked({})
      const results = await Promise.all(emailRows.map(({ r }) => checkEmail(b, r.value)))
      if (!alive.current) return
      setChecking(false)
      const bad: Record<number, string> = {}
      emailRows.forEach(({ i }, k) => {
        if (results[k].status === 'no_mx') bad[i] = results[k].domain
        else if (results[k].status === 'unknown' && !unchecked.includes(results[k].domain)) unchecked.push(results[k].domain)
      })
      if (Object.keys(bad).length) {
        setBlocked(bad)
        setPick(p => ({ ...p, ...Object.fromEntries(Object.keys(bad).map(k => [k, false])) }))
        return
      }
    }
    Act.applyEnrichment(ct.id, chosen, b)
    UI.close()
    UI.toast('Enriched ' + ct.name + ': ' + chosen.length + ' field(s) updated' + (unchecked.length ? `. Couldn't check ${unchecked.join(', ')}.` : ''))
  }

  // The result was for someone else. Nothing is applied and the cached answer is dropped so it is not reused.
  const wrongPerson = (): void => {
    dropEnrich(ct.id)
    setOut(null)
    setAt(null)
    setPick({})
    UI.toast('Dismissed. Nothing was applied.')
  }

  const allowance = usage ? `${left} of ${usage.limit} left` : null
  const company = Q.company(ct.companyId)?.name

  const start = (
    <div className="col gap12">
      <div className="muted sm">
        Searches public web and X sources for {ct.name}{company ? ' at ' + company : ''} using Grok. Only business details published for their role are returned. Each lookup uses one of the business's monthly lookups.
      </div>
      <Fld label="LinkedIn URL (optional)" hint="A hint to help match the right person. It is not fetched on its own." err={hintErr}>
        <Inp value={hint} onChange={v => { setHint(v); setHintErr('') }} placeholder="linkedin.com/in/first-last" />
      </Fld>
      {prior.s === 'known' && recent && (
        <Banner tone="warn">
          <b>Enriched {whenLabel(prior.days)}{prior.by ? ' by ' + prior.by : ''}.</b> Looking them up again uses another of the business's monthly lookups. Click Enrich again only if you want a fresh search.
        </Banner>
      )}
      {prior.s === 'known' && !recent && (
        <div className="faint xs">Last enriched {whenLabel(prior.days)}{prior.by ? ' by ' + prior.by : ''}.</div>
      )}
      <div className="row">
        <Btn kind="pri" icon="zap" disabled={!b || notConfigured || capped || busy || priorLoading} onClick={() => void run()}>
          {recent ? 'Enrich again' : 'Find contact details'}
        </Btn>
        {allowance && <span className="sm muted">{allowance}</span>}
        {priorLoading && <span className="faint xs">Checking earlier lookups…</span>}
      </div>
    </div>
  )

  return (
    <Modal
      title={'Enrich contact — ' + ct.name}
      icon="zap"
      width={680}
      sub={<span className="row" style={{ gap: 6 }}><AiNotConfigured provider="xai" />{!notConfigured && allowance && <Chip>{allowance}</Chip>}</span>}
      footer={
        busy ? <Btn onClick={cancel}>Cancel search</Btn>
          : chosen.length || rows.length ? <><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" disabled={!chosen.length || checking} onClick={() => void apply()}>{checking ? 'Checking email…' : 'Apply selected' + (chosen.length ? ` (${chosen.length})` : '')}</Btn></>
          : <Btn onClick={UI.close}>Close</Btn>
      }
    >
      {!b ? (
        <Banner tone="warn">This contact isn't linked to a business yet, so a lookup can't be billed. Link it to a business first.</Banner>
      ) : busy ? (
        <div className="col gap12" style={{ padding: '10px 0' }} aria-busy="true">
          <div className="row"><Spinner />Searching public sources for {ct.name}{company ? ' at ' + company : ''}… this can take 30–60 s.</div>
          <Skel rows={4} />
          <div className="faint xs">Cancelling stops waiting, but a request already sent still counts against the allowance.</div>
        </div>
      ) : notConfigured ? (
        <FailureBanner o={{ status: 'notConfigured' }} onRetry={() => void run()} />
      ) : !out ? (
        capped && usage ? <FailureBanner o={{ status: 'cap', usage }} onRetry={() => void run()} /> : start
      ) : done ? (
        <div className="col gap12">
          <div className="row wrap" style={{ gap: 6 }}>
            <Chip tone={done.status === 'found' ? 'ok' : 'warn'}>{done.status === 'found' ? 'Possible match' : done.status === 'withheld' ? 'Results withheld' : 'Nothing found'}</Chip>
            {cached && at && <Chip icon="clock">cached {ageLabel(at)}</Chip>}
            <span className="sp" />
            {done.status === 'found' && <Btn size="xs" kind="ghost" onClick={wrongPerson}>Wrong person</Btn>}
          </div>
          {done.status === 'withheld' && (
            <Empty icon="shield" title="Results withheld — no verifiable source" body={`Grok returned ${done.withheld} value(s), but none could be tied to a source we could check, so none are shown. Nothing was made up.`} />
          )}
          {done.status === 'none' && (
            <Empty icon="search" title="No public details found" body="Nothing business-related was published for this name and company. Adding a LinkedIn URL and searching again may help." />
          )}
          {done.status === 'found' && (
            rows.length ? (
              <>
                <table className="tbl" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                  <thead><tr><th scope="col" style={{ width: 30 }} aria-label="Apply" /><th scope="col">Field</th><th scope="col">Current</th><th scope="col">Suggested</th></tr></thead>
                  <tbody>
                    {rows.map((s, i) => {
                      const have = cur(ct, s.field)
                      const unchanged = !!have && same(have, s.value)
                      const replaces = !!have && !unchanged
                      return (
                        <tr key={i}>
                          <td><Ck checked={!!pick[i]} disabled={unchanged} onChange={x => toggle(i, x)} label={'Apply ' + LABEL[s.field] + ' ' + s.value} /></td>
                          <td className="b">{LABEL[s.field]}</td>
                          <td className="faint">
                            {have || '—'}{have && verified && <Chip tone="ok" style={{ marginLeft: 6 }}>Verified</Chip>}
                            {replaces && <div className="xs">replaces: {have}</div>}
                          </td>
                          <td>
                            <div>{s.value}</div>
                            <div className="row wrap xs" style={{ gap: 6, marginTop: 2 }}>
                              <Chip tone={s.kind === 'published' ? 'ok' : 'warn'}>{s.kind === 'published' ? 'Published' : 'Guessed'}</Chip>
                              {unchanged && <span className="faint">Already set</span>}
                              {s.personal && <span className="faint">may be a personal number — check</span>}
                              {s.kind === 'inferred' && <span className="faint">guessed from the {s.pattern ?? 'company'} address pattern</span>}
                              {s.sourceUrl !== undefined && <SourceLink url={s.sourceUrl} />}
                              <SourceCheckNote s={s} />
                            </div>
                            {blocked[i] !== undefined && (
                              <div className="xs" role="alert" style={{ color: 'var(--bad2)', marginTop: 2 }}>{blocked[i]} doesn't accept email. This address was not applied.</div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {Object.keys(blocked).length > 0 && (
                  <Banner tone="warn">Nothing has been applied yet. Skip the address that can't receive mail, then apply the rest.</Banner>
                )}
                {rows.some(r => r.kind === 'inferred') && (
                  <Banner tone="warn">Guessed emails were not found online. They are worked out from the company's usual address format, so they may bounce. They start unticked, and a contact with a guessed email is not used for outreach until a person verifies it.</Banner>
                )}
                {rows.some(r => cur(ct, r.field)) && <Banner tone="info">Fields that already have a value start unticked so they aren't overwritten. Tick one to replace it.</Banner>}
              </>
            ) : <Banner tone="ok">Existing details already match. Nothing to update.</Banner>
          )}
          {done.withheld > 0 && done.status === 'found' && <div className="faint xs">{done.withheld} value(s) withheld — no verifiable source.</div>}
          <Sources sources={done.sources} />
          <div className="faint xs">Matched on name + company; verify identity before relying on these details. {done.disclaimer}</div>
          <div className="faint xs">Enrichment does not grant outreach permission.</div>
          <div><Btn size="sm" disabled={capped || notConfigured} onClick={() => void run()}>Search again (uses 1 lookup)</Btn></div>
        </div>
      ) : (
        <div className="col gap12">
          {isFailure(out) && <FailureBanner o={out} onRetry={() => void run()} />}
          {out.status !== 'cap' && out.status !== 'notConfigured' && start}
        </div>
      )}
    </Modal>
  )
}
