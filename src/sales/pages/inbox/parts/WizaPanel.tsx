import { useState } from 'react'
import { localAi } from '../../../ai/client'
import type { WizaResult, WizaUrlResult } from '../../../ai/local'
import { Act } from '../../../data/Act'
import { Q } from '../../../data/Q'
import { S, useStore } from '../../../data/store'
import { Banner, Btn, Card, Chip, Ck, CtLink, Empty, FilterBar, Inp, SearchInp, Sim, Skel, useSim } from '../../../kit'
import { UI } from '../../../ui/store'
import { includesCI } from './util'

const TONE: Record<string, string> = { found: 'ok', partial: 'warn', none: '', failed: 'bad', quota: 'bad', disconnected: '' }
const LABEL: Record<string, string> = { found: 'Found', partial: 'Partial match', none: 'No result', failed: 'Failed', quota: 'Quota unavailable', disconnected: 'Disconnected' }

export function WizaPanel({ onImport }: { onImport: () => void }) {
  useStore()
  const [url, setUrl] = useState('')
  const [busy, run] = useSim(900)
  const [r, setR] = useState<WizaUrlResult | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [batch, setBatch] = useState<Array<{ id: string; r: WizaResult }> | null>(null)
  const [bb, runB] = useSim(1200)
  const b = Q.defaultBiz()
  const conn = S.wiza.status === 'connected'
  const all = Q.contacts()
  const pool = all
    .filter(c => !q || includesCI(c.name + ' ' + (Q.company(c.companyId)?.name ?? ''), q))
    .sort((a, c) => Number(!!a.email) + Number(!!(a.phone || a.mobile)) - (Number(!!c.email) + Number(!!(c.phone || c.mobile))))
    .slice(0, 40)

  return (
    <div className="col" style={{ gap: 14 }}>
      {!conn && <Banner tone="warn" action={<Btn size="sm" onClick={() => UI.nav('integrations')}>Connect</Btn>}>Wiza (mock) is disconnected.</Banner>}
      <div className="row">
        <Sim>Mock Wiza</Sim>
        <span className="sm muted">{S.wiza.credits} credits · {S.wiza.used} used</span>
        {S.demo.wizaFail && <Chip tone="bad">Failure mode on (Demo Centre)</Chip>}
      </div>
      <div className="grid g2">
        <Card title="Look up a LinkedIn profile" icon="li">
          <form className="row" onSubmit={e => { e.preventDefault(); setR(null); run(() => setR(localAi.wizaUrl(url))) }}>
            <Inp value={url} onChange={setUrl} aria-label="LinkedIn profile URL" placeholder="https://www.linkedin.com/in/first-last" />
            <Btn type="submit" kind="pri" disabled={busy || !conn || !url.trim()}>{busy ? 'Searching…' : 'Enrich'}</Btn>
          </form>
          {busy && <div style={{ marginTop: 12 }}><Skel rows={3} /></div>}
          {r && !busy && (
            <div style={{ marginTop: 12 }}>
              {r.status === 'invalid' && <Banner tone="warn">{r.msg}</Banner>}
              {r.status === 'none' && <Banner>No result. {r.msg}</Banner>}
              {r.status === 'failed' && <Banner tone="bad">{r.msg}</Banner>}
              {r.status === 'duplicate' && <Banner tone="info" action={<Btn size="sm" onClick={() => UI.nav('contact', { id: r.contactId })}>Open</Btn>}><b>Duplicate match.</b> {r.msg}</Banner>}
              {(r.status === 'found' || r.status === 'partial') && (
                <div className="card card-b">
                  <div className="row"><Chip tone={r.status === 'found' ? 'ok' : 'warn'}>{r.status === 'found' ? 'Contact found' : 'Partial match'}</Chip><Chip>{r.confidence} confidence</Chip></div>
                  <dl className="dl" style={{ marginTop: 10 }}>
                    <dt>Name</dt><dd>{r.person.firstName} {r.person.lastName}</dd>
                    <dt>Title</dt><dd>{r.person.title}</dd>
                    <dt>Company hint</dt><dd>{r.person.companyHint || <span className="faint">Unknown</span>}</dd>
                    <dt>Email</dt><dd>{r.person.email || <span className="faint">Not found</span>}</dd>
                    <dt>Mobile</dt><dd>{r.person.mobile || '—'}</dd>
                  </dl>
                  <Btn size="sm" kind="pri" icon="plus" style={{ marginTop: 10 }} disabled={!Q.anyEdit()} onClick={() => { UI.open('newContact', { businessId: b }); UI.toast('Review and save the new contact. Fields from Wiza need confirmation.') }}>Create contact</Btn>
                </div>
              )}
            </div>
          )}
        </Card>
        <Card title="Enrich existing contacts" icon="zap" pad={false}>
          {all.length === 0 ? (
            <Empty icon="users" title="No contacts to enrich yet" body="Import leads or add a contact, then enrich them here." action={<Btn kind="pri" icon="upload" onClick={onImport}>Import leads</Btn>} />
          ) : (
            <>
              <FilterBar>
                <SearchInp value={q} onChange={setQ} placeholder="Search contacts" w={200} />
                <span className="sp" />
                <Btn
                  size="sm" kind="pri" disabled={!sel.length || bb || !conn}
                  onClick={() => runB(() => {
                    const out = sel.map(id => ({ id, r: localAi.wiza(id) }))
                    setBatch(out)
                    const failed = out.filter(x => x.r.status === 'failed').length
                    if (failed) Act.wizaUse(0, `Batch: ${failed} failed`)
                  })}
                >
                  {bb ? 'Enriching…' : 'Enrich ' + (sel.length || '') + ' selected'}
                </Btn>
              </FilterBar>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {pool.map(c => (
                  <div key={c.id} className="row" style={{ padding: '6px 12px', borderBottom: '1px solid var(--line)' }}>
                    <Ck checked={sel.includes(c.id)} label={'Select ' + c.name} onChange={on => setSel(on ? sel.concat(c.id) : sel.filter(x => x !== c.id))} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sm b">{c.name}</div>
                      <div className="faint xs trunc">{Q.company(c.companyId)?.name}</div>
                    </div>
                    {!c.email && <Chip tone="warn">No email</Chip>}
                    {!(c.phone || c.mobile) && <Chip tone="warn">No phone</Chip>}
                  </div>
                ))}
                {!pool.length && <Empty icon="search" title="No contacts match" body="Try a different name or company." action={<Btn size="sm" onClick={() => setQ('')}>Clear search</Btn>} />}
              </div>
            </>
          )}
        </Card>
      </div>
      {batch && (
        <Card title="Batch results" pad={false}>
          <div className="tw">
            <table className="tbl">
              <thead><tr><th>Contact</th><th>Result</th><th>Suggested</th><th /></tr></thead>
              <tbody>
                {batch.map(({ id, r: x }) => {
                  const sug = 'sug' in x ? x.sug : undefined
                  return (
                    <tr key={id}>
                      <td><CtLink id={id} /></td>
                      <td><Chip tone={TONE[x.status]}>{LABEL[x.status]}</Chip></td>
                      <td className="w sm">{sug ? (Object.keys(sug).join(', ') || 'Up to date') : 'msg' in x ? x.msg : ''}</td>
                      <td>{sug && Object.keys(sug).length > 0 && <Btn size="xs" onClick={() => UI.open('enrich', { contactId: id })}>Review &amp; apply</Btn>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
