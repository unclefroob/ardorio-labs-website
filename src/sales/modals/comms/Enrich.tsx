import { useEffect, useState } from 'react'
import { localAi } from '../../ai/client'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Contact } from '../../data/types'
import { Banner, Btn, Chip, Ck, Empty, Modal, Skel, Spinner } from '../../kit'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from '../entities/guards'

type Wiza = localAi.WizaResult
type Found = Extract<Wiza, { sug: unknown }>
type EnrichKey = keyof localAi.WizaSuggestions

const LABEL: Record<string, string> = { email: 'Work email', email2: 'Additional business email', mobile: 'Mobile', phone: 'Work phone', title: 'Job title', linkedin: 'LinkedIn URL', company: 'Company' }
const cur = (ct: Contact, k: string): string => {
  const v = ct[k]
  return typeof v === 'string' ? v : ''
}

export function Enrich({ contactId }: { contactId?: string }) {
  const ct = Q.contact(contactId)
  if (!ct) return <MissingModal title="Enrich with Wiza" what="Contact" />
  const b = Q.primaryBiz(ct)
  if (b && !Q.canEdit(b)) return <NoEditModal title={'Enrich with Wiza — ' + ct.name} what="enrich contacts" />
  return <EnrichFlow ct={ct} />
}

function EnrichFlow({ ct }: { ct: Contact }) {
  useStore()
  const [res, setRes] = useState<Wiza | null>(null)
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [nonce, setNonce] = useState(0)
  const b = Q.primaryBiz(ct)
  const verified = ct.verification === 'Verified'

  useEffect(() => {
    const h = setTimeout(() => {
      const r = localAi.wiza(ct.id)
      setRes(r)
      if ('sug' in r) setPick(Object.fromEntries(Object.keys(r.sug).map(k => [k, !(cur(ct, k) && verified)])))
      if (r.status === 'failed' || r.status === 'quota') Act.wizaUse(0, r.msg)
    }, 600)
    return () => clearTimeout(h)
  }, [ct, nonce, verified])

  const retry = (): void => { setRes(null); setNonce(n => n + 1) }
  const found = res && 'sug' in res ? (res as Found) : null

  const apply = (): void => {
    if (!found) return
    const fields: localAi.WizaSuggestions = {}
    for (const k of Object.keys(found.sug) as EnrichKey[]) {
      const v = found.sug[k]
      if (pick[k] && v) fields[k] = v
    }
    Act.applyEnrichment(ct.id, fields, found, b)
    UI.close()
    const n = Object.keys(fields).length
    UI.toast(n ? 'Enriched ' + ct.name + ': ' + n + ' field(s) updated' : 'Enrichment reviewed. No changes applied.')
  }

  return (
    <Modal
      title={'Enrich with Wiza — ' + ct.name}
      icon="zap"
      width={640}
      sub={<span className="row" style={{ gap: 6 }}><Chip icon="spark" title="No request is made to Wiza. Results are generated locally for demonstration.">Simulated Wiza lookup</Chip></span>}
      footer={found ? <><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={apply}>Apply selected</Btn></> : <Btn onClick={UI.close}>Close</Btn>}
    >
      {!res ? (
        <div className="col gap12" style={{ padding: '10px 0' }} aria-busy="true">
          <div className="row"><Spinner />Searching for {ct.name} at {Q.company(ct.companyId)?.name}…</div>
          <Skel rows={4} />
        </div>
      ) : res.status === 'disconnected' ? (
        <Banner tone="warn" action={<Btn size="sm" onClick={() => { UI.close(); UI.nav('integrations') }}>Open integrations</Btn>}>Wiza is not connected. Connect it in Integrations to enrich contacts.</Banner>
      ) : res.status === 'failed' ? (
        <Banner tone="bad" action={<Btn size="sm" onClick={retry}>Retry</Btn>}><b>Enrichment failed.</b> {res.msg}</Banner>
      ) : res.status === 'quota' ? (
        <Banner tone="warn"><b>Quota unavailable.</b> {res.msg} Ask an administrator to add credits in Integrations.</Banner>
      ) : res.status === 'none' ? (
        <Empty icon="search" title="No result" body={res.msg + ' Try adding a LinkedIn URL and enriching again.'} />
      ) : found ? (
        <div className="col gap12">
          <div className="row">
            <Chip tone={res.status === 'found' ? 'ok' : 'warn'}>{res.status === 'found' ? 'Contact found' : 'Partial match'}</Chip>
            <Chip>Confidence: {found.confidence}</Chip>
            <Chip>{found.source}</Chip>
          </div>
          {found.note && <div className="muted sm">{found.note}</div>}
          {Object.keys(found.sug).length ? (
            <table className="tbl" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
              <thead><tr><th scope="col" style={{ width: 30 }} aria-label="Apply" /><th scope="col">Field</th><th scope="col">Current</th><th scope="col">Suggested</th></tr></thead>
              <tbody>
                {(Object.entries(found.sug) as Array<[EnrichKey, string]>).map(([k, v]) => (
                  <tr key={k}>
                    <td><Ck checked={!!pick[k]} onChange={x => setPick({ ...pick, [k]: x })} label={'Apply ' + (LABEL[k] ?? k)} /></td>
                    <td className="b">{LABEL[k] ?? k}</td>
                    <td className="faint">{cur(ct, k) || '—'}{cur(ct, k) && verified && <Chip tone="ok" style={{ marginLeft: 6 }}>Verified manual</Chip>}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Banner tone="ok">Existing details already match. Nothing to update.</Banner>
          )}
          <div className="grid g2 sm">
            <div><span className="faint">Verification status:</span> {found.verification}</div>
            <div><span className="faint">Enrichment does not grant outreach permission.</span></div>
          </div>
          {verified && Object.keys(found.sug).some(k => cur(ct, k)) && <Banner tone="info">Verified manual values are unticked by default so they aren't overwritten.</Banner>}
        </div>
      ) : null}
    </Modal>
  )
}
