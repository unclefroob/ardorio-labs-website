import { useMemo, useRef, useState } from 'react'
import { Act, type ImportResult } from '../../../data/Act'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { S, useStore } from '../../../data/store'
import type { BusinessId } from '../../../data/types'
import { Banner, BizDot, Btn, Card, Chip, Ck, Fld, Icon, Kpi, Sel, download } from '../../../kit'
import { PERM } from '../../../shared/constants'
import { OwnerSel } from '../../../shared/forms'
import { planImport, parseImportRows, unresolved, type Choices, type CompanyGroup } from '../../../shared/importPlan'
import { UI } from '../../../ui/store'
import { MAPF, TEMPLATE_HEADER, autoMap, filledCount, isFiller, mapLabel, parseCSV, type MapGroup, type MapKey } from './csv'

type Behaviour = 'update' | 'link' | 'skip'
type Filter = 'all' | 'new' | 'existing' | 'confirm'

const MAX_BYTES = 5 * 1024 * 1024
const STEPS = ['Upload', 'Map columns', 'Review', 'Done'] as const

// Import leads, four steps: businesses and file, columns, review, done. Nothing is written until Import on the Review step. Companies are grouped
// by website, matched to those already in the CRM, and each business picked gets its own relationship with every company and contact.
export function Importer() {
  const v = useStore()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [raw, setRaw] = useState<string[][] | null>(null)
  const [wiza, setWiza] = useState(false)
  const [map, setMap] = useState<Record<number, MapKey | ''>>({})
  const myBiz = Q.myBiz().filter(Q.canEdit)
  const [bizIds, setBizIds] = useState<BusinessId[]>(() => { const d = Q.defaultBiz(); return d && Q.canEdit(d) ? [d] : [] })
  const [owners, setOwners] = useState<Partial<Record<BusinessId, string>>>({})
  const [behaviour, setBehaviour] = useState<Behaviour>('update')
  const [listId, setListId] = useState('')
  const [permission, setPermission] = useState('')
  const [choices, setChoices] = useState<Choices>({})
  const [skipInvalid, setSkip] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [needle, setNeedle] = useState('')
  const [tried, setTried] = useState(false)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [tag, setTag] = useState('')
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
    const r = parseCSV(txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt)
    if (r.length < 2) return setErr('CSV invalid: it needs a header row and at least one data row.')
    setErr('')
    setName(nm)
    setRaw(r)
    const a = autoMap(r[0].map(h => h.trim()), r.slice(1))
    setMap(a.map)
    setWiza(a.wiza)
    setChoices({})
  }

  const toggleBiz = (b: BusinessId): void => setBizIds(cur => (cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b]))

  const headers = raw ? raw[0].map(h => h.trim()) : []
  const body = raw ? raw.slice(1) : []
  const colFor = (k: MapKey): number => Object.entries(map).find(([, x]) => x === k)?.[0] !== undefined ? Number(Object.entries(map).find(([, x]) => x === k)?.[0]) : -1
  const setField = (k: MapKey, col: number): void => {
    const next: Record<number, MapKey | ''> = {}
    for (const [i, x] of Object.entries(map)) next[Number(i)] = x === k ? '' : x
    if (col >= 0) next[col] = k
    setMap(next)
  }

  const rows = useMemo(() => (raw ? parseImportRows(raw, map) : []), [raw, map])
  const plan = useMemo(() => { void v; return planImport(rows, S.companies, S.contacts) }, [rows, v])
  const open = unresolved(plan, choices)
  const mapped = new Set(Object.values(map).filter(Boolean))
  const mappedCols = Object.values(map).filter(Boolean).length
  const emptyCols = headers.filter((_, i) => !filledCount(body, i)).length
  const unusedCols = headers.length - mappedCols - emptyCols
  const reqMissing = (['firstName', 'lastName', 'company'] as const).filter(k => !mapped.has(k) && !(k !== 'company' && mapped.has('fullName')))
  const fillerCol = headers.findIndex((h, i) => !map[i] && /description/i.test(h) && isFiller(body.map(r => (r[i] ?? '').trim()).filter(Boolean)))
  const lists = S.lists.filter(l => l.type === 'static' && bizIds.includes(l.businessId))
  const history = S.importJobs.filter(j => Q.inScope(j.businessId)).slice(0, 5)
  const sample = (k: MapKey): string => { const c = colFor(k); return c >= 0 ? (body[0]?.[c] ?? '').trim() : '' }

  const run = (): void => {
    if (!bizIds.length || !bizIds.every(b => UI.guard(b, 'Importing'))) return
    const t = 'Import: ' + name.replace(/\.csv$/i, '')
    const r = Act.importLeads(plan, choices, { businessIds: bizIds, owners, behaviour, listId: listId || undefined, fileName: name, tag: t, permission })
    setTag(t)
    setDone(r)
    setStep(4)
  }

  const reset = (): void => {
    setStep(1)
    setRaw(null)
    setDone(null)
    setErr('')
    setTried(false)
  }

  if (!Q.anyEdit()) return <Card><Banner tone="warn">You need edit access to a business before you can import leads.</Banner></Card>

  const stepper = (
    <ol className="steps" aria-label="Import steps">
      {STEPS.map((s, i) => <li key={s} aria-current={step === i + 1 ? 'step' : undefined} style={{ opacity: step === i + 1 ? 1 : 0.7 }}>{i + 1}. {s}</li>)}
    </ol>
  )

  const bizNames = bizIds.map(b => Q.biz(b)?.name ?? b)

  if (step === 1) {
    return (
      <div className="col gap12">
        {stepper}
        <Card title="1. Which businesses are these leads for?" right={<span className="faint sm">Pick one or more</span>}>
          <div className="col gap12">
            <div className="bizpick" role="group" aria-label="Businesses">
              {myBiz.map(b => (
                <label key={b} className={bizIds.includes(b) ? 'on' : ''}>
                  <input type="checkbox" checked={bizIds.includes(b)} onChange={() => toggleBiz(b)} />
                  <BizDot b={b} s={9} /><b>{Q.biz(b)?.name ?? b}</b>
                </label>
              ))}
            </div>
            <div className="faint sm">
              Companies and contacts stay in one shared CRM. The businesses you pick decide which prospecting lists and pipelines they can be used in. A person at several businesses keeps one profile, with one set of notes and activity. You can change the businesses after the import.
            </div>
            {tried && !bizIds.length && <div role="alert" style={{ color: 'var(--bad2)' }} className="sm b">Pick at least one business.</div>}
          </div>
        </Card>
        <Card title="2. Upload a CSV" right={<span className="faint sm">such as a Wiza export</span>}>
          <div className="col gap12" style={{ maxWidth: 680 }}>
            {err && <Banner tone="bad">{err}</Banner>}
            {raw ? (
              <>
                <div style={{ border: '1px solid var(--line2)', borderRadius: 10, padding: 18, textAlign: 'center', background: 'var(--ok-bg)' }}>
                  <div className="b" style={{ fontSize: 15 }}>{name}</div>
                  <div className="muted sm">{raw.length - 1} rows · {raw[0].length} columns</div>
                  <div style={{ marginTop: 8 }}><Btn size="sm" onClick={() => fileRef.current?.click()}>Replace file</Btn></div>
                </div>
                {wiza && <Banner tone="ok"><b>Wiza export detected.</b> Columns are matched automatically on the next step; you can change any of them.</Banner>}
              </>
            ) : (
              <div
                style={{ border: '2px dashed var(--line2)', borderRadius: 10, padding: 30, textAlign: 'center' }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]) }}
              >
                <Icon n="upload" s={22} style={{ color: 'var(--fg3)' }} />
                <div style={{ margin: '8px 0' }}>Drag a .csv here, or</div>
                <Btn icon="file" onClick={() => fileRef.current?.click()}>Browse files</Btn>
                <div className="faint xs" style={{ marginTop: 6 }}>Up to 5 MB</div>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="CSV file" style={{ display: 'none' }} onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }} />
            <div className="row"><Btn icon="download" size="sm" onClick={() => download('salesos_leads_template.csv', TEMPLATE_HEADER + '\n')}>Download CSV template</Btn></div>
          </div>
        </Card>
        {history.length > 0 && (
          <Card title="Import history">
            {history.map(j => (
              <div key={j.id} className="row sm" style={{ padding: '4px 0' }}>
                <Icon n="file" s={13} />{j.name}{(j.businessIds ?? [j.businessId]).map(b => <BizDot key={b} b={b} />)}
                <span className="faint">{j.created} created · {j.updated} updated · {j.skipped} skipped</span>
                <span className="sp" /><span className="faint xs">{F.rel(j.ts)}</span>
              </div>
            ))}
          </Card>
        )}
        <div className="row">
          <span className="sp" />
          <Btn kind="pri" disabled={!raw} onClick={() => { setTried(true); if (bizIds.length) setStep(2) }}>Continue to column mapping</Btn>
        </div>
      </div>
    )
  }

  if (step === 2 && raw) {
    const nonEmptyUnused = headers.map((h, i) => ({ h, i })).filter(({ h, i }) => !map[i] && filledCount(body, i) > 0 && h)
    const emptyOnes = headers.filter((_, i) => !filledCount(body, i))
    const group = (g: MapGroup, title: string) => {
      const keys = MAPF.filter(m => m[3] === g)
      const n = keys.filter(m => mapped.has(m[0])).length
      return (
        <Card title={<span className="row" style={{ gap: 8 }}>{title}<Chip tone={n ? 'ok' : undefined}>{n} matched</Chip></span>} pad={false}>
          <div className="mapgrid" role="group" aria-label={title + ' fields'}>
            <span className="faint xs b">SalesOS field</span><span className="faint xs b">CSV column</span><span className="faint xs b">Row 1</span>
            {keys.map(([k, label]) => {
              const col = colFor(k)
              const required = (k === 'firstName' || k === 'lastName' || k === 'company') && !(k !== 'company' && mapped.has('fullName'))
              return (
                <div key={k} style={{ display: 'contents' }}>
                  <label htmlFor={'map-' + k} className="sm">{label}{required && <span style={{ color: 'var(--bad2)' }}> *</span>}</label>
                  <Sel id={'map-' + k} className="sm" value={col >= 0 ? String(col) : ''} onChange={x => setField(k, x === '' ? -1 : Number(x))} placeholder={k === 'mobile' ? 'Not in this file (optional)' : '— none —'} options={headers.map((h, i) => [String(i), h || `Column ${i + 1}`] as const)} />
                  <span className="smp" title={sample(k)}>{sample(k) || <span className="faint">—</span>}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )
    }
    return (
      <div className="col gap12">
        {stepper}
        <div className="row wrap">
          <b>2. Match the columns</b><span className="faint sm">{name} · {raw.length - 1} rows · for</span>
          {bizIds.map(b => <Chip key={b}><BizDot b={b} s={8} /> {Q.biz(b)?.name}</Chip>)}
          <span className="sp" />
          <Btn size="sm" onClick={() => setStep(1)}>Back</Btn>
          <Btn size="sm" kind="pri" disabled={reqMissing.length > 0} onClick={() => setStep(3)}>Continue to review</Btn>
        </div>
        {wiza
          ? <Banner tone="ok"><b>Wiza export detected.</b> {mappedCols} of {headers.length} columns matched. {unusedCols} more have data but no field to go in, and {emptyCols} are empty.{reqMissing.length === 0 ? ' Required fields (first name, last name, company) are all mapped.' : ''}</Banner>
          : <Banner tone="info">{mappedCols} of {headers.length} columns matched by name. Check each one below and change any that are wrong.</Banner>}
        {reqMissing.length > 0 && <Banner tone="warn">Map the required fields: {reqMissing.map(mapLabel).join(', ')}</Banner>}
        <div className="g2" style={{ alignItems: 'start' }}>
          {group('contact', 'Contact')}
          {group('company', 'Company')}
        </div>
        {fillerCol >= 0 && (
          <Banner tone="warn" action={<Btn size="sm" onClick={() => setField('description', fillerCol)}>Use it anyway</Btn>}>
            <b>{headers[fillerCol]} looks like placeholder text</b> ({'"'}{(body[0]?.[fillerCol] ?? '').slice(0, 60)}{'"'}), identical on every row. It is left unmapped so it does not become the description of every company.
          </Banner>
        )}
        <div className="g2">
          <Card><details><summary className="b sm" style={{ cursor: 'pointer' }}>{nonEmptyUnused.length} columns have data but no matching field</summary><div className="faint xs mono" style={{ marginTop: 8 }}>{nonEmptyUnused.map(x => x.h).join(' · ') || 'None'}</div></details></Card>
          <Card><details><summary className="b sm" style={{ cursor: 'pointer' }}>{emptyOnes.length} empty columns</summary><div className="faint xs mono" style={{ marginTop: 8 }}>{emptyOnes.join(' · ') || 'None'}</div></details></Card>
        </div>
      </div>
    )
  }

  if (step === 3 && raw) {
    const groups = plan.groups.filter(g => {
      const k = g.match.kind
      if (filter === 'new' && k !== 'new') return false
      if (filter === 'existing' && k !== 'existing') return false
      if (filter === 'confirm' && k !== 'possible') return false
      return !needle || (g.name + ' ' + g.domain).toLowerCase().includes(needle.toLowerCase())
    })
    const nNew = plan.groups.filter(g => g.match.kind === 'new').length
    const nEx = plan.groups.filter(g => g.match.kind === 'existing').length
    const nPos = plan.groups.filter(g => g.match.kind === 'possible').length
    const blockedByInvalid = plan.invalid.length > 0 && !skipInvalid
    const canImport = plan.rows > 0 && open.length === 0 && !blockedByInvalid && bizIds.length > 0
    const matchCell = (g: CompanyGroup) => {
      const m = g.match
      if (m.kind === 'new') return <span className="row wrap" style={{ gap: 6 }}><Chip tone="ok">New company</Chip>{g.rows.length > 1 && <span className="xs muted">{g.rows.length} contacts attached</span>}</span>
      if (m.kind === 'existing') return <span className="row wrap" style={{ gap: 6 }}><Chip tone="info">Existing company</Chip><span className="xs muted">matched on {m.by}, contacts are added to {Q.company(m.companyId)?.name}</span></span>
      const c = choices[g.key]
      return (
        <div className="col" style={{ gap: 6 }}>
          <span className="row wrap" style={{ gap: 6 }}><Chip tone="warn">Possible match</Chip><span className="xs">{m.candidates.map(x => `"${x.name}"${x.domain ? ` (${x.domain})` : ''}`).join(', ')}</span></span>
          <div className="row wrap" style={{ gap: 6 }} role="group" aria-label={'Choose for ' + g.name}>
            {m.candidates.map(x => <Btn key={x.id} size="sm" kind={c === x.id ? 'pri' : undefined} aria-pressed={c === x.id} onClick={() => setChoices({ ...choices, [g.key]: x.id })}>Use {x.name}</Btn>)}
            <Btn size="sm" kind={c === 'new' ? 'pri' : undefined} aria-pressed={c === 'new'} onClick={() => setChoices({ ...choices, [g.key]: 'new' })}>Create new</Btn>
          </div>
        </div>
      )
    }
    return (
      <div className="col gap12">
        {stepper}
        <div className="row">
          <b>3. Review before importing</b><span className="faint sm">Nothing is saved until you press Import. Companies are matched on website first, then name.</span><span className="sp" />
          <Btn size="sm" onClick={() => setStep(2)}>Back</Btn>
        </div>
        <div className="grid g4">
          <Kpi label="Companies" value={plan.groups.length} sub={`${nNew} new · ${nEx} existing${nPos ? ` · ${nPos} to confirm` : ''}`} />
          <Kpi label="Contacts" value={plan.rows} sub={`${plan.contacts.new} new · ${plan.contacts.existing} already in the CRM${plan.contacts.repeated ? ` · ${plan.contacts.repeated} repeated in the file` : ''}`} />
          <Kpi label="Rows with problems" value={plan.invalid.length} tone={plan.invalid.length ? 'bad2' : undefined} sub={plan.invalid.length ? 'Listed below' : 'Missing names or bad emails are listed here'} />
          <Kpi label="Businesses" value={<span className="row wrap" style={{ gap: 6 }}>{bizNames.map((n, i) => <Chip key={n}><BizDot b={bizIds[i]} s={8} /> {n}</Chip>)}</span>} sub={<button type="button" className="btn ghost sm" onClick={() => setStep(1)}>Change</button>} />
        </div>
        <Card title="Settings for this import">
          <div className="col gap12">
            <div className="grid g4">
              {bizIds.map(b => <Fld key={b} label={`${Q.biz(b)?.name ?? b} owner`}><OwnerSel b={b} value={owners[b] ?? Q.me().id} onChange={x => setOwners({ ...owners, [b]: x })} /></Fld>)}
              <Fld label="Add contacts to a list (optional)"><Sel value={listId} onChange={setListId} placeholder="No list" options={lists.map(l => [l.id, l.name + (bizIds.length > 1 ? ` (${Q.biz(l.businessId)?.name})` : '')] as const)} /></Fld>
              <Fld label="Contacts that already exist">
                <Sel value={behaviour} onChange={x => setBehaviour(x === 'link' ? 'link' : x === 'skip' ? 'skip' : 'update')} options={[['update', 'Fill empty fields only'], ['link', 'Link only, no field changes'], ['skip', 'Skip them']]} />
              </Fld>
            </div>
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 300, flex: 'none' }}><Fld label="Permission to contact"><Sel value={permission} onChange={setPermission} placeholder="Not recorded" options={PERM} /></Fld></div>
              <div className="faint sm" style={{ paddingTop: 20 }}>Contacts import either way. Sequences stay blocked until a permission basis is recorded, here for the whole file or later for each contact.</div>
            </div>
          </div>
        </Card>
        <Card
          title="Companies in this file"
          pad={false}
          right={
            <span className="row" style={{ gap: 8 }}>
              <span className="seg" role="group" aria-label="Show companies">
                {([['all', `All ${plan.groups.length}`], ['new', `New ${nNew}`], ['existing', `Existing ${nEx}`], ...(nPos ? [['confirm', `To confirm ${nPos}`] as const] : [])] as ReadonlyArray<readonly [Filter, string]>).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </span>
              <input className="inp sm" style={{ width: 200 }} aria-label="Search companies" placeholder="Search companies" value={needle} onChange={e => setNeedle(e.target.value)} />
            </span>
          }
        >
          <div className="tw">
            <table className="tbl">
              <thead><tr><th>Company</th><th>Website</th><th>Contacts in this file</th><th>What happens</th></tr></thead>
              <tbody>
                {groups.slice(0, 50).map(g => (
                  <tr key={g.key}>
                    <td><b>{g.name}</b></td>
                    <td className="mono">{g.domain || <span className="faint">none</span>}</td>
                    <td>{g.rows.map(r => <div key={r._row}>{r.firstName} {r.lastName}{r.title && <span className="faint"> · {r.title}</span>}{r._dup && <Chip tone="info">Already in CRM</Chip>}{r._dupInFile && <Chip tone="warn">Repeated, skipped</Chip>}</div>)}</td>
                    <td>{matchCell(g)}</td>
                  </tr>
                ))}
                {groups.length === 0 && <tr><td colSpan={4} className="faint" style={{ textAlign: 'center', padding: 14 }}>No companies match.</td></tr>}
              </tbody>
            </table>
          </div>
          {groups.length > 50 && <div className="faint xs" style={{ padding: 10 }}>Showing 50 of {groups.length}. All of them are imported.</div>}
        </Card>
        {plan.invalid.length > 0 && (
          <Card title="Rows with problems" pad={false}>
            <div className="tw">
              <table className="tbl"><tbody>
                {plan.invalid.map(r => (
                  <tr key={r._row}><td>Row {r._row}</td><td>{[r.firstName, r.lastName, r.company].filter(Boolean).join(' · ') || '(empty)'}</td><td style={{ color: 'var(--bad2)' }}>{r._reason}</td></tr>
                ))}
              </tbody></table>
            </div>
            <div style={{ padding: 10 }}><Ck checked={skipInvalid} onChange={setSkip}>Skip these rows and import the valid ones</Ck></div>
          </Card>
        )}
        <Banner tone="info" icon="spark"><b>Company research is not run automatically.</b> After the import, open any company and press Research to see what was found and choose what to keep.</Banner>
        <div className="row">
          <Btn onClick={() => setStep(2)}>Back</Btn><span className="sp" />
          {open.length > 0 && <span className="sm b" style={{ color: 'var(--warn)' }} role="status">Choose for {open.map(g => g.name).slice(0, 2).join(', ')}{open.length > 2 ? ` and ${open.length - 2} more` : ''} first</span>}
          <Btn kind="pri" icon="upload" disabled={!canImport} onClick={run}>Import {plan.rows} contacts to {bizIds.length} {bizIds.length === 1 ? 'business' : 'businesses'}</Btn>
        </div>
      </div>
    )
  }

  if (step === 4 && done) {
    const cos = done.companyIds.map(id => Q.company(id)).filter((c): c is NonNullable<ReturnType<typeof Q.company>> => !!c)
    const filled = (f: (c: (typeof cos)[number]) => boolean): number => cos.filter(f).length
    const bar = (label: string, n: number, total: number) => (
      <div className="row" key={label}><span style={{ width: 110 }}>{label}</span><div className="prog" style={{ flex: 1 }}><i style={{ width: `${total ? (100 * n) / total : 0}%` }} /></div><span className="num xs" style={{ width: 54, textAlign: 'right', color: n === 0 ? 'var(--warn)' : undefined }}>{n}/{total}</span></div>
    )
    return (
      <div className="col gap12">
        {stepper}
        <Banner tone="ok"><b>{done.ids.length} contacts are ready to prospect.</b> They are in the shared CRM under {bizNames.join(' and ')}. Notes, tasks, outbound activity and sequences work on them now.</Banner>
        <div className="grid g4">
          <Kpi label="Companies created" value={done.companiesCreated} tone="ok" />
          <Kpi label="Existing companies reused" value={done.companiesReused} />
          <Kpi label="Contacts created" value={done.created} tone="ok" />
          <Kpi label="Skipped or rejected" value={done.skipped + done.rejected.length} tone={done.rejected.length ? 'bad2' : undefined} />
        </div>
        <div className="g2" style={{ alignItems: 'start' }}>
          <Card title="By business" pad={false}>
            <table className="tbl">
              <thead><tr><th>Business</th><th className="r">Companies</th><th className="r">Contacts</th></tr></thead>
              <tbody>{bizIds.map(b => <tr key={b}><td><span className="row" style={{ gap: 6 }}><BizDot b={b} s={9} />{Q.biz(b)?.name}</span></td><td className="r num">{cos.length}</td><td className="r num">{done.ids.length}</td></tr>)}</tbody>
            </table>
            <div className="faint sm" style={{ padding: 12 }}>One profile per company and contact. Each business sees the same notes and activity history.</div>
          </Card>
          <Card title="What the CSV filled in">
            <div className="col" style={{ gap: 10 }}>
              {bar('Website', filled(c => !!c.website), cos.length)}
              {bar('Industry', filled(c => !!c.industry), cos.length)}
              {bar('Employees', filled(c => c.employees != null), cos.length)}
              {bar('Location', filled(c => !!c.hq), cos.length)}
              {bar('Description', filled(c => !!c.description), cos.length)}
            </div>
          </Card>
        </div>
        {filled(c => !c.description) > 0 && (
          <Card>
            <div className="row" style={{ gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="b" style={{ fontSize: 15 }}>Fill the gaps when you want to</div>
                <div className="muted">{filled(c => !c.description)} of {cos.length} companies have no description. Open a company and press <b>Research</b>. You see what was found, with sources, and choose what to apply. Nothing is saved or researched automatically.</div>
              </div>
              <Btn icon="spark" onClick={() => UI.nav('companies', { q: { import: tag } })}>Research companies…</Btn>
            </div>
          </Card>
        )}
        {done.rejected.length > 0 && <div className="sm">Rejected rows: {done.rejected.map(r => `row ${r._row} (${r._reason})`).join('; ')}</div>}
        <div className="row wrap">
          <Btn kind="pri" onClick={() => UI.nav('companies', { q: { import: tag } })}>Open the {cos.length} imported companies</Btn>
          <Btn onClick={() => UI.nav('contacts')}>View contacts</Btn>
          {listId && <Btn onClick={() => UI.nav('lists', { id: listId })}>Open list</Btn>}
          <Btn onClick={reset}>Import another file</Btn>
        </div>
      </div>
    )
  }

  return null
}
