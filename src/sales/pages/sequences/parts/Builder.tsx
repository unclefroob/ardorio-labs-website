import { Fragment } from 'react'
import { uid } from '../../../data/ids'
import { Btn, Card, Chip, Empty, Icon, Menu, TokenText, type MenuItem } from '../../../kit'
import { unknownTokens } from '../../../data/tokens'
import { gapInfo, stepGaps, stepText } from '../../../shared/seqTokens'
import { STEP } from '../../../shared/constants'
import type { SeqStep } from '../../../data/types'
import { dayPlan, emailBefore, getStep, hasPaths, insertStep, key, moveStep, pathOf, removeStep, samePos, updateStep, type Lane, type Pos } from '../../../shared/seqFlow'
import { UI } from '../../../ui/store'
import { condLabel, QUESTIONS, type Draft } from './conds'
import { StepEditor } from './StepEditor'

const BASE: Record<SeqStep['type'], Partial<SeqStep>> = {
  email: { subject: '', body: '' },
  call: { title: 'Call — {{first_name}}', script: '', wait: false },
  linkedin: { title: 'LinkedIn — {{first_name}}', action: 'Send connection request', script: '' },
  task: { title: '', priority: 'Medium', desc: '' },
  wait: { delay: 3 },
  branch: { cond: 'call_connected', delay: 3, yes: [], no: [], afterYes: 'join', afterNo: 'join' },
  end: { delay: 0 },
}

const unitWord = (u: string | undefined, n: number): string => (u === 'hours' ? (n === 1 ? 'hour' : 'hours') : u === 'business days' ? (n === 1 ? 'business day' : 'business days') : n === 1 ? 'day' : 'days')
const waitText = (x: SeqStep): string => {
  const n = Number(x.delay) || 0
  return n ? `then wait ${n} ${unitWord(x.unit, n)}` : 'then straight away'
}

function stepTitle(x: SeqStep, steps: readonly SeqStep[], at: Pos): string {
  if (x.type === 'email') {
    if (x.reply === true) return 'Re: ' + (emailBefore(steps, at)?.subject || 'the first email')
    return x.subject || 'Untitled email'
  }
  if (x.type === 'wait') return `Wait ${x.delay ?? 0} ${unitWord(x.unit, Number(x.delay) || 0)}`
  if (x.type === 'branch') return hasPaths(x) ? (QUESTIONS.find(q => q.key === x.cond)?.label ?? 'Choose a question') : 'If ' + condLabel(x.cond)
  if (x.type === 'end') return 'End here'
  return x.title || STEP[x.type]?.[1] || x.type
}

/** The add-a-step menu. A Check cannot go on a path; a follow-up needs an email before it. */
function AddStep({ at, steps, can, onAdd, label }: { at: Pos; steps: readonly SeqStep[]; can: boolean; onAdd: (at: Pos, s: Partial<SeqStep> & { type: SeqStep['type'] }) => void; label: string }) {
  const canFollow = !!emailBefore(steps, at)
  const items: MenuItem[] = [
    { label: 'Send', head: true },
    { label: 'Follow-up email', icon: 'reply', disabled: !canFollow, title: canFollow ? 'A reply in the conversation the first email started' : 'Add a new email first', onClick: () => onAdd(at, { type: 'email', reply: true }) },
    { label: 'New email', icon: 'mail', title: 'A fresh conversation with its own subject', onClick: () => onAdd(at, { type: 'email', reply: false }) },
    { label: 'Do', head: true },
    { label: 'Call', icon: STEP.call?.[0], onClick: () => onAdd(at, { type: 'call' }) },
    { label: 'LinkedIn', icon: STEP.linkedin?.[0], title: 'A reminder for you. SalesOS never posts on LinkedIn.', onClick: () => onAdd(at, { type: 'linkedin' }) },
    { label: 'Task', icon: STEP.task?.[0], onClick: () => onAdd(at, { type: 'task' }) },
    { label: 'Timing and logic', head: true },
    { label: 'Wait', icon: STEP.wait?.[0], onClick: () => onAdd(at, { type: 'wait' }) },
    !at.lane && { label: 'Check', icon: STEP.branch?.[0], title: 'Ask one question and split into a Yes path and a No path', onClick: () => onAdd(at, { type: 'branch' }) },
    { label: 'End here', icon: 'flag', title: 'Stop, and choose what happens to the lead', onClick: () => onAdd(at, { type: 'end' }) },
  ]
  return <Menu trigger={<button type="button" className="flow-add" disabled={!can} aria-label={label}><Icon n="plus" s={12} /></button>} items={items} />
}

