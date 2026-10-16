import { useState } from 'react'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { S } from '../../../data/store'
import type { SeqStep } from '../../../data/types'
import { Banner, Btn, Card, Chip, chipsInHtml, Ck, Fld, Icon, Inp, Menu, RichText, Seg, Sel, TA, TokenInput, TokenText, type ChipInfo } from '../../../kit'
import { suggestToken, tokenNames, unknownTokens } from '../../../data/tokens'
import { gapInfo, stepGaps, stepText } from '../../../shared/seqTokens'
import { TOKENS } from '../../../kit/util'
import { STEP } from '../../../shared/constants'
import { CONDS, QUESTIONS, str, type Draft } from './conds'
import { emailBefore, hasPaths, walk, type Pos } from '../../../shared/seqFlow'
import { LEAD_STATUSES } from '../../../modals/entities/options'

interface Props {
  x: SeqStep
  pos: Pos
  steps: readonly SeqStep[]
  set: (p: Partial<SeqStep>) => void
  mv: (d: -1 | 1) => void
  del: () => void
  can: boolean
  dr: Draft
}

function Preview({ x, dr, subject }: { x: SeqStep; dr: Draft; subject: string }) {
  const pool = S.contacts.filter(c => !c.archived && Q.crel(c.id, dr.businessId)).slice(0, 40)
  const [pc, setPc] = useState(pool[0]?.id ?? '')
  const ct = pool.find(c => c.id === pc) ?? pool[0]
  const tok = Q.tokens(ct, Q.senderOf(Q.mailbox(dr.mailboxId)), dr.businessId)
  const sj = Q.render(subject, tok)
  const bd = Q.render(x.body || '', tok)
  const miss = [...new Set(sj.missing.concat(bd.missing))].filter(k => !sj.unknown.includes(k) && !bd.unknown.includes(k))
  // What is left unfilled shows as an amber chip, in place, so it is clear which words are missing.
  const missing: ChipInfo = () => ({ tone: 'warn', note: `${ct?.name ?? 'This contact'} has no value for this` })
  const html = chipsInHtml(F.body(bd.text), missing)
  return (
    <div className="card card-b" style={{ background: 'var(--surf2)' }}>
      <div className="row xs" style={{ marginBottom: 6 }}>
        <Icon n="eye" s={12} />
        {ct ? (
          <>
            <label htmlFor={'prev-' + x.id}>Live preview for</label>
            <Sel id={'prev-' + x.id} className="sm" style={{ width: 220 }} value={ct.id} onChange={setPc} options={pool.map(c => [c.id, c.name + ' · ' + (Q.company(c.companyId)?.name ?? 'No company')] as const)} />
            {miss.length > 0 && <Chip tone="warn">No {tokenNames(miss).toLowerCase()}: this email would be held</Chip>}
          </>
        ) : (
          <span className="faint">Preview shows tokens unfilled until this business has contacts.</span>
        )}
      </div>
      <div className="b sm">{sj.text ? <TokenText text={sj.text} info={missing} /> : <span className="faint">No subject</span>}</div>
      <div className="sm" style={{ marginTop: 6, maxHeight: 220, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

export function StepEditor({ x, pos, steps, set, mv, del, can, dr }: Props) {
  const [ic, l] = STEP[x.type] ?? ['mail', x.type]
  const i = pos.i
  const list = pos.lane ? (steps[pos.i]?.[pos.lane] as SeqStep[] | undefined) ?? [] : steps
  const at = pos.lane ? pos.j ?? 0 : pos.i
  const where = pos.lane ? `Step ${pos.i + 1} · ${pos.lane === 'yes' ? 'Yes' : 'No'} path ${at + 1}` : `Step ${pos.i + 1}`
  const first = emailBefore(steps, pos)
  const tpls = S.templates.filter(t => t.businessId === dr.businessId)
  const mb = Q.mailbox(dr.mailboxId)
  // Chip colours: amber where enrolled contacts have no value, red (the default) where a variable does not exist.
  const gaps = stepGaps(x, steps, pos, dr)
  const info = gapInfo(gaps)
  const typos = unknownTokens(stepText(x, steps, pos))
  const typoNote = typos.length > 0 && (
    <Banner tone="bad">
      {typos.length === 1 ? 'This variable does not exist' : 'These variables do not exist'}: {typos.map(k => { const s2 = suggestToken(k); return `{{${k}}}${s2 ? ` (did you mean ${s2.label}?)` : ''}` }).join(', ')}.
      {' '}The sequence cannot start until it is fixed.
    </Banner>
  )
  const gapNote = gaps.byKey.size > 0 && (
    <Banner tone="warn">
      {[...gaps.byKey].map(([k, n]) => `${n} of ${gaps.total} enrolled have no ${tokenNames([k]).toLowerCase()}`).join('; ')}. Their email is held until it is filled in, or click the chip to give it a fallback.
    </Banner>
  )
  const subject = x.reply === true ? 'Re: ' + (first?.subject || '') : x.subject || ''

  const delay = i === 0 && !pos.lane && x.type !== 'wait' ? (
    <div className="faint sm">First step runs at enrolment start (within the sending window).</div>
  ) : (
    <div className="row" style={{ gap: 8 }}>
      <Fld label={x.type === 'wait' ? 'Wait for' : x.type === 'branch' ? 'Answer it after' : 'Delay after previous step'} style={{ width: 140 }}>
        <Inp value={x.delay ?? 0} onChange={v => set({ delay: +v || 0 })} disabled={!can} inputMode="numeric" />
      </Fld>
      <Fld label="Unit" style={{ width: 150 }}>
        <Sel value={x.unit || 'days'} onChange={v => set({ unit: v })} options={['hours', 'days', 'business days']} disabled={!can} />
      </Fld>
      {x.type === 'wait' && (
        <Fld label="Or fixed date" style={{ flex: 1 }}>
          <Inp type="date" value={str(x.fixedDate)} onChange={v => set({ fixedDate: v })} disabled={!can} />
        </Fld>
      )}
    </div>
  )

  return (
    <Card
      title={<span className="row"><Icon n={ic} s={14} />{where}: {l}</span>}
      right={can && (
        <>
          <Btn size="xs" kind="ghost" icon="up" disabled={at === 0} onClick={() => mv(-1)} aria-label="Move step up" />
          <Btn size="xs" kind="ghost" icon="down" disabled={at === list.length - 1} onClick={() => mv(1)} aria-label="Move step down" />
          <Btn size="xs" kind="ghost" icon="trash" onClick={del} aria-label="Delete step" />
        </>
      )}
    >
      <div className="col gap12">
        {delay}
        {x.type === 'email' && (
          <>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <Menu
                align="right"
                trigger={<Btn icon="file" iconRight="down" disabled={!can}>Insert template</Btn>}
                items={tpls.length ? tpls.map(t => ({ label: t.name, right: t.category, onClick: () => set({ subject: t.subject, body: t.body, templateId: t.id }) })) : [{ label: 'No templates for this business yet', disabled: true }]}
              />
            </div>
            <Fld label="Kind of email">
              <Seg value={x.reply === true ? 'reply' : 'new'} onChange={v => { if (can) set(v === 'reply' ? { reply: true } : { reply: false }) }} opts={first ? [['reply', 'Reply in the same conversation'], ['new', 'New email']] : [['new', 'New email']]} />
            </Fld>
            {x.reply === true ? (
              <Fld label="Subject" hint="A reply keeps the first email's subject, so Gmail and Outlook show it in the same thread. Choose New email to write a different subject.">
                <TokenInput label="Subject" value={subject} onChange={() => undefined} disabled info={info} />
              </Fld>
            ) : (
              <Fld label="Subject" req hint="Type {{ to add a variable, such as their company name.">
                <TokenInput label="Subject" value={x.subject || ''} onChange={v => set({ subject: v })} disabled={!can} placeholder="Subject" info={info} />
              </Fld>
            )}
            <div className="fld">
              <span className="sm b" id={'body-' + x.id}>Body</span>
              {can ? (
                <RichText value={x.body || ''} onChange={v => set({ body: v })} tokens={TOKENS} minH={180} label="Email body" info={info} />
              ) : (
                <div className="rte" role="textbox" aria-readonly="true" aria-labelledby={'body-' + x.id} dangerouslySetInnerHTML={{ __html: chipsInHtml(F.body(x.body || ''), info) }} />
              )}
            </div>
            {typoNote}
            {gapNote}
            <div className="faint xs">
              Sending window {dr.window[0]}:00–{dr.window[1]}:00{dr.businessDays ? ' on business days' : ''} · from {mb?.address ?? 'no mailbox selected'}
            </div>
            <Preview x={x} dr={dr} subject={subject} />
          </>
        )}
        {(x.type === 'call' || x.type === 'linkedin' || x.type === 'task') && (
          <>
            <Fld label="Task title"><TokenInput label="Task title" value={x.title || ''} onChange={v => set({ title: v })} disabled={!can} info={info} /></Fld>
            {typoNote}
            {x.type === 'linkedin' && (
              <>
                <Fld label="Manual action"><Sel value={x.action} onChange={v => set({ action: v })} options={['View profile', 'Send connection request', 'Send message', 'Follow up']} disabled={!can} /></Fld>
                <Banner icon="info">LinkedIn steps create manual tasks only — no automated messaging or scraping.</Banner>
              </>
            )}
            <Fld label={x.type === 'call' ? 'Instructions & suggested call script' : x.type === 'linkedin' ? 'Instructions / suggested message' : 'Description'}>
              <TA value={x.type === 'task' ? x.desc : x.script} onChange={v => set(x.type === 'task' ? { desc: v } : { script: v })} rows={4} disabled={!can} />
            </Fld>
            <div className="grid g2">
              <Fld label="Assigned to">
                <Sel value={x.assignee || ''} onChange={v => set({ assignee: v || undefined })} placeholder="Enrolment owner" options={Q.usersIn(dr.businessId).map(u => [u.id, u.name] as const)} disabled={!can} />
              </Fld>
              {x.type === 'task' && (
                <Fld label="Priority"><Sel value={x.priority || 'Medium'} onChange={v => set({ priority: v })} options={['High', 'Medium', 'Low']} disabled={!can} /></Fld>
              )}
              <Fld label="Due date logic"><div className="sm muted">Due when the step is reached</div></Fld>
            </div>
            <Ck checked={!!x.wait} onChange={v => set({ wait: v })} disabled={!can}>Wait for this task to be completed before continuing</Ck>
          </>
        )}
        {x.type === 'branch' && (hasPaths(x) ? <CheckEditor x={x} steps={steps} set={set} can={can} /> : (
          <>
            <Fld label="Continue only if"><Sel value={x.cond} onChange={v => set({ cond: v })} options={CONDS} disabled={!can} /></Fld>
            <Fld label="Otherwise">
              <Seg value={x.onFalse || 'exit'} onChange={v => { if (can) set({ onFalse: v }) }} opts={[['exit', 'Exit sequence'], ['skip', 'Skip next step']]} />
            </Fld>
            {can && <Btn onClick={() => set({ yes: [], no: [], afterYes: 'join', afterNo: 'join', onFalse: undefined, cond: QUESTIONS.some(q => q.key === x.cond) ? x.cond : 'call_connected' })}>Use a Yes path and a No path instead</Btn>}
          </>
        ))}
        {x.type === 'end' && (
          <>
            <Fld label="Then set their lead status" hint="For this business only.">
              <Sel value={x.leadStatus || ''} onChange={v => set({ leadStatus: v || undefined })} placeholder="Leave it as it is" options={LEAD_STATUSES.filter(s => s !== 'Customer' && s !== 'Do Not Contact')} disabled={!can} />
            </Fld>
            <Fld label="And ask the owner to look again" hint="A task for the person who enrolled them.">
              <Sel value={String(x.reviewDays ?? '')} onChange={v => set({ reviewDays: v ? +v : undefined })} placeholder="No reminder" options={[['30', 'In 30 days'], ['60', 'In 60 days'], ['90', 'In 90 days'], ['180', 'In 6 months']]} disabled={!can} />
            </Fld>
          </>
        )}
        {x.type === 'wait' && <div className="faint sm">Holds the enrolment before the next step. Combine with business-day units to avoid weekends.</div>}
      </div>
    </Card>
  )
}

/** A Check with two paths: one question, when to answer it, and what happens after each path. */
function CheckEditor({ x, steps, set, can }: { x: SeqStep; steps: readonly SeqStep[]; set: (p: Partial<SeqStep>) => void; can: boolean }) {
  const emails = walk(steps).filter(w => w.step.type === 'email' && !w.pos.lane && steps.indexOf(x) > w.pos.i)
  const groups = ['Your emails', 'Your own work', 'The CRM'] as const
  return (
    <>
      <div className="fld">
        <span className="sm b" id={'q-' + x.id}>The question</span>
        <div className="col" style={{ gap: 4 }} role="radiogroup" aria-labelledby={'q-' + x.id}>
          {groups.map(g => (
            <div key={g} className="col" style={{ gap: 2 }}>
              <span className="faint xs b" style={{ paddingTop: 4 }}>{g === 'Your emails' ? 'From your emails' : g === 'Your own work' ? 'From your own work' : 'From the CRM'}</span>
              {QUESTIONS.filter(q => q.group === g).map(q => (
                <label key={q.key} className="row sm" style={{ gap: 8, padding: '4px 2px' }}>
                  <input type="radio" name={'q-' + x.id} checked={x.cond === q.key} disabled={!can} onChange={() => set({ cond: q.key })} />
                  <span>{q.label}{q.needs && <span className="faint xs"> · needs {q.needs === 'opens' ? 'open' : 'click'} tracking</span>}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
      {x.cond === 'opened' && emails.length > 0 && (
        <Fld label="Which email">
          <Sel value={x.condStepId || ''} onChange={v => set({ condStepId: v || undefined })} placeholder="Any email in this sequence" options={emails.map(w => [w.step.id, `Step ${w.pos.i + 1}: ${w.step.subject || 'email'}`] as const)} disabled={!can} />
        </Fld>
      )}
      {(x.cond === 'opened' || x.cond === 'clicked') && (
        <Banner tone="warn">Tracking adds a hidden image or rewrites links, which can push mail towards spam, and Apple Mail opens every message on arrival. Treat the answer as a hint.</Banner>
      )}
      <Banner icon="info">Replies are not a question here: a reply always stops the sequence.</Banner>
      <div className="grid g2">
        <Fld label="After the Yes path"><Sel value={x.afterYes || 'join'} onChange={v => set({ afterYes: v as 'join' | 'end' })} options={[['join', 'Join back'], ['end', 'End the sequence']]} disabled={!can} /></Fld>
        <Fld label="After the No path"><Sel value={x.afterNo || 'join'} onChange={v => set({ afterNo: v as 'join' | 'end' })} options={[['join', 'Join back'], ['end', 'End the sequence']]} disabled={!can} /></Fld>
      </div>
      <div className="faint xs">Add the steps for each path in the flow. An empty path goes straight to what follows it.</div>
    </>
  )
}
