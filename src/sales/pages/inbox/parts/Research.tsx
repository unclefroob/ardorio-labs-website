import { useRef, useState } from 'react'
import { SalesHttpError } from '../../../api/http'
import { research as aiResearch, type AiTag } from '../../../ai/client'
import { Act } from '../../../data/Act'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { flushAll } from '../../../data/sync'
import { S, useStore } from '../../../data/store'
import type { BusinessId, Research as ResearchRec } from '../../../data/types'
import { AiBadge, AiNotConfigured, Banner, BizDot, Btn, Card, Chip, Empty, Fld, Inp, Sel, Skel, Spinner } from '../../../kit'
import { BizSel } from '../../../shared/forms'
import { similarCompanies } from '../../../shared/companyMatch'
import { INDUSTRIES, domOf, norm } from '../../../shared/constants'
import { useF } from '../../../shared/useF'
import { normaliseUrl, WEBSITE_URL_MESSAGE } from '../../../shared/url'
import { UI } from '../../../ui/store'
import { ResearchView } from '../../companies/parts/ResearchView'
import { str } from './util'

const isErr = (v: ResearchRec | { error: string }): v is { error: string } => 'error' in v && typeof v.error === 'string'

interface Form { name: string; website: string; industry: string; businessId: BusinessId | '' }

