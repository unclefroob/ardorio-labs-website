import { useState, type FC, type ReactNode } from 'react'
import { Act } from '../../../data/Act'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { S, useStore } from '../../../data/store'
import type { Research } from '../../../data/types'
import { providerName } from '../../../ai/client'
import type { AiProvider, ResearchIdentity } from '../../../api/contract'
import { Banner, Btn, Chip, Icon, ScoreRing, Sim } from '../../../kit'
import { employeesText, researchProfileOf } from '../../../shared/companyProfile'
import { ScoreWhy } from '../../../shared/IntelBits'
import { UI } from '../../../ui/store'
import { safeHref } from '../query'

export interface ResearchViewProps {
  r: Research
  onSave?: ReactNode
  /** Whether this result is stored as a research record. Leave unset to look it up. */
  saved?: boolean
  /** Called when the person says the research is about the wrong company. */
  onWrongCompany?: () => void
}

// Research is index-signature loose because it round-trips through the server as JSON; narrow each field here.
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const pairs = (v: unknown): Array<[string, string]> =>
  Array.isArray(v)
    ? v.flatMap((x): Array<[string, string]> => (Array.isArray(x) && x.length >= 2 ? [[String(x[0]), String(x[1])]] : []))
    : []
const sources = (v: unknown): Array<{ label: string; kind: string }> =>
  Array.isArray(v)
    ? v.flatMap((x): Array<{ label: string; kind: string }> => {
        if (typeof x !== 'object' || x === null) return []
        const o: Record<string, unknown> = { ...x }
        return [{ label: text(o.label), kind: text(o.kind) }]
      })
    : []

const providerOf = (v: unknown): AiProvider | null => (v === 'anthropic' || v === 'xai' ? v : null)

// The record is JSON that came back from the server, and its links originate on the web: only http(s) becomes an anchor.
const webSources = (v: unknown): Array<{ title: string; href: string; host: string }> =>
  Array.isArray(v)
    ? v.flatMap((x): Array<{ title: string; href: string; host: string }> => {
        if (typeof x !== 'object' || x === null) return []
        const o: Record<string, unknown> = { ...x }
        const href = safeHref(text(o.url))
        if (!href) return []
        let host = ''
        try {
          host = new URL(href).hostname
        } catch {
          return []
        }
        return [{ title: text(o.title) || host, href, host }]
      })
    : []

const EMPTY_FACT = /^[\s,.;:\-–—/|]*$|^(unknown|n\/a|none|not stated)$/i

/** A fact value worth showing: not blank, not just punctuation (a lone comma for an empty address), not "Unknown". */
export function cleanFact(v: string): string {
  const t = v.trim()
  return EMPTY_FACT.test(t) ? '' : t
}

const factLabel = (k: string): string => k.replace(/\s*\(CRM estimate\)/i, ' (estimate)').replace(/\s*\(CRM\)/i, '')

export function identityOf(v: unknown): (ResearchIdentity & { href: string; host: string }) | null {
  if (typeof v !== 'object' || v === null) return null
  const o: Record<string, unknown> = { ...v }
  const name = text(o.name).trim()
  if (!name) return null
  const raw = text(o.website).trim()
  const href = raw ? safeHref(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw) : undefined
  let host = ''
  if (href) {
    try {
      host = new URL(href).hostname
    } catch {
      host = ''
    }
  }
  return { name, note: text(o.note).trim(), ambiguous: o.ambiguous === true, website: raw || undefined, href: host ? href ?? '' : '', host }
}

/** Copies text, reporting the outcome with a toast. Clipboard access can be refused, so it never throws. */
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    UI.toast('Copied', 'ok')
    return true
  } catch {
    UI.toast("Couldn't copy. Select the text and copy it by hand.", 'bad')
    return false
  }
}

const SOURCE_PREVIEW = 5

function Items({ items }: { items: readonly string[] }) {
  return <ul className="rv-list">{items.map(x => <li key={x}>{x}</li>)}</ul>
}

