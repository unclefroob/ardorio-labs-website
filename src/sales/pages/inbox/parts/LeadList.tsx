import { useEffect, useRef, useState } from 'react'
import { findLeads, isFailure, type LeadListOutcome } from '../../../ai/client'
import type { BusinessId, LeadCandidate } from '../../../api/contract'
import { Act } from '../../../data/Act'
import { Q } from '../../../data/Q'
import { flushAll } from '../../../data/sync'
import { S, useStore } from '../../../data/store'
import { AiNotConfigured, Banner, Btn, Card, Chip, Ck, Empty, Fld, Sel, Skel, Spinner, TA } from '../../../kit'
import { FailureBanner, Sources } from '../../../modals/comms/Enrich'
import { BizSel } from '../../../shared/forms'
import { domOf, INDUSTRIES, norm, STATES } from '../../../shared/constants'
import { Src } from '../../../shared/IntelBits'
import { useLookups } from '../../../shared/useLookups'
import { normaliseUrl } from '../../../shared/url'
import { UI } from '../../../ui/store'

export const QUERY_MIN = 10
export const QUERY_MAX = 300

const keyOf = (l: LeadCandidate): string => norm(l.name) + '|' + domOf(l.website)

/** A company already in the CRM, found now rather than when the search ran. */
function existing(l: LeadCandidate): string | undefined {
  if (l.companyId && Q.company(l.companyId)) return l.companyId
  const dom = domOf(l.website)
  return S.companies.find(c => !c.archived && (norm(c.name) === norm(l.name) || (!!dom && !!c.domain && domOf(c.domain) === dom)))?.id
}