export function Research() {
  useStore()
  const [f, set] = useF<Form>({ name: '', website: '', industry: '', businessId: Q.defaultBiz() ?? '' })
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ r: ResearchRec; ai: AiTag } | null>(null)
  const [savedCid, setSavedCid] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [webErr, setWebErr] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const seq = useRef(0)

  const name = f.name.trim()
  const exact = name.length > 2
    ? S.companies.find(c => !c.archived && (norm(c.name) === norm(name) || (!!f.website && !!c.domain && domOf(f.website) === domOf(c.domain))))
    : undefined
  // A close-but-not-exact CRM name is only offered; it applies when the rep clicks it, since a wrong match attaches another company's facts.
  const similar = name.length > 2 && !exact ? similarCompanies(name, f.website, S.companies) : []
  const match = exact ?? S.companies.find(c => c.id === picked && !c.archived)
  const bid = f.businessId
  const recent = S.research.filter(r => Q.inScope(r.businessId)).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 8)

  const go = async (): Promise<void> => {
    setErr('')
    setWebErr('')
    if (name.length < 3) return setErr('Enter a company name (3+ characters)')
    const web = normaliseUrl(f.website)
    if (!web.ok) return setWebErr(WEBSITE_URL_MESSAGE)
    if (!bid) return
    const n = ++seq.current
    setSavedCid(null)
    setRes(null)
    setBusy(true)
    try {
      const out = await aiResearch(match?.id, bid, { name: f.name, website: web.value, industry: f.industry })
      if (n !== seq.current) return
      const val = out.value
      if (isErr(val)) setErr(val.error)
      else setRes({ r: val, ai: out.ai })
    } catch (e) {
      if (n !== seq.current) return
      if (e instanceof SalesHttpError && e.code === 'INVALID_URL') setWebErr(WEBSITE_URL_MESSAGE)
      else setErr(e instanceof Error ? e.message : 'Research failed')
    } finally {
      if (n === seq.current) setBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!res || !bid || !UI.guard(bid, 'Saving research')) return
    let cid = match?.id
    if (!cid) {
      const web = normaliseUrl(f.website)
      if (!web.ok) return setWebErr(WEBSITE_URL_MESSAGE)
      setWebErr('')
      cid = Act.createCompany({ name: f.name, website: web.value, industry: f.industry, businessId: bid, ownerId: Q.me().id, source: 'Prospecting research' }).id
      // The server has the final say on a web address. If it refuses the new company the save is
      // rolled back, so say so on the field rather than leaving a blank website and a "saved" banner.
      if (web.value && (await flushAll()) && !Q.company(cid)) return setWebErr(WEBSITE_URL_MESSAGE)
    } else if (!Q.rel(cid, bid)) Act.linkCompany(cid, bid)
    const cname = Q.company(cid)?.name ?? f.name
    Act.saveResearch({ ...res.r, companyId: cid, companyName: cname })
    setSavedCid(cid)
    const open = cid
    UI.toast('Research saved to ' + cname, undefined, { label: 'Open company', fn: () => UI.nav('company', { id: open }) })
  }

  const stakeholder = res && Array.isArray(res.r.stakeholders) ? str(res.r.stakeholders[0]) : ''

  return (
    <div className="split">
      <div className="col" style={{ gap: 14 }}>
        <Card title="Research a company" icon="spark" right={<><AiNotConfigured provider="xai" />{res && <AiBadge tag={res.ai} />}</>}>
          {!bid && <Banner tone="warn">You need edit access to a business before you can research a company.</Banner>}
          <form onSubmit={e => { e.preventDefault(); void go() }}>
            <div className="grid g2">
              <Fld label="Company name" req err={err}><Inp value={f.name} onChange={v => { set('name', v); setPicked(null) }} placeholder="e.g. Harbour Retail Group" /></Fld>
              <Fld label="Website" err={webErr}><Inp value={f.website} onChange={v => { set('website', v); setWebErr(''); setPicked(null) }} placeholder="company.com.au" aria-invalid={webErr ? true : undefined} /></Fld>
              <Fld label="Industry"><Sel value={f.industry} onChange={v => set('industry', v)} placeholder="Auto / unknown" options={INDUSTRIES} /></Fld>
              <Fld label="Target business"><BizSel value={f.businessId} onChange={v => set('businessId', Q.myBiz().find(b => b === v) ?? f.businessId)} /></Fld>
            </div>
            {!match && similar.length > 0 && (
              <div className="row wrap" role="group" aria-label="Possible CRM matches" style={{ marginTop: 12, gap: 8 }}>
                <span className="sm muted">No exact CRM match. Is it one of these?</span>
                {similar.map(c => <Btn key={c.id} size="sm" icon="building" onClick={() => setPicked(c.id)}>{c.name}</Btn>)}
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              {match && <Chip tone="info" icon="building">{exact ? 'Matches CRM record' : 'Using CRM record'}: {match.name}</Chip>}
              <span className="sp" />
              <Btn type="submit" kind="pri" icon="spark" disabled={busy || !bid}>{busy ? 'Researching…' : 'Research company'}</Btn>
            </div>
          </form>
        </Card>
        {busy && (
          <Card>
            <div className="row" style={{ marginBottom: 12 }}><Spinner />Compiling {Q.biz(bid)?.name ?? ''} research…</div>
            <Skel rows={6} />
          </Card>
        )}
        {res && !busy && (
          <ResearchView
            r={res.r}
            saved={!!savedCid}
            onSave={
              <>
                {match && <Btn onClick={() => UI.nav('company', { id: match.id })}>Open company</Btn>}
                <Btn kind="pri" icon="check" disabled={!!savedCid || !bid || !Q.canEdit(bid)} onClick={() => void save()}>{match ? 'Save research to company' : 'Create company & save research'}</Btn>
              </>
            }
          />
        )}
        {res && savedCid && (
          <Banner tone="ok" action={<span className="row" style={{ gap: 6 }}><Btn size="sm" icon="search" onClick={() => UI.open('findPeople', { companyId: savedCid, businessId: bid })}>Find people</Btn><Btn size="sm" icon="user" onClick={() => UI.open('newContact', { companyId: savedCid, businessId: bid })}>Add a contact</Btn></span>}>
            Saved.{stakeholder ? ` Next: find or add a relevant stakeholder (${stakeholder}).` : ' Next: find or add a relevant stakeholder.'}
          </Banner>
        )}
        {res && !savedCid && !busy && name.length >= 3 && (
          <Banner action={<Btn size="sm" icon="search" onClick={() => UI.open('findPeople', { name: f.name.trim(), website: f.website.trim() || undefined, businessId: bid || undefined })}>Find people</Btn>}>
            Next: find people at this company. Save the research first to add them as contacts.
          </Banner>
        )}
      </div>
      <Card title="Recent research" pad={false}>
        {recent.length ? recent.map(r => {
          const cid = r.companyId
          const body = (
            <>
              <span className="row" style={{ width: '100%' }}>
                <BizDot b={r.businessId} />
                <b className="sm trunc">{str(r.companyName)}</b>
                <span className="sp" />
                <span className="b sm num">{typeof r.score === 'number' ? r.score : ''}</span>
              </span>
              <span className="faint xs">{F.rel(r.ts)} · {Q.user(str(r.by))?.name ?? ''}</span>
            </>
          )
          return cid ? (
            <div key={r.id} className="th" style={{ padding: 0 }}>
              <button type="button" onClick={() => UI.nav('company', { id: cid, q: { tab: 'intel' } })} style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: '10px 14px', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>{body}</button>
            </div>
          ) : <div key={r.id} className="th" style={{ cursor: 'default' }}>{body}</div>
        }) : <Empty icon="spark" title="No research yet" body="Research a company and save it to see it here." />}
      </Card>
    </div>
  )
}