export function Builder({ dr, upd, sel, setSel, can }: { dr: Draft; upd: (p: Partial<Draft>) => void; sel: Pos; setSel: (p: Pos) => void; can: boolean }) {
  const steps = dr.steps
  const days = dayPlan(steps)
  const add = (at: Pos, s: Partial<SeqStep> & { type: SeqStep['type'] }): void => {
    const first = !at.lane && at.i === 0
    const x: SeqStep = { id: uid('st'), delay: first && s.type === 'email' ? 0 : 2, unit: 'days', ...BASE[s.type], ...s } as SeqStep
    if (x.type === 'branch') { x.yes = []; x.no = [] }
    const r = insertStep(steps, at, x)
    upd({ steps: r.steps })
    setSel(r.pos)
  }
  const cur = getStep(steps, sel) ? sel : { i: Math.max(0, Math.min(sel.i, steps.length - 1)) }
  const curStep = getStep(steps, cur)
  const node = (x: SeqStep, at: Pos, small = false) => {
    const [ic] = STEP[x.type] ?? ['mail']
    const on = samePos(cur, at)
    const bad = x.type === 'email' && (!String(x.body ?? '').trim() || (x.reply !== true && !x.subject))
    const typo = unknownTokens(stepText(x, steps, at)).length > 0
    const gaps = x.type === 'email' || x.type === 'call' || x.type === 'linkedin' ? stepGaps(x, steps, at, dr) : null
    const short = gaps ? Math.max(0, ...gaps.byKey.values()) : 0
    return (
      <button type="button" className={(small ? 'flow-mini' : 'flow-card') + (on ? ' on' : '') + (x.type === 'branch' ? ' chk' : '')} aria-pressed={on} onClick={() => setSel(at)}>
        <span className="row xs faint" style={{ display: 'flex' }}>
          {!small && <span>{at.lane ? '' : `Step ${at.i + 1} · `}Day {days.get(key(at)) ?? 1}</span>}
          {small && <Icon n={ic} s={13} />}
          <span className="sp" />
          {x.type === 'email' && <Chip>{x.reply === true ? 'Follow-up' : 'You send'}</Chip>}
          {x.type === 'branch' && !small && <Chip tone="info">Check</Chip>}
          {bad && <Chip tone="bad">Incomplete</Chip>}
          {typo && <Chip tone="bad" title="A variable here does not exist. Open the step to fix it.">Unknown variable</Chip>}
          {short > 0 && gaps && <Chip tone="warn" icon="alert" title={`${short} of ${gaps.total} enrolled contacts are missing data this step needs. Their email is held until it is filled in, or the variable has a fallback.`}>{short} missing data</Chip>}
        </span>
        <span className="b sm trunc" style={{ display: 'block', marginTop: 2 }}><TokenText text={stepTitle(x, steps, at)} info={gaps ? gapInfo(gaps) : undefined} /></span>
        {!small && <span className="faint xs" style={{ display: 'block' }}>{STEP[x.type]?.[1] ?? x.type}{x.wait ? ' · waits until done' : ''}</span>}
      </button>
    )
  }

  const lane = (x: SeqStep, i: number, l: Lane) => {
    const list = pathOf(x, l)
    const after = l === 'yes' ? x.afterYes : x.afterNo
    return (
      <div className="flow-lane">
        <div className={'flow-lh ' + l}><Icon n={l === 'yes' ? 'check' : 'x'} s={13} />{l === 'yes' ? 'Yes' : 'No'}</div>
        {list.map((y, j) => (
          <Fragment key={y.id}>
            {j > 0 && <div className="faint xs" style={{ paddingLeft: 4 }}>{waitText(y)}</div>}
            {node(y, { i, lane: l, j }, true)}
          </Fragment>
        ))}
        {list.length === 0 && <div className="faint xs">Nothing here: goes straight on</div>}
        {can && <span className="row xs"><AddStep at={{ i, lane: l, j: list.length }} steps={steps} can={can} onAdd={add} label={`Add a step to the ${l === 'yes' ? 'Yes' : 'No'} path of step ${i + 1}`} /><span className="faint">Add to {l === 'yes' ? 'Yes' : 'No'}</span></span>}
        <div className="faint xs">{after === 'end' ? 'then the sequence ends' : 'then join back'}</div>
      </div>
    )
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="flow-always" role="note">
        <Icon n="shield" s={15} />
        <b className="sm">Always on, for everyone in this sequence</b>
        <Chip>A reply stops it</Chip><Chip>Unsubscribe: suppressed</Chip><Chip>Bounce: address suppressed</Chip><Chip>Out of office: paused until back</Chip>
      </div>
      <div className="grid builder" style={{ gap: 16, alignItems: 'start' }}>
        <div className="flow" aria-label="Steps">
          {steps.length === 0 && (
            <Card>
              <Empty icon="send" title="No steps yet" body={can ? 'Add the first email to begin.' : 'This sequence has no steps.'} action={can ? <Btn kind="pri" icon="plus" onClick={() => add({ i: 0 }, { type: 'email', reply: false })}>Add the first email</Btn> : undefined} />
            </Card>
          )}
          {steps.map((x, i) => {
            const [ic] = STEP[x.type] ?? ['mail']
            return (
              <Fragment key={x.id}>
                {i > 0 && (
                  <div className="flow-link">
                    {can && <AddStep at={{ i }} steps={steps} can={can} onAdd={add} label={`Add a step before step ${i + 1}`} />}
                    <span className="faint xs">{waitText(x)}</span>
                  </div>
                )}
                <div className="flow-node">
                  <div className={'step-ic' + (x.type === 'branch' ? ' chk' : '')}><Icon n={ic} s={15} /></div>
                  {node(x, { i })}
                </div>
                {hasPaths(x) && <div className="flow-lanes">{lane(x, i, 'yes')}{lane(x, i, 'no')}</div>}
                {x.type === 'branch' && !hasPaths(x) && (
                  <div className="row xs" style={{ paddingLeft: 46, gap: 10, marginTop: 4 }}>
                    <span style={{ color: 'var(--ok)' }}>Yes: continue</span>
                    <span style={{ color: 'var(--bad2)' }}>No: {x.onFalse === 'skip' ? 'skip the next step' : 'exit'}</span>
                  </div>
                )}
              </Fragment>
            )
          })}
          {steps.length > 0 && steps[steps.length - 1].type !== 'end' && (
            <>
              <div className="flow-link">
                {can && <AddStep at={{ i: steps.length }} steps={steps} can={can} onAdd={add} label="Add a step at the end" />}
                <span className="faint xs">{can ? 'Add a step' : ''}</span>
              </div>
              <div className="flow-node">
                <div className="step-ic" style={{ background: 'var(--surf2)' }}><Icon n="flag" s={14} /></div>
                <div className="card card-b" style={{ background: 'var(--surf2)' }}><div className="b sm">End</div><div className="faint xs">After the last step the sequence is finished for them.</div></div>
              </div>
            </>
          )}
        </div>
        <div style={{ position: 'sticky', top: 10 }}>
          {curStep ? (
            <StepEditor
              key={curStep.id} x={curStep} pos={cur} steps={steps} dr={dr} can={can}
              set={p => upd({ steps: updateStep(steps, cur, p) })}
              mv={d => { const r = moveStep(steps, cur, d); upd({ steps: r.steps }); setSel(r.pos) }}
              del={() => {
                const go = (): void => { const r = removeStep(steps, cur); upd({ steps: r.steps }); setSel(r.pos) }
                if (hasPaths(curStep) && (pathOf(curStep, 'yes').length || pathOf(curStep, 'no').length)) {
                  UI.confirm({ title: 'Delete this Check and its paths?', body: 'The steps on its Yes and No paths are deleted with it.', confirm: 'Delete', danger: true, onConfirm: go })
                } else go()
              }}
            />
          ) : (
            <Card><Empty icon="send" title="No step selected" body="Add a step, then select it to edit." /></Card>
          )}
        </div>
      </div>
    </div>
  )
}
