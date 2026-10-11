import { Fragment, type FC, type ReactNode } from 'react'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import type { Research } from '../../../data/types'
import { providerName } from '../../../ai/client'
import type { AiProvider } from '../../../api/contract'
import { Banner, Chip, Icon, ScoreRing, Sim } from '../../../kit'
import { ScoreWhy } from '../../../shared/IntelBits'
import { safeHref } from '../query'

export interface ResearchViewProps { r: Research; onSave?: ReactNode; saved?: boolean }

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

const HEAD = { textTransform: 'uppercase', letterSpacing: '.06em' } as const

function Bullets({ items }: { items: readonly string[] }) {
  return <>{items.map(x => <div key={x} className="sm" style={{ marginTop: 4 }}>• {x}</div>)}</>
}

export const ResearchView: FC<ResearchViewProps> = ({ r, onSave, saved }) => {
  const bn = Q.biz(r.businessId)?.name ?? ''
  const by = text(r.by) ? Q.user(text(r.by))?.name : undefined
  const base = typeof r.score === 'number' ? r.score : 0
  // Only a result tied to a CRM company can be moved by saved signals; an unmatched result keeps its own score.
  const bd = typeof r.score === 'number' && r.companyId ? Q.scoreBreakdown(r.companyId, r.businessId, base) : null
  const score = bd ? bd.total : base
  const facts = pairs(r.facts)
  const srcs = sources(r.sources)
  const caveats = list(r.inferred)
  const provider = providerOf(r.provider)
  const web = webSources(r.webSources)
  const limited = r.limited === true
  return (
    <div className="ai card-b">
      <div className="row wrap">
        <div className="ai-h"><Icon n="spark" s={14} />{bn} research · {text(r.companyName)}</div>
        <span className="sp" />
        <span className="faint xs">Generated {F.dt(r.ts)}{by ? ' by ' + by : ''}</span>
        {provider && (
          <Chip icon="spark" title={provider === 'xai' ? 'Written by Grok using live web and X search' : 'Written by Claude with no web access'}>
            {providerName(provider)}{text(r.providerModel) ? ` (${text(r.providerModel)})` : ''}
          </Chip>
        )}
        {r.simulated === true && <Sim />}
      </div>
      {provider && <div className="xs faint" style={{ marginTop: 6 }}>The overview, challenges, offerings, roles and angle below are AI inference. Only “Facts from CRM” comes from your records.</div>}
      {limited && (
        <div style={{ marginTop: 10 }}>
          <Banner tone="warn">
            {provider === 'xai'
              ? 'No CRM record matched, so there are no CRM facts or score. Everything here is public web research.'
              : 'Limited result: no CRM record matched. Generic sector content only.'}
          </Banner>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 150px', gap: 14, marginTop: 12 }}>
        <div>
          <div className="sm" style={{ lineHeight: 1.6 }}>{text(r.overview)}</div>
          <div className="row wrap sm" style={{ marginTop: 8, gap: 14 }}>
            <span><span className="faint">Size:</span> {text(r.size) || '—'}</span>
            <span><span className="faint">Industry:</span> {text(r.industry) || '—'}</span>
            <span><span className="faint">Model:</span> {text(r.model) || '—'}</span>
          </div>
        </div>
        <div className="col" style={{ alignItems: 'center', textAlign: 'center' }}>
          {limited ? (
            <>
              <span className="b" style={{ fontSize: 18 }} aria-hidden="true">—</span>
              <span className="xs faint">Not scored</span>
              <span className="xs faint">Scoring needs a CRM record</span>
            </>
          ) : (
            <>
              <ScoreRing v={score} s={64} />
              <span className="xs faint">Opportunity score</span>
            </>
          )}
        </div>
      </div>
      {bd && r.companyId && (bd.parts.length > 0 || bd.pending.length > 0) && (
        <div className="card card-b" style={{ marginTop: 12 }} data-testid="research-signal-adjust">
          <ScoreWhy bd={bd} companyId={r.companyId} b={r.businessId} />
        </div>
      )}
      <div className="grid g3" style={{ marginTop: 14 }}>
        <div><div className="b sm">Potential challenges <span className="faint xs">(inferred)</span></div><Bullets items={list(r.challenges)} /></div>
        <div><div className="b sm">Relevant {bn} offerings</div><Bullets items={list(r.offerings)} /></div>
        <div><div className="b sm">Recommended stakeholder roles</div><Bullets items={list(r.stakeholders)} /></div>
      </div>
      {text(r.angle) && (
        <div className="card card-b" style={{ marginTop: 14 }}>
          <div className="b sm">Suggested outreach angle</div>
          <div className="sm" style={{ marginTop: 4 }}>{text(r.angle)}</div>
        </div>
      )}
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div>
          <div className="b xs faint" style={HEAD}>Facts from CRM</div>
          <dl className="dl" style={{ marginTop: 6, gridTemplateColumns: '150px minmax(0,1fr)' }}>
            {facts.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
          </dl>
        </div>
        <div>
          <div className="b xs faint" style={HEAD}>Sources & caveats</div>
          {srcs.map(s => <div key={s.label} className="sm" style={{ marginTop: 4 }}><Chip>{s.kind}</Chip> {s.label}</div>)}
          {web.map(s => (
            <div key={s.href} className="sm" style={{ marginTop: 4 }}>
              <Chip icon="globe">Web</Chip> <a href={s.href} target="_blank" rel="noopener noreferrer">{s.title}</a> <span className="faint xs">{s.host}</span>
            </div>
          ))}
          {provider === 'xai' && web.length === 0 && <div className="xs faint" style={{ marginTop: 4 }}>Search returned no linked sources, so treat every claim as unverified.</div>}
          {caveats.map(x => <div key={x} className="xs faint" style={{ marginTop: 4 }}>⚠ {x}</div>)}
        </div>
      </div>
      {onSave && (
        <div className="row" style={{ marginTop: 14 }}>
          <span className="sp" />
          {saved ? <Chip tone="ok" icon="check">Saved to CRM</Chip> : onSave}
        </div>
      )}
    </div>
  )
}