export function LeadList() {
  useStore()
  const [query, setQuery] = useState('')
  const [state, setState] = useState('')
  const [bid, setBid] = useState<BusinessId | ''>(Q.defaultBiz() ?? '')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<LeadListOutcome | null>(null)
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [imported, setImported] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const live = useRef<AbortController | null>(null)
  const lk = useLookups(bid || undefined)
  useEffect(() => () => live.current?.abort(), [])

  const q = query.trim()
  const qErr = q.length < QUERY_MIN ? `Describe the companies in at least ${QUERY_MIN} characters` : q.length > QUERY_MAX ? `Keep it to ${QUERY_MAX} characters or fewer` : ''
  const canRun = !!bid && Q.canEdit(bid) && !qErr && !busy && !lk.notConfigured && !lk.capped

  const run = async (): Promise<void> => {
    setTouched(true)
    if (!canRun || !bid) return
    const ac = new AbortController()
    live.current = ac
    setBusy(true)
    setOut(null)
    setPick({})
    setImported({})
    setNotes({})
    const o = await findLeads(bid, q, { state, signal: ac.signal })
    if (live.current !== ac) return
    live.current = null
    setBusy(false)
    setOut(o)
  }
  const cancel = (): void => {
    live.current?.abort()
    live.current = null
    setBusy(false)
    setOut({ status: 'cancelled' })
  }

  const done = out && !isFailure(out) ? out : null
  const leads = done?.items ?? []
  const importable = leads.filter(l => !existing(l) && !imported[keyOf(l)])
  const chosen = importable.filter(l => pick[keyOf(l)])

  const importRows = async (rows: LeadCandidate[]): Promise<void> => {
    if (!bid || importing || !UI.guard(bid, 'Importing companies')) return
    setImporting(true)
    let ok = 0
    for (const l of rows) {
      const k = keyOf(l)
      if (existing(l)) continue
      const web = l.website ? normaliseUrl(l.website) : null
      const site = web && web.ok ? web.value : ''
      const industry = INDUSTRIES.find(i => norm(i) === norm(l.industry ?? '')) ?? ''
      const co = Act.createCompany({
        name: l.name, website: site, industry, state: STATES.find(s => s === (l.state ?? '').toUpperCase()) ?? '',
        businessId: bid, ownerId: Q.me().id, source: 'Lead list', description: l.why, notes: `Suggested by a lead list search: ${l.why} Source: ${l.sourceUrl}`,
      })
      // The server has the final say on a web address; a refusal rolls the company back.
      if (site && (await flushAll()) && !Q.company(co.id)) {
        setNotes(n => ({ ...n, [k]: 'The server did not accept this website, so nothing was added.' }))
        continue
      }
      if (l.website && !site) setNotes(n => ({ ...n, [k]: 'Added without a website: the address was not valid.' }))
      setImported(m => ({ ...m, [k]: co.id }))
      ok++
    }
    setImporting(false)
    if (ok) UI.toast(ok === 1 ? '1 company added' : `${ok} companies added`)
  }

  const form = (
    <form onSubmit={e => { e.preventDefault(); void run() }} className="col gap12">
      <Fld label="Describe the companies you want" req err={touched ? qErr : ''} hint={`${q.length}/${QUERY_MAX}. For example: independent cafes in Melbourne with 5 or more sites`}>
        <TA value={query} onChange={setQuery} rows={3} maxLength={QUERY_MAX + 50} aria-invalid={touched && qErr ? true : undefined} placeholder="e.g. multi-site retailers in Victoria that are hiring store managers" />
      </Fld>
      <div className="grid g2">
        <Fld label="State (optional)"><Sel value={state} onChange={setState} placeholder="Any state" options={STATES} /></Fld>
        <Fld label="Target business"><BizSel value={bid} onChange={v => setBid(Q.myBiz().find(b => b === v) ?? bid)} /></Fld>
      </div>
      <div className="row">
        {busy ? <Btn onClick={cancel}>Cancel search</Btn> : <Btn type="submit" kind="pri" icon="search" disabled={!bid || lk.notConfigured || lk.capped}>Find companies · 1 lookup</Btn>}
        {lk.label && !lk.notConfigured && <span className="sm muted">{lk.label}</span>}
      </div>
    </form>
  )

  return (
    <div className="col" style={{ gap: 14 }}>
      <Card title="Lead list from a description" icon="spark" right={<AiNotConfigured provider="xai" />}>
        {!bid && <Banner tone="warn">You need edit access to a business before you can build a lead list.</Banner>}
        <div className="muted sm" style={{ marginBottom: 12 }}>
          Searches the public web for companies that match your description. Each result links to the page it came from. Nothing is added to the CRM until you choose it.
        </div>
        {form}
      </Card>
      {lk.notConfigured && <FailureBanner o={{ status: 'notConfigured' }} onRetry={() => undefined} />}
      {lk.capped && lk.usage && !lk.notConfigured && <FailureBanner o={{ status: 'cap', usage: lk.usage }} onRetry={() => undefined} />}
      {busy && (
        <Card>
          <div className="col gap12" aria-busy="true" role="status" aria-live="polite">
            <div className="row"><Spinner />Searching the public web… this can take 30 to 60 seconds.</div>
            <Skel rows={5} />
            <div className="faint xs">Cancelling stops waiting, but a request already sent still counts against the allowance.</div>
          </div>
        </Card>
      )}
      {out && isFailure(out) && !busy && out.status !== 'notConfigured' && out.status !== 'cap' && <FailureBanner o={out} onRetry={() => void run()} />}
      {done && !busy && (
        <Card
          title={leads.length ? `${leads.length} ${leads.length === 1 ? 'company' : 'companies'} found` : 'Results'}
          right={leads.length > 0 && <Btn size="sm" kind="pri" icon="plus" disabled={!chosen.length || importing || !Q.canEdit(bid || '')} onClick={() => void importRows(chosen)}>Add {chosen.length || ''} selected</Btn>}
          pad={false}
        >
          {done.status === 'withheld' && <Empty icon="shield" title="Results withheld, no verifiable source" body={`Grok returned ${done.withheld} company name(s), but none could be tied to a page we could check, so none are shown. Nothing was made up.`} />}
          {done.status === 'none' && <Empty icon="search" title="No companies found" body="Nothing matched that description. Try describing the industry, size and place differently." />}
          {leads.map(l => {
            const k = keyOf(l)
            const inCrm = existing(l) ?? imported[k]
            return (
              <div key={k + l.sourceUrl} className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', alignItems: 'flex-start', gap: 10 }}>
                {inCrm ? <span style={{ width: 18 }} /> : <Ck checked={!!pick[k]} onChange={v => setPick(p => ({ ...p, [k]: v }))} label={'Select ' + l.name} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="b">{l.name}</div>
                  <div className="row wrap xs" style={{ gap: 8 }}>
                    {l.industry && <span className="muted">{l.industry}</span>}
                    {l.state && <span className="muted">{l.state}</span>}
                    {l.website && <Src url={/^https?:\/\//i.test(l.website) ? l.website : 'https://' + l.website} label={domOf(l.website) || l.website} />}
                  </div>
                  <div className="sm" style={{ marginTop: 3 }}>{l.why}</div>
                  <div className="row wrap xs" style={{ gap: 6, marginTop: 2 }}><span className="faint">Found on</span><Src url={l.sourceUrl} /></div>
                  {notes[k] && <div className="xs" style={{ color: 'var(--warn)', marginTop: 2 }} role="status">{notes[k]}</div>}
                </div>
                {inCrm ? (
                  <span className="row" style={{ gap: 6 }}>
                    <Chip tone="info">{imported[k] ? 'Added' : 'Already in CRM'}</Chip>
                    <Btn size="sm" kind="ghost" onClick={() => UI.nav('company', { id: inCrm })}>Open</Btn>
                  </span>
                ) : (
                  <Btn size="sm" icon="plus" disabled={importing || !Q.canEdit(bid || '')} onClick={() => void importRows([l])}>Add</Btn>
                )}
              </div>
            )
          })}
          <div style={{ padding: '10px 14px' }} className="col gap12">
            {done.withheld > 0 && done.status === 'found' && <div className="faint xs">{done.withheld} result(s) withheld, no verifiable source.</div>}
            <Sources sources={done.sources} />
            <div className="faint xs">Check each company before you contact it. {done.disclaimer}</div>
          </div>
        </Card>
      )}
    </div>
  )
}
