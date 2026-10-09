import { useState } from 'react'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import { S } from '../../../data/store'
import type { SeqStep } from '../../../data/types'
import { Banner, Btn, Card, Chip, Ck, Fld, Icon, Inp, Menu, RichText, Seg, Sel, TA } from '../../../kit'
import { TOKENS } from '../../../kit/util'
import { STEP } from '../../../shared/constants'
import { CONDS, str, type Draft } from './conds'

interface Props {
  x: SeqStep
  i: number
  n: number
  set: (p: Partial<SeqStep>) => void
  mv: (i: number, d: number) => void
  del: (i: number) => void
  can: boolean
  dr: Draft
}

function Preview({ x, dr }: { x: SeqStep; dr: Draft }) {
  const pool = S.contacts.filter(c => !c.archived && Q.crel(c.id, dr.businessId)).slice(0, 40)
  const [pc, setPc] = useState(pool[0]?.id ?? '')
  const ct = pool.find(c => c.id === pc) ?? pool[0]
  const tok = Q.tokens(ct, Q.senderOf(Q.mailbox(dr.mailboxId)), dr.businessId)
  const sj = Q.render(x.subject || '', tok)
  const bd = Q.render(F.plain(x.body || ''), tok)
  const miss = [...new Set(sj.missing.concat(bd.missing))]
  const html = F.body(bd.text).replace(/\{\{(\w+)\}\}/g, '<mark style="background:var(--warn-bg);color:var(--warn)">{{$1}}</mark>')
  return (
    <div className="card card-b" style={{ background: 'var(--surf2)' }}>
      <div className="row xs" style={{ marginBottom: 6 }}>
        <Icon n="eye" s={12} />
        {ct ? (
          <>
            <label htmlFor={'prev-' + x.id}>Live preview for</label>
            <Sel id={'prev-' + x.id} className="sm" style={{ width: 220 }} value={ct.id} onChange={setPc} options={pool.map(c => [c.id, c.name + ' · ' + (Q.company(c.companyId)?.name ?? 'No company')] as const)} />
            {miss.length > 0 && <Chip tone="warn">Missing: {miss.join(', ')} — step will be held</Chip>}
          </>
        ) : (
          <span className="faint">Preview shows tokens unfilled until this business has contacts.</span>
        )}
      </div>
      <div className="b sm">{sj.text || <span className="faint">No subject</span>}</div>
      <div className="sm" style={{ marginTop: 6, maxHeight: 220, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

export function StepEditor({ x, i, n, set, mv, del, can, dr }: Props) {
  const [ic, l] = STEP[x.type] ?? ['mail', x.type]
  const tpls = S.templates.filter(t => t.businessId === dr.businessId)
  const mb = Q.mailbox(dr.mailboxId)

  const delay = i === 0 && x.type !== 'wait' ? (
    <div className="faint sm">First step runs at enrolment start (within the sending window).</div>
  ) : (
    <div className="row" style={{ gap: 8 }}>
      <Fld label={x.type === 'wait' ? 'Wait for' : 'Delay after previous step'} style={{ width: 140 }}>
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
      title={<span className="row"><Icon n={ic} s={14} />Step {i + 1}: {l}</span>}
      right={can && (
        <>
          <Btn size="xs" kind="ghost" icon="up" disabled={i === 0} onClick={() => mv(i, -1)} aria-label="Move step up" />
          <Btn size="xs" kind="ghost" icon="down" disabled={i === n - 1} onClick={() => mv(i, 1)} aria-label="Move step down" />
          <Btn size="xs" kind="ghost" icon="trash" onClick={() => del(i)} aria-label="Delete step" />
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
            <Fld label="Subject" req><Inp value={x.subject} onChange={v => set({ subject: v })} disabled={!can} placeholder="Use {{company_name}} etc." /></Fld>
            <div className="fld">
              <span className="sm b" id={'body-' + x.id}>Body</span>
              {can ? (
                <RichText value={x.body || ''} onChange={v => set({ body: v })} tokens={TOKENS} minH={180} label="Email body" />
              ) : (
                <div className="rte" role="textbox" aria-readonly="true" aria-labelledby={'body-' + x.id} dangerouslySetInnerHTML={{ __html: F.body(x.body || '') }} />
              )}
            </div>
            <div className="faint xs">
              Sending window {dr.window[0]}:00–{dr.window[1]}:00{dr.businessDays ? ' on business days' : ''} · from {mb?.address ?? 'no mailbox selected'}
            </div>
            <Preview x={x} dr={dr} />
          </>
        )}
        {(x.type === 'call' || x.type === 'linkedin' || x.type === 'task') && (
          <>
            <Fld label="Task title"><Inp value={x.title} onChange={v => set({ title: v })} disabled={!can} /></Fld>
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
        {x.type === 'branch' && (
          <>
            <Fld label="Continue only if"><Sel value={x.cond} onChange={v => set({ cond: v })} options={CONDS} disabled={!can} /></Fld>
            <Fld label="Otherwise">
              <Seg value={x.onFalse || 'exit'} onChange={v => { if (can) set({ onFalse: v }) }} opts={[['exit', 'Exit sequence'], ['skip', 'Skip next step']]} />
            </Fld>
            {x.cond === 'clicked' && <Banner tone="warn">Opens and clicks are simulated, unreliable signals. Avoid using them as proof of interest.</Banner>}
          </>
        )}
        {x.type === 'wait' && <div className="faint sm">Holds the enrolment before the next step. Combine with business-day units to avoid weekends.</div>}
      </div>
    </Card>
  )
}
