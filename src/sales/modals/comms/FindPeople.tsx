import { useEffect, useRef, useState } from 'react'
import { aiNotConfigured, enrichUsage, findPeople, isFailure, type FindDone, type FindOutcome } from '../../ai/client'
import { remaining, useEnrichUsage } from '../../ai/enrichCache'
import type { BusinessId, FoundPerson } from '../../api/contract'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Contact } from '../../data/types'
import { AiNotConfigured, Banner, Btn, Chip, Empty, Fld, Inp, Modal, Skel, Spinner } from '../../kit'
import { isHttpUrl } from '../../shared/url'
import { UI } from '../../ui/store'
import { NoEditModal } from '../entities/guards'
import { FailureBanner, hostOf, Sources, SourceLink } from './Enrich'

export interface FindPeopleProps {
  /** A saved company. */
  companyId?: string
  /** Business to bill; defaults to one the user can edit that the company belongs to. */
  businessId?: BusinessId
  /** Research on a company that isn't saved yet: searched by name and website, and candidates can't be added until it is saved. */
  name?: string
  website?: string
}

const fold = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** linkedin.com/in/<slug> in lower case, with scheme, subdomain, query and trailing slash removed. '' when it isn't a profile link. */
export function linkedinKey(u: string | null | undefined): string {
  const m = (u ?? '').trim().match(/linkedin\.com\/in\/([^/?#\s]+)/i)
  if (!m) return ''
  try {
    return decodeURIComponent(m[1]).toLowerCase()
  } catch {
    return m[1].toLowerCase()   // malformed escape (e.g. '%E0%A4%A'): keep the raw slug rather than throw during render
  }
}

/**
 * The existing contact a found person would duplicate, if any. LinkedIn profile and email match anywhere in the
 * CRM (a contact exists once across the portfolio); a name match counts only inside the same company.
 */
export function findExisting(
  p: { firstName: string; lastName: string; email?: string; linkedin?: string },
  companyId: string | undefined,
  contacts: readonly Contact[],
): Contact | undefined {
  const li = linkedinKey(p.linkedin)
  const email = (p.email ?? '').trim().toLowerCase()
  const name = fold(p.firstName) + '|' + fold(p.lastName)
  return contacts.find(c => {
    if (c.archived) return false
    if (li && linkedinKey(c.linkedin) === li) return true
    if (email && [c.email, c.email2].some(e => typeof e === 'string' && e.trim().toLowerCase() === email)) return true
    return !!companyId && c.companyId === companyId && fold(c.firstName) + '|' + fold(c.lastName) === name
  })
}

export function FindPeople(props: FindPeopleProps) {
  const co = props.companyId ? Q.company(props.companyId) : undefined
  const rels = co ? Q.relsOf(co.id).map(r => r.businessId) : []
  const b = [props.businessId, ...rels, Q.defaultBiz()].find((x): x is BusinessId => !!x && Q.canEdit(x))
  if (!b) return <NoEditModal title="Find contacts" what="find contacts" />
  if (!co && !props.name?.trim()) return <NoEditModal title="Find contacts" what="find contacts without a company" />
  return <FindFlow b={b} companyId={co?.id} name={co?.name ?? props.name?.trim() ?? ''} website={co?.website ?? props.website} />
}

function FindFlow({ b, companyId, name, website }: { b: BusinessId; companyId?: string; name: string; website?: string }) {
  useStore()
  const usage = useEnrichUsage(b)
  const left = remaining(usage)
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<FindOutcome | null>(null)
  const live = useRef<AbortController | null>(null)
  const notConfigured = aiNotConfigured('xai')
  const capped = left === 0

  useEffect(() => {
    if (notConfigured) return   // refreshed on every open; the usage endpoint is free
    const ac = new AbortController()
    void enrichUsage(b, ac.signal)
    return () => ac.abort()
  }, [b, notConfigured])
  useEffect(() => () => live.current?.abort(), [])

  const run = async (): Promise<void> => {
    if (busy) return
    const ac = new AbortController()
    live.current = ac
    setBusy(true)
    setOut(null)
    const target = companyId ? { companyId } : { input: { name, ...(website ? { website } : {}) } }
    const o = await findPeople(target, b, { role, signal: ac.signal })
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

  const add = (p: FoundPerson): void => {
    if (!companyId || !UI.guard(b, 'Adding contacts')) return
    const li = isHttpUrl(p.linkedin ?? '') ? linkedinKey(p.linkedin) : ''
    const c = Act.createContact({
      firstName: p.firstName, lastName: p.lastName, title: p.title, companyId, businessId: b, ownerId: Q.me().id,
      linkedin: li ? `https://www.linkedin.com/in/${li}` : '',
      source: isHttpUrl(p.sourceUrl) ? `Grok · ${hostOf(p.sourceUrl)}` : 'Grok',
    })
    UI.toast(c.name + ' added as an unverified contact', undefined, { label: 'Open', fn: () => UI.nav('contact', { id: c.id }) })
  }

  const done: FindDone | null = out && (out.status === 'found' || out.status === 'none' || out.status === 'withheld') ? out : null
  const allowance = usage ? `${left} of ${usage.limit} left` : null

  const form = (
    <div className="col gap12">
      <div className="muted sm">
        Searches public web and X sources for people at {name} in a business role. Names, titles and the page each was found on are returned; no emails or phone numbers. Each search uses one of the business's monthly lookups.
      </div>
      <Fld label="Role (optional)" hint="For example: Head of Operations, People & Culture, IT">
        <Inp value={role} maxLength={120} onChange={setRole} placeholder="Any decision-maker" autoFocus />
      </Fld>
      <div className="row">
        <Btn kind="pri" icon="search" disabled={notConfigured || capped || busy} onClick={() => void run()}>Find people</Btn>
        {allowance && <span className="sm muted">{allowance}</span>}
      </div>
    </div>
  )

  return (
    <Modal
      title={'Find people at ' + name}
      icon="users"
      width={680}
      sub={<span className="row" style={{ gap: 6 }}><AiNotConfigured provider="xai" />{!notConfigured && allowance && <Chip>{allowance}</Chip>}</span>}
      footer={busy ? <Btn onClick={cancel}>Cancel search</Btn> : <Btn onClick={UI.close}>Close</Btn>}
    >
      {busy ? (
        <div className="col gap12" style={{ padding: '10px 0' }} aria-busy="true">
          <div className="row"><Spinner />Searching public sources for people at {name}… this can take 30–60 s.</div>
          <Skel rows={4} />
          <div className="faint xs">Cancelling stops waiting, but a request already sent still counts against the allowance.</div>
        </div>
      ) : notConfigured ? (
        <FailureBanner o={{ status: 'notConfigured' }} onRetry={() => void run()} />
      ) : done ? (
        <div className="col gap12">
          {!companyId && <Banner tone="info">Save this company first to add these people as contacts.</Banner>}
          {done.status === 'withheld' && (
            <Empty icon="shield" title="Results withheld — no verifiable source" body={`Grok returned ${done.withheld} name(s), but none could be tied to a source we could check, so none are shown. Nothing was made up.`} />
          )}
          {done.status === 'none' && <Empty icon="search" title="No people found" body="Nothing business-related was published for that role at this organisation. Try a broader role." />}
          {done.status === 'found' && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
              {done.people.map(p => <PersonRow key={p.firstName + p.lastName + p.sourceUrl} p={p} companyId={companyId} onAdd={() => add(p)} />)}
            </div>
          )}
          {done.withheld > 0 && done.status === 'found' && <div className="faint xs">{done.withheld} name(s) withheld — no verifiable source.</div>}
          <Sources sources={done.sources} />
          <div className="faint xs">Matched on name + company; verify identity before relying on these. {done.disclaimer}</div>
          <div className="row">
            <Btn size="sm" disabled={capped} onClick={() => void run()}>Search again (uses 1 lookup)</Btn>
            {allowance && <span className="sm muted">{allowance}</span>}
          </div>
        </div>
      ) : out && isFailure(out) ? (
        <div className="col gap12">
          <FailureBanner o={out} onRetry={() => void run()} />
          {out.status !== 'cap' && form}
        </div>
      ) : capped && usage ? (
        <FailureBanner o={{ status: 'cap', usage }} onRetry={() => void run()} />
      ) : form}
    </Modal>
  )
}

function PersonRow({ p, companyId, onAdd }: { p: FoundPerson; companyId?: string; onAdd: () => void }) {
  const existing = findExisting(p, companyId, S.contacts)
  return (
    <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="b">{p.firstName} {p.lastName}</div>
        <div className="sm muted">{p.title || 'Title not found'}</div>
        <div className="row wrap xs" style={{ gap: 8, marginTop: 2 }}>
          <span className="faint">Found on</span><SourceLink url={p.sourceUrl} />
          {p.linkedin && isHttpUrl(p.linkedin) && <SourceLink url={p.linkedin} label="LinkedIn" />}
        </div>
      </div>
      {existing ? (
        <Btn size="sm" kind="ghost" onClick={() => { UI.close(); UI.nav('contact', { id: existing.id }) }}>
          <Chip tone="info">Already in CRM</Chip>
        </Btn>
      ) : (
        <Btn size="sm" icon="plus" disabled={!companyId} onClick={onAdd}>Add as contact</Btn>
      )}
    </div>
  )
}