export const ResearchView: FC<ResearchViewProps> = ({ r, onSave, saved, onWrongCompany }) => {
  useStore()
  const [modelOpen, setModelOpen] = useState(false)
  const [allSources, setAllSources] = useState(false)
  const [wrong, setWrong] = useState(false)
  const bn = Q.biz(r.businessId)?.name ?? ''
  const by = text(r.by) ? Q.user(text(r.by))?.name : undefined
  const base = typeof r.score === 'number' ? r.score : 0
  // Only a result tied to a CRM company can be moved by saved signals; an unmatched result keeps its own score.
  const bd = typeof r.score === 'number' && r.companyId ? Q.scoreBreakdown(r.companyId, r.businessId, base) : null
  const score = bd ? bd.total : base
  const srcs = sources(r.sources)
  const caveats = list(r.inferred)
  const provider = providerOf(r.provider)
  const web = webSources(r.webSources)
  const limited = r.limited === true
  const facts = pairs(r.facts).map(([k, v]): [string, string] => [factLabel(k), cleanFact(v)]).filter(([, v]) => v !== '')
  const lowConfidence = !limited && facts.length === 0
  const angle = text(r.angle)
  const found = researchProfileOf(r.profile)
  const model = text(r.model)
  const cid = r.companyId || ''
  const company = cid ? Q.company(cid) : undefined
  const canEdit = Q.canEdit(r.businessId)
  // The result on screen can be a copy of the stored record (Prospecting), so confirmation is read from the stored one.
  const stored = S.research.find(x => x.id === r.id)
  const persisted = saved ?? !!stored
  const contact = cid ? S.contacts.find(c => c.companyId === cid && !c.archived) : undefined
  const identity = identityOf(r.identity)
  const confirmedAt = text(stored?.identityConfirmedAt ?? r.identityConfirmedAt)
  const confirmedById = text(stored?.identityConfirmedBy ?? r.identityConfirmedBy)
  const confirmedBy = confirmedById ? Q.user(confirmedById)?.name : undefined
  const tag = provider ? <Chip tone="ai">AI inference</Chip> : null

  // What the search found that the company record lacks: the button only appears when it would fill something.
  const canFill = !!found && !!company && canEdit && (
    (!!found.headOffice && !(company.hq || '').trim() && !(company.state || '').trim()) ||
    (!!found.employees && company.employees === null)
  )
  const fill = (): void => {
    if (!found) return
    const n = Act.fillCompanyFromResearch(cid, { headOffice: found.headOffice, employees: found.employees })
    UI.toast(n ? 'Added to the company' : 'Nothing to add: the company already has these', n ? 'ok' : 'warn')
  }
  const edit = (): void => UI.open('editCompany', { id: cid })
  const findPeople = (): void => UI.open('findPeople', cid ? { companyId: cid, businessId: r.businessId } : { name: text(r.companyName), businessId: r.businessId })
  const addNote = (): void => {
    Act.addNote('company', cid, 'Outreach angle: ' + angle, r.businessId)
    UI.toast('Added to the company notes', 'ok')
  }
  const wrongCompany = (): void => {
    setWrong(true)
    onWrongCompany?.()
  }

  return (
    <div className="card rv">
      <div className="rv-h">
        <div className="rv-t"><Icon n="spark" s={14} />{bn} research · {text(r.companyName)}</div>
        <span className="sp" />
        <span className="xs faint">Generated {F.dt(r.ts)}{by ? ' by ' + by : ''}</span>
        {provider && (
          <Chip tone="ai" icon="spark" title={provider === 'xai' ? 'Written by Grok using live web and X search' : 'Written by Claude with no web access'}>
            {providerName(provider)}{text(r.providerModel) ? ` (${text(r.providerModel)})` : ''}
          </Chip>
        )}
        {r.simulated === true && <Sim />}
      </div>
      <div className="rv-body">
        <div className="rv-main">
          {limited && (
            <Banner tone="warn">
              {provider === 'xai'
                ? 'No CRM record matched, so there are no CRM facts or score. Everything here is public web research.'
                : 'Limited result: no CRM record matched. Generic sector content only.'}
            </Banner>
          )}

          {identity?.ambiguous && !confirmedAt && (
            <div data-testid="research-identity">
              <Banner
                tone="warn"
                action={(
                  <span className="row wrap" style={{ gap: 6 }}>
                    {persisted && canEdit && <Btn size="sm" kind="pri" onClick={() => Act.confirmResearchIdentity(r.id)}>Yes, this is it</Btn>}
                    <Btn size="sm" onClick={wrongCompany}>Wrong company</Btn>
                  </span>
                )}
              >
                <b>Is this the right company?</b>
                <div className="sm" style={{ marginTop: 2 }}>
                  {identity.name}{identity.note ? '. ' + identity.note : ''}
                  {identity.href && <> <a href={identity.href} target="_blank" rel="noopener noreferrer">{identity.host}</a></>}
                </div>
                {wrong && (
                  <div className="sm" style={{ marginTop: 6 }} role="status">
                    Add the company website, then research again.
                    {cid && canEdit && <> <Btn size="xs" icon="edit" onClick={edit}>Edit company</Btn></>}
                  </div>
                )}
              </Banner>
            </div>
          )}
          {identity?.ambiguous && confirmedAt && (
            <div className="row wrap sm" style={{ gap: 8 }} data-testid="research-identity">
              <Chip tone="ok" icon="check">Confirmed by {confirmedBy ?? 'a teammate'}, {F.dt(confirmedAt)}</Chip>
              <span className="faint">{identity.name}{identity.href && <> · <a href={identity.href} target="_blank" rel="noopener noreferrer">{identity.host}</a></>}</span>
            </div>
          )}
          {identity && !identity.ambiguous && (
            <div className="sm faint" data-testid="research-identity">
              Researched: {identity.name}{identity.href && <> · <a href={identity.href} target="_blank" rel="noopener noreferrer">{identity.host}</a></>}
            </div>
          )}

          <section aria-label="Summary">
            <div className="rv-eyebrow">Summary {tag}</div>
            <p className="rv-prose">{text(r.overview)}</p>
            <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
              <Chip>Size: {cleanFact(text(r.size)) || (found?.employees ? `${employeesText(found.employees)}${found.employees.basis === 'estimated' ? ' (estimate)' : ''}` : 'not stated')}</Chip>
              {found?.headOffice && <Chip>Head office: {found.headOffice}</Chip>}
              <Chip>Industry: {text(r.industry) || 'not stated'}</Chip>
              {model && (
                <button type="button" className="rv-link" style={{ marginLeft: 6 }} aria-expanded={modelOpen} onClick={() => setModelOpen(o => !o)}>
                  {modelOpen ? 'Hide business model ▴' : 'Show business model ▾'}
                </button>
              )}
            </div>
            {model && modelOpen && <p className="rv-prose muted" style={{ marginTop: 10 }}>{model}</p>}
          </section>

          {angle && (
            <section className="rv-angle" aria-label="Suggested outreach angle">
              <div className="rv-eyebrow">Suggested outreach angle {tag}</div>
              <p className="rv-prose">{angle}</p>
              <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                <Btn
                  size="sm"
                  kind="pri"
                  icon="mail"
                  disabled={!contact || !canEdit}
                  onClick={() => contact && UI.open('compose', { contactId: contact.id, businessId: r.businessId, body: angle })}
                >
                  Draft email with this angle
                </Btn>
                <Btn size="sm" icon="copy" onClick={() => void copyText(angle)}>Copy</Btn>
                {company && canEdit && <Btn size="sm" icon="note" onClick={addNote}>Add as note</Btn>}
                {!contact && <span className="xs faint">{cid ? 'Add a contact first' : 'Save the research as a company, then add a contact'}</span>}
              </div>
            </section>
          )}

          <div className="rv-fit">
            <div>
              <div className="rv-eyebrow">Potential challenges {provider ? <Chip tone="ai">Inferred</Chip> : null}</div>
              <Items items={list(r.challenges)} />
            </div>
            <div>
              <div className="rv-eyebrow">Relevant {bn} offerings {tag}</div>
              <Items items={list(r.offerings)} />
            </div>
            <div>
              <div className="row" style={{ marginBottom: 6 }}>
                <div className="rv-eyebrow" style={{ margin: 0 }}>Who to talk to {tag}</div>
                <span className="sp" />
                <Btn size="xs" icon="search" disabled={!canEdit} onClick={findPeople}>Find people</Btn>
              </div>
              <Items items={list(r.stakeholders)} />
            </div>
          </div>

          {(onSave || saved) && (
            <div className="row">
              <span className="sp" />
              {saved ? <Chip tone="ok" icon="check">Saved to CRM</Chip> : onSave}
            </div>
          )}
        </div>

        <aside className="rv-side" aria-label="Score, facts and sources">
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="card-b">
              {limited ? (
                <>
                  <div className="b">Not scored yet</div>
                  <div className="sm muted" style={{ marginTop: 6 }}>Scoring needs a CRM record. Save the research as a company and it gets a score from its facts.</div>
                </>
              ) : (
                <>
                  <div className="row" style={{ gap: 14 }}>
                    <ScoreRing v={score} s={64} />
                    <div>
                      <div className="b">Opportunity score</div>
                      {lowConfidence && <Chip tone="warn" style={{ marginTop: 4 }}>Low confidence</Chip>}
                    </div>
                  </div>
                  {lowConfidence && (
                    <>
                      <div className="sm muted" style={{ marginTop: 10 }}>This is the starting score. The CRM record has no industry, size or locations, so nothing could raise it.</div>
                      {company && canEdit && <Btn size="sm" style={{ marginTop: 10 }} onClick={edit}>Add facts to the company</Btn>}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          {bd && cid && (bd.parts.length > 0 || bd.pending.length > 0) && (
            <div className="card card-b" data-testid="research-signal-adjust">
              <ScoreWhy bd={bd} companyId={cid} b={r.businessId} />
            </div>
          )}

          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="card-h"><h3>Facts</h3><Chip>From your CRM</Chip></div>
            <div className="card-b">
              {limited ? (
                <div className="sm muted">No CRM record, so there are no facts to show.</div>
              ) : facts.length > 0 ? (
                <dl className="dl" style={{ gridTemplateColumns: '120px minmax(0,1fr)' }}>
                  {facts.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              ) : (
                <>
                  <div className="sm muted">Nothing recorded yet: no industry, headquarters, employees or locations.</div>
                  {company && canEdit && <Btn size="sm" style={{ marginTop: 10 }} onClick={edit}>Edit company</Btn>}
                </>
              )}
            </div>
          </div>

          {found && (
            <div className="card" style={{ boxShadow: 'none' }} data-testid="research-found">
              <div className="card-h"><h3>Found by search</h3>{provider && <Chip tone="ai">AI</Chip>}</div>
              <div className="card-b">
                <dl className="dl" style={{ gridTemplateColumns: '120px minmax(0,1fr)' }}>
                  {found.headOffice && <div style={{ display: 'contents' }}><dt>Head office</dt><dd>{found.headOffice}</dd></div>}
                  {found.employees && (
                    <div style={{ display: 'contents' }}>
                      <dt>{found.employees.basis === 'estimated' ? 'Employees (estimate)' : 'Employees'}</dt>
                      <dd>{employeesText(found.employees)}{found.employees.note ? <div className="xs faint">{found.employees.note}</div> : null}</dd>
                    </div>
                  )}
                </dl>
                {canFill && <Btn size="sm" icon="check" style={{ marginTop: 10 }} onClick={fill}>Fill empty company fields</Btn>}
              </div>
            </div>
          )}

          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="card-h"><h3>Sources</h3>{web.length > 0 && <Chip>{web.length} web</Chip>}</div>
            <div className="card-b">
              {web.length > 0 && !allSources && (
                <div className="row wrap" style={{ gap: 6 }}>
                  {web.slice(0, SOURCE_PREVIEW).map((s, i) => (
                    <a key={s.href} className="chip" href={s.href} target="_blank" rel="noopener noreferrer" title={s.title}>{i + 1} · {s.host}</a>
                  ))}
                  {web.length > SOURCE_PREVIEW && (
                    <button type="button" className="rv-link" aria-expanded={false} onClick={() => setAllSources(true)}>Show all {web.length} ▾</button>
                  )}
                </div>
              )}
              {web.length > 0 && allSources && (
                <div>
                  {web.map((s, i) => (
                    <div key={s.href} className="rv-src">
                      <span className="n">{i + 1}</span>
                      <div className="tt"><a href={s.href} target="_blank" rel="noopener noreferrer" title={s.title}>{s.title}</a><div className="xs faint">{s.host}</div></div>
                    </div>
                  ))}
                  <button type="button" className="rv-link" style={{ marginTop: 8 }} aria-expanded={true} onClick={() => setAllSources(false)}>Show fewer ▴</button>
                </div>
              )}
              {provider === 'xai' && web.length === 0 && <div className="xs faint">Search returned no linked sources, so treat every claim as unverified.</div>}
              {srcs.length > 0 && <div className="xs faint" style={{ marginTop: web.length ? 10 : 0 }}>Also used: {srcs.map(s => s.label).filter(Boolean).join(', ')}</div>}
              {provider && (
                <div className="xs faint" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                  The summary, challenges, offerings, roles and angle are AI inference. Only “Facts” comes from your records.
                </div>
              )}
              {caveats.map(x => <div key={x} className="xs faint" style={{ marginTop: 6 }}>⚠ {x}</div>)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
