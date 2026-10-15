import { useMemo, useState } from 'react'
import { Act } from '../../data/Act'
import { cancelResearch, dropResearch, getResearch, researchBusiness, startResearch, useResearchVersion } from '../../ai/profileResearch'
import { aiNotConfigured } from '../../ai/client'
import { fmtReset } from '../../ai/enrichCache'
import type { CompanyProfileField, CompanyProfileItem } from '../../api/contract'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { Banner, Btn, Chip, Modal } from '../../kit'
import { PROFILE_LABEL, PROFILE_ORDER, currentOf, pick, presetOf, showValue, standing, type Preset } from '../../shared/companyProfile'
import { UI } from '../../ui/store'

const safe = (u: string): string | undefined => (/^https?:\/\//i.test(u) ? u : undefined)

// Review what research found for one company. Fields that are empty (or hold filler) start ticked, everything else starts unticked, and
// nothing is saved until Apply. Unticked suggestions are discarded when the dialog's result is dropped; Cancel keeps them for later.
export function CompanyResearch({ companyId }: { companyId?: string }) {
  useResearchVersion()
  const c = companyId ? Q.company(companyId) : undefined
  if (!companyId || !c) return <Modal title="Research" icon="spark" width={420} footer={<Btn onClick={UI.close}>Close</Btn>}><Banner tone="warn">That company was not found.</Banner></Modal>
  const b = researchBusiness(companyId)
  if (!b) return <Modal title={`Research ${c.name}`} icon="spark" width={460} footer={<Btn onClick={UI.close}>Close</Btn>}><Banner tone="warn">You need edit access to one of this company's businesses to research it.</Banner></Modal>
  const st = getResearch(companyId)

  if (!st || st.status === 'running') {
    return (
      <Modal title={`Research ${c.name}`} icon="spark" width={480} footer={<>{st ? <Btn onClick={() => { cancelResearch(companyId); UI.close() }}>Cancel research</Btn> : null}<Btn kind="pri" disabled={!!st || aiNotConfigured('xai')} onClick={() => void startResearch(companyId)}>Start research</Btn></>}>
        {aiNotConfigured('xai')
          ? <Banner tone="warn"><b>Research is not set up.</b> An admin adds the xAI key under Admin, Integrations.</Banner>
          : st
            ? <div role="status" className="row" style={{ gap: 10 }}><span className="spin" aria-hidden="true" />Researching {c.name}. This takes about a minute; you can close this and keep working.</div>
            : <div className="muted">Searches the web for basic facts about {c.name}. It uses one of this month's research lookups. You choose what to keep before anything is saved.</div>}
      </Modal>
    )
  }
  if (st.status === 'failed') {
    return (
      <Modal title={`Research ${c.name}`} icon="spark" width={480} footer={<><Btn onClick={UI.close}>Close</Btn>{st.kind === 'error' && <Btn kind="pri" onClick={() => void startResearch(companyId, { again: true })}>Try again</Btn>}</>}>
        <Banner tone={st.kind === 'cap' ? 'warn' : 'bad'}>
          {st.kind === 'cap' ? <><b>Monthly research limit reached.</b>{st.usage ? ` (${st.usage.used} of ${st.usage.limit}). Resets ${fmtReset(st.usage.resetsOn)}.` : ''}</>
            : st.kind === 'notConfigured' ? <><b>Research is not set up.</b> An admin adds the xAI key under Admin, Integrations.</>
            : <><b>Research failed for {c.name}.</b> Nothing was changed. {st.message}</>}
        </Banner>
      </Modal>
    )
  }
  if (st.status === 'nothing') {
    return (
      <Modal title={`Research ${c.name}`} icon="spark" width={480} footer={<><Btn onClick={() => { dropResearch(companyId); UI.close() }}>Close</Btn><Btn onClick={() => void startResearch(companyId, { again: true })}>Run again</Btn></>}>
        <Banner tone="info">Nothing was found that could be confirmed on a cited page. Nothing was changed.</Banner>
      </Modal>
    )
  }
  return <Review companyId={companyId} items={st.items} sources={st.sources} disclaimer={st.disclaimer} withheld={st.withheld} />
}

function Review({ companyId, items, sources, disclaimer, withheld }: { companyId: string; items: CompanyProfileItem[]; sources: Array<{ title: string; url: string }>; disclaimer: string; withheld: number }) {
  const c = Q.company(companyId)!
  const all = S.companies
  const rows = useMemo(() => PROFILE_ORDER.map(f => items.find(i => i.field === f)).filter((i): i is CompanyProfileItem => !!i), [items])
  const [ticked, setTicked] = useState<Set<CompanyProfileField>>(() => pick('gaps', c, rows, all))
  const preset = presetOf(c, rows, all, ticked)
  const use = (p: Preset): void => setTicked(pick(p, c, rows, all))
  const toggle = (f: CompanyProfileField): void => setTicked(cur => { const n = new Set(cur); if (n.has(f)) n.delete(f); else n.add(f); return n })

  const apply = (): void => {
    const picks = rows.filter(r => ticked.has(r.field))
    const n = Act.applyCompanyProfile(companyId, picks)
    dropResearch(companyId)
    UI.close()
    UI.toast(`Applied ${n} ${n === 1 ? 'field' : 'fields'} to ${c.name}`, 'ok')
  }

  return (
    <Modal
      title={`Research ${c.name}`} icon="spark" width={980}
      sub={<span>{c.domain || 'No website'} · Suggestions only. Nothing changes until you press Apply.</span>}
      footer={
        <>
          <span className="xs muted">Unticked suggestions are not saved. Cancel keeps these results until you leave SalesOS.</span><span className="sp" />
          <b className="xs">{ticked.size} of {rows.length} selected</b>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" disabled={ticked.size === 0} onClick={apply}>Apply {ticked.size} {ticked.size === 1 ? 'field' : 'fields'}</Btn>
        </>
      }
    >
      <div className="col gap12">
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="lbl">Select</span>
          <span className="seg" role="group" aria-label="Select suggestions">
            {([['gaps', 'Fill empty fields'], ['all', 'Everything new'], ['none', 'None']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={preset === k} className={preset === k ? 'on' : ''} onClick={() => use(k)}>{l}</button>)}
          </span>
          <span className="sp" /><span className="xs faint">Fields that already have data start unticked, so nothing is overwritten by accident.</span>
        </div>
        <div className="tw" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
          <table className="tbl" aria-label="Research suggestions">
            <thead><tr><th style={{ width: 32 }}><span className="sr-only">Apply</span></th><th style={{ width: 120 }}>Field</th><th>In the CRM now</th><th>Research found</th><th style={{ width: 190 }}>Source</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const s = standing(c, r, all)
                const cur = currentOf(c, r.field)
                const href = safe(r.sourceUrl)
                const same = s === 'same'
                return (
                  <tr key={r.field} className={ticked.has(r.field) ? 'sel' : undefined} style={same ? { color: 'var(--fg3)' } : undefined}>
                    <td>{same ? null : <input type="checkbox" aria-label={`Apply ${PROFILE_LABEL[r.field]}`} checked={ticked.has(r.field)} onChange={() => toggle(r.field)} style={{ accentColor: 'var(--acc)', width: 16, height: 16 }} />}</td>
                    <td className="b">{PROFILE_LABEL[r.field]}</td>
                    <td>{cur === null ? <span className="faint">Empty</span> : <span>{showValue(cur)}{s === 'filler' && <> <Chip tone="warn">Filler from import</Chip></>}</span>}</td>
                    <td style={{ fontWeight: same ? 400 : 500 }}>{same ? 'Same as the CRM' : <>{showValue(r.value)}{s === 'differs' && <> <Chip tone="warn">Differs from the CRM</Chip></>}</>}</td>
                    <td>
                      <Chip tone={r.sourceCheck === 'confirmed' ? 'ok' : undefined}>{r.sourceCheck === 'confirmed' ? 'Sourced · confirmed' : 'Sourced · page unchecked'}</Chip>
                      <div className="xs" style={{ marginTop: 4, overflowWrap: 'anywhere' }}>{href ? <a href={href} target="_blank" rel="noreferrer noopener">{href.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</a> : r.sourceUrl}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {withheld > 0 && <div className="xs faint">{withheld} {withheld === 1 ? 'suggestion was' : 'suggestions were'} dropped because the server could not tie {withheld === 1 ? 'it' : 'them'} to a cited page.</div>}
        <div className="xs faint">{disclaimer}</div>
        {sources.length > 0 && <div className="xs faint">Searched: {sources.slice(0, 5).map(s => safe(s.url) ? <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" style={{ marginRight: 8 }}>{s.title || s.url}</a> : null)}</div>}
      </div>
    </Modal>
  )
}
