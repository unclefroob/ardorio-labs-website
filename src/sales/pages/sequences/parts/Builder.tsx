import { Fragment } from 'react'
import { uid } from '../../../data/ids'
import { Btn, Card, Chip, Empty, Icon, Menu } from '../../../kit'
import { STEP } from '../../../shared/constants'
import type { SeqStep } from '../../../data/types'
import { condLabel, needsApproval, type Draft } from './conds'
import { StepEditor } from './StepEditor'

const BASE: Record<SeqStep['type'], Partial<SeqStep>> = {
  email: { subject: '', body: '', approval: 'inherit' },
  call: { title: 'Call — {{first_name}}', script: '', wait: false },
  linkedin: { title: 'LinkedIn — {{first_name}}', action: 'Send connection request', script: '' },
  task: { title: '', priority: 'Medium', desc: '' },
  wait: { delay: 3 },
  branch: { cond: 'no_reply', onFalse: 'exit', delay: 0 },
}

const isStepType = (k: string): k is SeqStep['type'] => k in BASE

const unitShort = (u: string | undefined): string => (u === 'hours' ? 'h' : u === 'business days' ? 'bd' : 'd')

function AddStep({ at, can, onAdd }: { at: number; can: boolean; onAdd: (at: number, type: SeqStep['type']) => void }) {
  return (
    <Menu
      trigger={<Btn size="xs" kind="ghost" icon="plus" disabled={!can} aria-label={'Add step at position ' + (at + 1)}>Add step</Btn>}
      items={Object.entries(STEP).filter(([k]) => isStepType(k)).map(([k, [ic, l]]) => ({ label: l, icon: ic, onClick: () => { if (isStepType(k)) onAdd(at, k) } }))}
    />
  )
}

export function Builder({ dr, upd, sel, setSel, can }: { dr: Draft; upd: (p: Partial<Draft>) => void; sel: number; setSel: (i: number) => void; can: boolean }) {
  const steps = dr.steps
  const setStep = (i: number, p: Partial<SeqStep>): void => {
    const n = steps.slice()
    n[i] = { ...n[i], ...p }
    upd({ steps: n })
  }
  const add = (i: number, type: SeqStep['type']): void => {
    const x: SeqStep = { id: uid('st'), type, delay: type === 'email' && i === 0 ? 0 : 2, unit: 'days', ...BASE[type] }
    const n = steps.slice()
    n.splice(i, 0, x)
    upd({ steps: n })
    setSel(i)
  }
  const mv = (i: number, d: number): void => {
    if (i + d < 0 || i + d >= steps.length) return
    const n = steps.slice()
    const t = n[i]
    n[i] = n[i + d]
    n[i + d] = t
    upd({ steps: n })
    setSel(i + d)
  }
  const del = (i: number): void => {
    upd({ steps: steps.filter((_, j) => j !== i) })
    setSel(Math.max(0, i - 1))
  }

  const days = steps.reduce<number[]>((acc, x, i) => {
    const prev = acc[i - 1] ?? 1
    return acc.concat(prev + (i === 0 || x.unit === 'hours' ? 0 : Number(x.delay) || 0))
  }, [])
  const cur = steps[Math.min(sel, steps.length - 1)]
  const curIdx = Math.min(sel, steps.length - 1)

  return (
    <div className="grid builder" style={{ gap: 16, alignItems: 'start' }}>
      <div>
        <div className="col" style={{ gap: 0 }}>
          {steps.length === 0 && (
            <Card>
              <Empty icon="send" title="No steps yet" body={can ? 'Add a first step to begin building this sequence.' : 'This sequence has no steps.'} action={can ? <AddStep at={0} can={can} onAdd={add} /> : undefined} />
            </Card>
          )}
          {steps.map((x, i) => {
            const [ic, l] = STEP[x.type] ?? ['mail', x.type]
            const bad = x.type === 'email' && (!x.subject || !x.body)
            const appr = x.type === 'email' && needsApproval(x.approval, dr.mode)
            const title = x.type === 'email' ? x.subject || 'Untitled email' : x.type === 'wait' ? `Wait ${x.delay ?? 0} ${x.unit ?? 'days'}` : x.type === 'branch' ? 'If ' + condLabel(x.cond) : x.title || l
            return (
              <Fragment key={x.id}>
                <div className="step-line" style={{ height: 22, alignItems: 'center' }}><i /></div>
                <div className="row" style={{ justifyContent: 'flex-start', paddingLeft: 0, marginBottom: 4 }}>
                  <span className="faint xs" style={{ width: 34, textAlign: 'center' }}>{i === 0 ? 'Start' : '+' + (x.delay || 0) + unitShort(x.unit)}</span>
                  <AddStep at={i} can={can} onAdd={add} />
                </div>
                <div className="step">
                  <div className="step-ic" style={x.type === 'branch' ? { borderStyle: 'dashed' } : undefined}><Icon n={ic} s={15} /></div>
                  <button
                    type="button" className={'step-card' + (curIdx === i ? ' on' : '')} aria-pressed={curIdx === i}
                    style={{ width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', display: 'block' }}
                    onClick={() => setSel(i)}
                  >
                    <span className="row" style={{ display: 'flex' }}>
                      <span className="faint xs">Step {i + 1} · Day {days[i]}</span>
                      <span className="sp" />
                      {x.type === 'email' && <Chip tone={appr ? 'warn' : 'info'}>{appr ? 'Approval' : 'Auto'}</Chip>}
                      {bad && <Chip tone="bad">Incomplete</Chip>}
                    </span>
                    <span className="b sm trunc" style={{ display: 'block', marginTop: 2 }}>{title}</span>
                    <span className="faint xs" style={{ display: 'block' }}>
                      {l}
                      {x.type === 'branch' ? ' · else ' + (x.onFalse === 'exit' ? 'exit sequence' : 'skip next step') : x.wait ? ' · waits for completion' : ''}
                    </span>
                  </button>
                </div>
                {x.type === 'branch' && (
                  <div className="row xs" style={{ paddingLeft: 46, gap: 10, marginTop: 4 }}>
                    <span style={{ color: 'var(--ok)' }}>✓ Yes → continue</span>
                    <span style={{ color: 'var(--bad2)' }}>✗ No → {x.onFalse === 'exit' ? 'exit' : 'skip next'}</span>
                  </div>
                )}
              </Fragment>
            )
          })}
          {steps.length > 0 && (
            <>
              <div className="step-line" style={{ height: 22 }}><i /></div>
              <div className="row" style={{ marginBottom: 6 }}><span style={{ width: 34 }} /><AddStep at={steps.length} can={can} onAdd={add} /></div>
            </>
          )}
          <div className="step">
            <div className="step-ic" style={{ background: 'var(--surf2)' }}><Icon n="flag" s={14} /></div>
            <div className="card card-b" style={{ background: 'var(--surf2)' }}>
              <div className="b sm">Exit conditions</div>
              <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>{dr.exits.map(e => <Chip key={e}>{e}</Chip>)}</div>
              <div className="faint xs" style={{ marginTop: 6 }}>Any substantive human reply pauses outbound steps until reviewed.</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ position: 'sticky', top: 10 }}>
        {cur ? (
          <StepEditor key={cur.id} x={cur} i={curIdx} n={steps.length} set={p => setStep(curIdx, p)} mv={mv} del={del} can={can} dr={dr} />
        ) : (
          <Card><Empty icon="send" title="No step selected" body="Add a step, then select it to edit." /></Card>
        )}
      </div>
    </div>
  )
}

