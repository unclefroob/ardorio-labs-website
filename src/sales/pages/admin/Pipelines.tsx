import { useState } from 'react'
import { Act } from '../../data/Act'
import { uid } from '../../data/ids'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Pipeline, PipelineField, Stage } from '../../data/types'
import { Banner, Btn, Card, Chip, Ck, Empty, Fld, Inp, Menu, Sel, Seg } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

const clone = (p: Pipeline): Pipeline => structuredClone(p)
const FIELD_TYPES = ['text', 'number', 'currency', 'date', 'boolean', 'select', 'contact']
const BASE_REQ: ReadonlyArray<readonly [string, string]> = [['value', 'Deal value'], ['description', 'Scope summary'], ['primaryContact', 'Key stakeholder'], ['close', 'Expected close date']]
const CARD_OPTS: ReadonlyArray<readonly [string, string]> = [['value', 'Value'], ['mrr', 'MRR'], ['close', 'Expected close'], ['next', 'Next task'], ['owner', 'Owner'], ['risk', 'Risk indicator']]
const isActive = (f: PipelineField): boolean => f.active === true

function Editor({ b, onSwitch, bs }: { b: BusinessId; onSwitch: (b: BusinessId, dirty: boolean) => void; bs: BusinessId[] }) {
  const pl = Q.pipeline(b)
  const [d, setD] = useState<Pipeline>(() => clone(pl))
  const [nf, setNf] = useState({ label: '', type: 'text', options: '' })
  const dirty = JSON.stringify(d) !== JSON.stringify(pl)
  const open = d.stages.filter(s => !s.won && !s.lost)
  const end = d.stages.filter(s => s.won || s.lost)
  const patch = (p: Partial<Pipeline>): void => setD(x => ({ ...x, ...p }))
  const setStage = (id: string, p: Partial<Stage>): void => setD(x => ({ ...x, stages: x.stages.map(s => (s.id === id ? { ...s, ...p } : s)) }))
  const dealsIn = (id: string): number => S.deals.filter(x => x.stageId === id).length
  const mv = (i: number, dir: 1 | -1): void => {
    const o = open.slice()
    const t = o[i]
    const u = o[i + dir]
    if (!t || !u) return
    o[i] = u
    o[i + dir] = t
    patch({ stages: [...o, ...end] })
  }
  const reqOpts: ReadonlyArray<readonly [string, string]> = [...BASE_REQ, ...d.fields.filter(isActive).map(f => [`f.${f.key}`, f.label] as const)]
  const delStage = (s: Stage): void => {
    const n = dealsIn(s.id)
    if (!n) {
      patch({ stages: d.stages.filter(x => x.id !== s.id) })
      return
    }
    UI.open('migrate', {
      b, stage: s, n,
      others: d.stages.filter(x => x.id !== s.id && Q.pipeline(b).stages.some(y => y.id === x.id)),
      onDone: () => setD(clone(Q.pipeline(b))),
    })
  }
  const save = (): void => {
    if (!d.name.trim()) {
      UI.toast('Give the pipeline a name', 'bad')
      return
    }
    if (d.stages.some(s => !s.name.trim())) {
      UI.toast('Every stage needs a name', 'bad')
      return
    }
    Act.savePipeline(b, { ...d, name: d.name.trim() })
    UI.toast('Pipeline saved, existing deals remain valid')
  }
  const addField = (): void => {
    const slug = nf.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
    let key = `c_${slug}`
    for (let i = 2; d.fields.some(f => f.key === key); i++) key = `c_${slug}_${i}`
    const field: PipelineField = { key, label: nf.label.trim(), type: nf.type, active: true }
    if (nf.type === 'select') field.options = nf.options.split(',').map(s => s.trim()).filter(Boolean)
    patch({ fields: [...d.fields, field] })
    setNf({ label: '', type: 'text', options: '' })
  }
  const setField = (key: string, p: Partial<PipelineField>): void => patch({ fields: d.fields.map(x => (x.key === key ? { ...x, ...p } : x)) })

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHead title="Pipeline configuration" sub="Stages, probabilities, required fields and custom fields per business">
        {dirty && (
          <>
            <Btn onClick={() => setD(clone(pl))}>Discard</Btn>
            <Btn kind="pri" onClick={save}>Save pipeline</Btn>
          </>
        )}
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Seg value={b} onChange={v => onSwitch(v as BusinessId, dirty)} opts={bs.map(x => [x, Q.biz(x)?.name ?? x] as const)} />
        <Fld><Inp value={d.name} onChange={v => patch({ name: v })} style={{ width: 240 }} aria-label="Pipeline name" /></Fld>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <Card
          title="Stages"
          pad={false}
          right={<Btn size="sm" icon="plus" onClick={() => patch({ stages: [...open, { id: uid(`${b}_c`), name: 'New stage', prob: 50, required: [], won: false, lost: false }, ...end] })}>Add stage</Btn>}
        >
          {open.length === 0 && <Empty icon="kanban" title="No open stages" body="Add a stage to start building this pipeline." action={<Btn size="sm" icon="plus" onClick={() => patch({ stages: [{ id: uid(`${b}_c`), name: 'New stage', prob: 50, required: [], won: false, lost: false }, ...end] })}>Add stage</Btn>} />}
          {(open.length > 0 || end.length > 0) && (
            <table className="tbl">
              <thead>
                <tr><th style={{ width: 60 }} /><th>Stage</th><th style={{ width: 110 }}>Probability</th><th>Required before entering</th><th style={{ width: 70 }}>Deals</th><th style={{ width: 40 }} /></tr>
              </thead>
              <tbody>
                {open.map((s, i) => (
                  <tr key={s.id}>
                    <td>
                      <span className="row" style={{ gap: 0 }}>
                        <Btn size="xs" kind="ghost" icon="up" disabled={i === 0} onClick={() => mv(i, -1)} aria-label="Move up" />
                        <Btn size="xs" kind="ghost" icon="down" disabled={i === open.length - 1} onClick={() => mv(i, 1)} aria-label="Move down" />
                      </span>
                    </td>
                    <td><Inp className="sm" value={s.name} onChange={v => setStage(s.id, { name: v })} aria-label="Stage name" /></td>
                    <td><Inp className="sm" value={s.prob} inputMode="numeric" onChange={v => setStage(s.id, { prob: Math.min(100, Math.max(0, Math.trunc(Number(v)) || 0)) })} aria-label="Probability" /></td>
                    <td className="w">
                      <span className="row wrap" style={{ gap: 4 }}>
                        {s.required.map(r => (
                          <Chip key={r}>
                            {reqOpts.find(o => o[0] === r)?.[1] ?? r}
                            <button type="button" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setStage(s.id, { required: s.required.filter(x => x !== r) })} aria-label="Remove">×</button>
                          </Chip>
                        ))}
                        <Menu
                          trigger={<Btn size="xs" kind="ghost" icon="plus">Field</Btn>}
                          items={reqOpts.filter(o => !s.required.includes(o[0])).map(o => ({ label: o[1], onClick: () => setStage(s.id, { required: [...s.required, o[0]] }) }))}
                        />
                      </span>
                    </td>
                    <td className="num">{dealsIn(s.id)}</td>
                    <td><Btn size="xs" kind="ghost" icon="trash" onClick={() => delStage(s)} aria-label="Delete stage" /></td>
                  </tr>
                ))}
                {end.map(s => (
                  <tr key={s.id} style={{ opacity: 0.7 }}>
                    <td />
                    <td><b>{s.name}</b> <span className="faint xs">· fixed</span></td>
                    <td>{s.prob}%</td>
                    <td />
                    <td className="num">{dealsIn(s.id)}</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <div className="grid g2">
          <Card title="Custom fields" pad={false}>
            {d.fields.length === 0
              ? <Empty icon="sliders" title="No custom fields" body="Add fields to capture deal details specific to this business." />
              : (
                <table className="tbl">
                  <tbody>
                    {d.fields.map(f => (
                      <tr key={f.key} style={{ opacity: isActive(f) ? 1 : 0.5 }}>
                        <td><Inp className="sm" value={f.label} onChange={v => setField(f.key, { label: v })} aria-label="Field label" /></td>
                        <td className="faint xs">{f.type}{f.options ? ` · ${f.options.length} options` : ''}</td>
                        <td><Btn size="xs" kind="ghost" onClick={() => setField(f.key, { active: !isActive(f) })}>{isActive(f) ? 'Archive' : 'Restore'}</Btn></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            <div className="row wrap" style={{ padding: 10, gap: 6, borderTop: '1px solid var(--line)' }}>
              <Inp className="sm" style={{ flex: 1, minWidth: 140 }} value={nf.label} onChange={v => setNf({ ...nf, label: v })} placeholder="New field label" aria-label="New field label" />
              <Sel className="sm" style={{ width: 110 }} value={nf.type} onChange={v => setNf({ ...nf, type: v })} options={FIELD_TYPES} aria-label="Field type" />
              {nf.type === 'select' && <Inp className="sm" style={{ width: 160 }} value={nf.options} onChange={v => setNf({ ...nf, options: v })} placeholder="Options, comma separated" aria-label="Options" />}
              <Btn size="sm" icon="plus" disabled={!nf.label.trim()} onClick={addField}>Add</Btn>
            </div>
          </Card>
          <div className="col" style={{ gap: 14 }}>
            <Card title="Won / lost reasons">
              <div className="row wrap" style={{ gap: 4 }}>
                {d.lostReasons.map(r => (
                  <Chip key={r}>
                    {r}
                    <button type="button" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} aria-label={`Remove ${r}`} onClick={() => patch({ lostReasons: d.lostReasons.filter(x => x !== r) })}>×</button>
                  </Chip>
                ))}
                <Btn size="xs" kind="ghost" icon="plus" onClick={() => UI.ask(v => patch({ lostReasons: [...d.lostReasons, v] }), 'New loss reason')}>Add</Btn>
              </div>
            </Card>
            <Card title="Forecast categories">
              <div className="row wrap" style={{ gap: 4 }}>
                {d.forecast.map(r => <Chip key={r}>{r}</Chip>)}
                <Btn size="xs" kind="ghost" icon="plus" onClick={() => UI.ask(v => patch({ forecast: [...d.forecast, v] }), 'New forecast category')}>Add</Btn>
              </div>
            </Card>
            <Card title="Deal card display">
              <div className="col" style={{ gap: 4 }}>
                {CARD_OPTS.map(([k, l]) => (
                  <Ck key={k} checked={d.card.includes(k)} onChange={v => patch({ card: v ? [...d.card, k] : d.card.filter(x => x !== k) })}>{l}</Ck>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Pipelines() {
  const bs = Q.myBiz().filter(b => Q.canAdmin(b))
  const [b, setB] = useState<BusinessId | undefined>(bs[0])
  if (!b) {
    return (
      <div className="page">
        <PageHead title="Pipeline configuration" sub="Stages, probabilities, required fields and custom fields per business" />
        <Banner tone="warn">You need the admin role in a business to configure its pipeline.</Banner>
      </div>
    )
  }
  const pl = Q.pipeline(b)
  if (!pl.id) {
    return (
      <div className="page">
        <PageHead title="Pipeline configuration" sub="Stages, probabilities, required fields and custom fields per business" />
        <div className="card">
          <Empty icon="kanban" title="No pipeline for this business yet" body="Pipelines are set up by the platform team when a business is created. Ask them if this one is missing." />
        </div>
      </div>
    )
  }
  const sw = (next: BusinessId, dirty: boolean): void => {
    if (!dirty) {
      setB(next)
      return
    }
    UI.confirm({ title: 'Discard unsaved pipeline changes?', body: 'Switching business drops the edits you have not saved.', confirm: 'Discard', danger: true, onConfirm: () => setB(next) })
  }
  return <Editor key={b} b={b} bs={bs} onSwitch={sw} />
}
