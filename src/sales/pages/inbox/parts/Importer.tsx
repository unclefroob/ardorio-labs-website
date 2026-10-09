import { useMemo, useRef, useState } from 'react'
import { Act, type ImportResult, type ImportRow } from '../../../data/Act'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { S, useStore } from '../../../data/store'
import type { BusinessId } from '../../../data/types'
import { Banner, BizDot, Btn, Card, Chip, Ck, Fld, Icon, Kpi, Sel, download } from '../../../kit'
import { BizSel, OwnerSel } from '../../../shared/forms'
import { useF } from '../../../shared/useF'
import { normaliseUrl } from '../../../shared/url'
import { UI } from '../../../ui/store'
import { MAPF, TEMPLATE_HEADER, isMapKey, mapLabel, parseCSV, type MapKey } from './csv'

type Parsed = ImportRow & { _row: number; _reason?: string }
type Behaviour = 'update' | 'link' | 'skip'

const MAX_BYTES = 5 * 1024 * 1024
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const cell = (v: string | undefined): string => (v ?? '').trim()

export function Importer() {
  const v = useStore()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [raw, setRaw] = useState<string[][] | null>(null)
  const [map, setMap] = useState<Record<number, MapKey | ''>>({})
  const [o, set] = useF<{ businessId: BusinessId | ''; ownerId: string; behaviour: Behaviour; listId: string }>({ businessId: Q.defaultBiz() ?? '', ownerId: Q.me().id, behaviour: 'update', listId: '' })
  const [done, setDone] = useState<{ res: ImportResult; bad: Parsed[] } | null>(null)
  const [skipInvalid, setSkip] = useState(true)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const readFile = (file: File | undefined): void => {
    if (!file) return
    if (file.size > MAX_BYTES) return setErr('That file is over 5 MB. Split it into smaller files and import them one at a time.')
    const r = new FileReader()
    r.onload = () => load(typeof r.result === 'string' ? r.result : '', file.name)
    r.onerror = () => setErr('The file could not be read.')
    r.readAsText(file)
  }

  const load = (txt: string, nm: string): void => {
    const r = parseCSV(txt)
    if (r.length < 2) return setErr('CSV invalid: it needs a header row and at least one data row.')
    setErr('')
    setName(nm)
    setRaw(r)
    const m: Record<number, MapKey | ''> = {}
    const used = new Set<string>()
    r[0].forEach((h, i) => {
      const hit = MAPF.find(([k, , rx]) => rx.test(h.trim()) && !used.has(k))
      m[i] = hit ? hit[0] : ''
      if (hit) used.add(hit[0])
    })
    setMap(m)
    setStep(2)
  }

  const rows = useMemo<Parsed[]>(() => {
    if (!raw) return []
    void v
    const byEmail = new Map<string, string>()
    const byLi = new Map<string, string>()
    const byNameCo = new Map<string, string>()
    for (const c of S.contacts) {
      if (c.email) byEmail.set(c.email.toLowerCase(), c.id)
      if (c.linkedin) byLi.set(c.linkedin.toLowerCase(), c.id)
      byNameCo.set(c.name.toLowerCase() + '|' + (Q.company(c.companyId)?.name ?? '').toLowerCase(), c.id)
    }
    return raw.slice(1).map((r, ri) => {
      const g: Partial<Record<MapKey, string>> = {}
      for (const [i, k] of Object.entries(map)) if (k) g[k] = cell(r[Number(i)])
      let first = g.firstName ?? ''
      let last = g.lastName ?? ''
      if (g.fullName && !first) {
        const p = g.fullName.split(/\s+/)
        first = p[0] ?? ''
        last = p.slice(1).join(' ')
      }
      const out: Parsed = {
        _row: ri + 2, firstName: first, lastName: last, company: g.company ?? '', title: g.title, email: g.email, phone: g.phone,
        linkedin: g.linkedin, location: g.location, website: g.website, industry: g.industry,
      }
      const errs: string[] = []
      const li = normaliseUrl(g.linkedin)
      if (li.ok) out.linkedin = li.value || undefined
      else errs.push('Invalid LinkedIn URL')
      const web = normaliseUrl(g.website)
      if (web.ok) out.website = web.value || undefined
      else errs.push('Invalid website')
      if (!first || !last) errs.push('Missing name')
      if (!out.company) errs.push('Missing company')
      if (out.email && !EMAIL.test(out.email)) errs.push('Invalid email')
      if (errs.length) {
        out._invalid = true
        out._reason = errs.join(', ')
      }
      const dup =
        (out.email && byEmail.get(out.email.toLowerCase())) ||
        (out.linkedin && byLi.get(out.linkedin.toLowerCase())) ||
        byNameCo.get(`${first} ${last}`.toLowerCase() + '|' + out.company.toLowerCase())
      if (dup) out._dup = dup
      return out
    })
  }, [raw, map, v])

  const inv = rows.filter(r => r._invalid)
  const dups = rows.filter(r => r._dup && !r._invalid)
  const nw = rows.filter(r => !r._dup && !r._invalid)
  const mapped = Object.values(map)
  const req = (['firstName', 'lastName', 'company'] as const).filter(k => !mapped.includes(k) && !(k !== 'company' && mapped.includes('fullName')))
  const bid = o.businessId
  const lists = S.lists.filter(l => l.type === 'static' && l.businessId === bid)
  const history = S.importJobs.filter(j => Q.inScope(j.businessId)).slice(0, 5)

  const run = (): void => {
    if (!bid || !UI.guard(bid, 'Importing')) return
    const r = Act.importRows(rows, { businessId: bid, ownerId: o.ownerId, behaviour: o.behaviour, listId: o.listId || undefined, fileName: name })
    setDone({ res: r, bad: inv })
    setStep(4)
  }

  const reset = (): void => {
    setStep(1)
    setRaw(null)
    setDone(null)
    setErr('')
  }

  if (!Q.anyEdit()) {
    return <Card><Banner tone="warn">You need edit access to a business before you can import leads.</Banner></Card>
  }

  return (
    <Card>
      {step === 1 && (
        <div className="col gap12" style={{ maxWidth: 640 }}>
          <div className="row"><b>1. Upload a CSV</b><span className="faint sm">such as a Wiza export</span></div>
          {err && <Banner tone="bad">{err}</Banner>}
          <div
            style={{ border: '2px dashed var(--line2)', borderRadius: 10, padding: 30, textAlign: 'center' }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]) }}
          >
            <Icon n="upload" s={22} style={{ color: 'var(--fg3)' }} />
            <div style={{ margin: '8px 0' }}>Drag a .csv here, or</div>
            <Btn icon="file" onClick={() => fileRef.current?.click()}>Browse files</Btn>
            <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="CSV file" style={{ display: 'none' }} onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="row"><Btn icon="download" onClick={() => download('salesos_leads_template.csv', TEMPLATE_HEADER + '\n')}>Download CSV template</Btn></div>
          <div className="faint xs">Supported columns: first/last/full name, company, job title, email, phone, LinkedIn URL, company website, location, industry. Common names are mapped automatically.</div>
          {history.length > 0 && (
            <div>
              <div className="b sm" style={{ marginTop: 8 }}>Import history</div>
              {history.map(j => (
                <div key={j.id} className="row sm" style={{ padding: '4px 0' }}>
                  <Icon n="file" s={13} />{j.name}<BizDot b={j.businessId} />
                  <span className="faint">{j.created} created · {j.updated} updated · {j.skipped} skipped</span>
                  <span className="sp" /><span className="faint xs">{F.rel(j.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {step === 2 && raw && (
        <div className="col gap12">
          <div className="row">
            <b>2. Preview &amp; map columns</b><span className="faint sm">{name} · {raw.length - 1} rows</span><span className="sp" />
            <Btn size="sm" onClick={reset}>Back</Btn>
            <Btn size="sm" kind="pri" disabled={req.length > 0} onClick={() => setStep(3)}>Continue</Btn>
          </div>
          {req.length > 0 && <Banner tone="warn">Map required fields: {req.map(mapLabel).join(', ')}</Banner>}
          <div className="tw" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            <table className="tbl">
              <thead>
                <tr>
                  {raw[0].map((h, i) => (
                    <th key={i} style={{ minWidth: 150 }}>
                      <div className="col" style={{ gap: 4, textTransform: 'none', letterSpacing: 0 }}>
                        <span>{h}</span>
                        <Sel className="sm" aria-label={'Map column ' + h} value={map[i] ?? ''} onChange={x => setMap({ ...map, [i]: isMapKey(x) ? x : '' })} placeholder="— Skip —" options={MAPF.map(m => [m[0], m[1]] as const)} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {raw.slice(1, 7).map((r, ri) => (
                  <tr key={ri}>{raw[0].map((_, ci) => <td key={ci} className="sm">{r[ci] || <span className="faint">—</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="col gap12">
          <div className="row"><b>3. Target, matching &amp; behaviour</b><span className="sp" /><Btn size="sm" onClick={() => setStep(2)}>Back</Btn></div>
          <div className="grid g4">
            <Fld label="Target business">
              <BizSel value={bid} onChange={x => { const b = Q.myBiz().find(y => y === x); if (b) set({ businessId: b, listId: '', ownerId: Q.usersIn(b).some(u => u.id === o.ownerId) ? o.ownerId : Q.me().id }) }} />
            </Fld>
            <Fld label="Owner"><OwnerSel b={bid} value={o.ownerId} onChange={x => set('ownerId', x)} /></Fld>
            <Fld label="Add to list (optional)"><Sel value={o.listId} onChange={x => set('listId', x)} placeholder="—" options={lists.map(l => [l.id, l.name] as const)} /></Fld>
            <Fld label="Existing contacts">
              <Sel value={o.behaviour} onChange={x => set('behaviour', x === 'link' ? 'link' : x === 'skip' ? 'skip' : 'update')} options={[['update', 'Update empty fields (keep verified data)'], ['link', 'Link only, no field changes'], ['skip', 'Skip duplicates']]} />
            </Fld>
          </div>
          <div className="grid g3">
            <Kpi label="New contacts" value={nw.length} tone="ok" />
            <Kpi label="Existing matches" value={dups.length} />
            <Kpi label="Invalid rows" value={inv.length} tone={inv.length ? 'bad2' : undefined} />
          </div>
          {dups.length > 0 && (
            <Card title="Duplicate review" pad={false}>
              <div className="tw">
                <table className="tbl">
                  <thead><tr><th>Row</th><th>Import</th><th>Matches existing</th><th>Action</th></tr></thead>
                  <tbody>
                    {dups.map(r => {
                      const c = Q.contact(r._dup)
                      if (!c) return null
                      return (
                        <tr key={r._row}>
                          <td>{r._row}</td>
                          <td>{r.firstName} {r.lastName} · {r.email || 'no email'}</td>
                          <td>
                            <b>{c.name}</b> <span className="faint">· {Q.company(c.companyId)?.name}</span>{' '}
                            {bid && Q.crel(c.id, bid) ? <Chip>Already in {Q.biz(bid)?.name}</Chip> : <Chip tone="info">Will link to {Q.biz(bid)?.name}</Chip>}
                          </td>
                          <td><Chip>{o.behaviour === 'update' ? 'Update' : o.behaviour === 'link' ? 'Link' : 'Skip'}</Chip></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {inv.length > 0 && (
            <Card title="Invalid rows" pad={false}>
              <div className="tw">
                <table className="tbl">
                  <tbody>
                    {inv.map(r => (
                      <tr key={r._row}>
                        <td>Row {r._row}</td>
                        <td>{[r.firstName, r.lastName, r.company].filter(Boolean).join(' · ') || '(empty)'}</td>
                        <td style={{ color: 'var(--bad2)' }}>{r._reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: 10 }}><Ck checked={skipInvalid} onChange={setSkip}>Skip invalid rows and import the valid ones</Ck></div>
            </Card>
          )}
          <div className="row">
            <Banner tone="info">Imported emails are not assumed permitted for outreach. Record a permission basis before sequencing.</Banner>
            <span className="sp" />
            <Btn kind="pri" icon="upload" disabled={(inv.length > 0 && !skipInvalid) || !bid || !Q.canEdit(bid) || nw.length + dups.length === 0} onClick={run}>
              Import {nw.length + dups.length} rows
            </Btn>
          </div>
        </div>
      )}
      {step === 4 && done && (
        <div className="col gap12">
          <Banner tone="ok"><b>Import complete.</b> {name}</Banner>
          <div className="grid g4">
            <Kpi label="Created" value={done.res.created} tone="ok" />
            <Kpi label="Updated" value={done.res.updated} />
            <Kpi label="Linked" value={done.res.linked} />
            <Kpi label="Skipped / rejected" value={done.res.skipped + done.res.rejected.length} tone={done.res.rejected.length ? 'bad2' : undefined} />
          </div>
          {done.bad.length > 0 && <div className="sm">Rejected rows: {done.bad.map(r => `row ${r._row} (${r._reason})`).join('; ')}</div>}
          <div className="row wrap">
            <Btn onClick={reset}>Import another file</Btn>
            <Btn kind="pri" onClick={() => UI.nav('contacts')}>View contacts</Btn>
            {o.listId && <Btn onClick={() => UI.nav('lists', { id: o.listId })}>Open list</Btn>}
            {done.res.ids.length > 0 && <Btn icon="zap" onClick={() => UI.open('enrich', { contactId: done.res.ids[0] })}>Enrich first contact</Btn>}
          </div>
        </div>
      )}
    </Card>
  )
}
