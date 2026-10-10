import { useEffect, useRef, useState, type ReactNode } from 'react'
import { aiNotConfigured, checkLinkedinHint, enrichContact, enrichUsage, isFailure, type EnrichDone, type EnrichFailure, type EnrichOutcome } from '../../ai/client'
import { ageLabel, dropEnrich, fmtReset, getEnrich, remaining, useEnrichUsage } from '../../ai/enrichCache'
import type { EnrichField, EnrichSuggestion, ResearchSource } from '../../api/contract'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Contact } from '../../data/types'
import { AiNotConfigured, Banner, Btn, Chip, Ck, Empty, Fld, Inp, Modal, Skel, Spinner } from '../../kit'
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
  const live = useRef<AbortController | null>(null)
  const verified = ct.verification === 'Verified'
  const notConfigured = aiNotConfigured('xai')
  const capped = left === 0

  // Allowance only; this never starts a lookup (the usage endpoint is free). Refreshed on every open so a stale
  // "0 left" or a month rollover never sticks; skipped only when the server has no key.
  useEffect(() => {
    if (!b || notConfigured) return
    const ac = new AbortController()
    void enrichUsage(b, ac.signal)
    return () => ac.abort()
  }, [b, notConfigured])

  // Leaving the modal stops waiting. It cannot recall a request the server has already started.
  useEffect(() => () => live.current?.abort(), [])

  const run = async (): Promise<void> => {
    if (!b || busy) return
    const h = checkLinkedinHint(hint)
    if (!h.ok) return setHintErr(h.error)
    setHintErr('')
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
  }

  const apply = (): void => {
    if (!b || !chosen.length) return
    Act.applyEnrichment(ct.id, chosen, b)
    UI.close()
    UI.toast('Enriched ' + ct.name + ': ' + chosen.length + ' field(s) updated')
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
      <div className="row">
        <Btn kind="pri" icon="zap" disabled={!b || notConfigured || capped || busy} onClick={() => void run()}>
          Find contact details
        </Btn>
        {allowance && <span className="sm muted">{allowance}</span>}
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
          : chosen.length || rows.length ? <><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" disabled={!chosen.length} onClick={apply}>Apply selected{chosen.length ? ` (${chosen.length})` : ''}</Btn></>
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
                              <Chip tone={s.kind === 'published' ? 'ok' : 'warn'}>{s.kind === 'published' ? 'Published' : 'Inferred'}</Chip>
                              {unchanged && <span className="faint">Already set</span>}
                              {s.personal && <span className="faint">may be a personal number — check</span>}
                              {s.kind === 'inferred' && <span className="faint">guessed from the {s.pattern ?? 'company'} address pattern</span>}
                              {s.sourceUrl !== undefined && <SourceLink url={s.sourceUrl} />}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {rows.some(r => r.kind === 'inferred') && (
                  <Banner tone="warn">Inferred emails are guesses, so they start unticked. Applying one marks the contact <b>Inferred</b>, and it is not used for outreach until a person verifies it.</Banner>
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
