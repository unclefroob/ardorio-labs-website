import { useState } from 'react'
import { research, type AiTag } from '../../ai/client'
import type { ResearchError } from '../../ai/local'
import { companyInsights } from '../../ai/rules'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Company, Research } from '../../data/types'
import { AiBadge, AiNotConfigured, Banner, BizDot, Btn, Card, Empty, Seg, Skel } from '../../kit'
import { UI } from '../../ui/store'
import { ResearchView } from './parts/ResearchView'
import { WebIntel } from './parts/WebIntel'

const failed = (v: Research | ResearchError): v is ResearchError => typeof v.error === 'string' && !('companyId' in v)

export function CompanyIntel({ c, b: b0 }: { c: Company; b: BusinessId }) {
  const opts = Q.relsOf(c.id).map(r => r.businessId).filter(x => Q.member(x))
  const [b, setB] = useState<BusinessId>(b0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tag, setTag] = useState<{ biz: BusinessId; ai: AiTag } | null>(null)
  const ins = companyInsights(c, b)
  const snap = ins.snap
  const bn = Q.biz(b)?.name ?? 'this business'

  const pick = (k: string): void => {
    const next = opts.find(x => x === k)
    if (next) {
      setB(next)
      setErr('')
    }
  }
  const run = async (): Promise<void> => {
    setBusy(true)
    setErr('')
    try {
      const r = await research(c.id, b)
      const v = r.value
      if (failed(v)) {
        setErr(v.error)
        return
      }
      Act.saveResearch(v)
      setTag({ biz: b, ai: r.ai })
      UI.toast('Research saved to ' + c.name)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Research failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap">
        <span className="sm muted">Intelligence for</span>
        <Seg value={b} onChange={pick} opts={opts.map(x => [x, Q.biz(x)?.name ?? x] as const)} />
        <span className="sp" />
        <AiNotConfigured provider="xai" />
        {tag && tag.biz === b && <AiBadge tag={tag.ai} />}
        <Btn icon="refresh" kind="pri" disabled={busy || !Q.canEdit(b)} onClick={() => void run()}>
          {busy ? 'Researching…' : snap ? 'Refresh research' : 'Research company'}
        </Btn>
      </div>
      {busy && <Card><Skel rows={6} /></Card>}
      {!busy && err && (
        <Banner tone="bad" action={Q.canEdit(b) && <Btn size="sm" onClick={() => void run()}>Retry</Btn>}>
          Research unavailable. {err} CRM data is still shown below.
        </Banner>
      )}
      {!busy && !err && S.demo.researchFail && !snap && (
        <Banner tone="bad">Research unavailable — the research provider is not responding (simulated). CRM data is still shown below.</Banner>
      )}
      {snap ? (
        <ResearchView r={snap} />
      ) : (
        !busy && (
          <Card>
            <Empty icon="spark" title="Not researched for this business yet" body={'Generate a ' + bn + '-specific briefing from CRM data and the business knowledge base.'} />
          </Card>
        )
      )}
      <WebIntel key={c.id + b} c={c} b={b} />
      <div className="grid g3">
        <Card title="Buying signals" icon="zap">
          {ins.signals.length ? ins.signals.map(s => <div key={s} className="sm">• {s}</div>) : <div className="faint sm">None detected</div>}
        </Card>
        <Card title="Decision-maker gaps" icon="users">
          {ins.gaps.length ? ins.gaps.map(s => <div key={s} className="sm">• No {s} on file</div>) : <div className="sm" style={{ color: 'var(--ok)' }}>Key roles covered</div>}
        </Card>
        <Card title="Cross-business fit" icon="swap">
          {ins.cross.length ? (
            ins.cross.map(x => (
              <div key={x.key} className="sm" style={{ marginBottom: 6 }}>
                <BizDot b={x.toBiz} /> <b>{Q.biz(x.toBiz)?.name}</b>
                <div className="muted xs">{x.reason}</div>
              </div>
            ))
          ) : (
            <div className="faint sm">No additional fit identified</div>
          )}
        </Card>
      </div>
    </div>
  )
}
