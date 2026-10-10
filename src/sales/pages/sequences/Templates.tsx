import { useState } from 'react'
import { Act, type TemplateInput } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { BusinessId, Template } from '../../data/types'
import { draft as aiDraft, type AiTag } from '../../ai/client'
import { AiBadge, AiNotConfigured, BizDot, Btn, Card, Chip, Empty, FilterBar, Fld, Icon, Inp, RichText, SearchInp, Sel, Toggle } from '../../kit'
import { TOKENS } from '../../kit/util'
import { PageHead } from '../../shared/PageHead'
import { UI, type Route } from '../../ui/store'
import { RowBtn } from '../inbox/parts/RowBtn'

const CATS = ['Cold introduction', 'Follow-up', 'Meeting request', 'Demo follow-up', 'Proposal follow-up', 'Case study', 'Re-engagement', 'Referral introduction', 'Thank-you email', 'Post-meeting recap']

interface Form { name: string; category: string; subject: string; body: string; shared: boolean }

const formOf = (t: Template): Form => ({ name: t.name, category: t.category, subject: t.subject, body: t.body, shared: t.shared })
const swap = (s: string, from: string | undefined, to: string): string => (from ? s.split(from).join(to) : s)

function newBiz(): BusinessId | undefined {
  const d = Q.defaultBiz()
  return d && Q.canEdit(d) ? d : Q.editScope()[0]
}

export function Templates({ route }: { route: Route }) {
  useStore()
  const sc = Q.scope()
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [id, setId] = useState<string | undefined>(route.id)

  const inScope = S.templates.filter(t => Q.inScope(t.businessId))
  const list = inScope.filter(t => (!cat || t.category === cat) && (!q || t.name.toLowerCase().includes(q.toLowerCase())))
  const picked = Q.template(id)
  const t = picked && Q.inScope(picked.businessId) ? picked : list[0]
  const nb = newBiz()

  const create = (): void => {
    if (!nb) return UI.toast('You need edit access to a business to create a template', 'bad')
    const n = Act.saveTemplate({ name: 'New template', businessId: nb, category: 'Cold introduction', subject: '', body: '' })
    setCat('')
    setQ('')
    setId(n.id)
  }

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <PageHead title="Email templates" sub="Business-specific libraries with personalisation tokens">
        <Btn kind="pri" icon="plus" disabled={!nb} title={nb ? undefined : 'Needs edit access'} onClick={create}>New template</Btn>
      </PageHead>
      {inScope.length === 0 ? (
        <div className="card">
          <Empty
            icon="file" title="No templates yet"
            body={nb ? 'Save reusable emails with personalisation tokens, then insert them into sequence steps.' : 'No templates have been created for your businesses yet.'}
            action={nb ? <Btn kind="pri" icon="plus" onClick={create}>New template</Btn> : undefined}
          />
        </div>
      ) : (
        <div className="grid two" style={{ gap: 14, alignItems: 'start' }}>
          <div className="card">
            <FilterBar>
              <SearchInp value={q} onChange={setQ} placeholder="Search templates" w={9999} />
              <Sel className="sm" aria-label="Category" value={cat} onChange={setCat} placeholder="All categories" options={CATS} />
            </FilterBar>
            <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {sc.map(b => {
                const ts = list.filter(x => x.businessId === b)
                if (!ts.length) return null
                return (
                  <div key={b}>
                    <div className="mlab" style={{ padding: '10px 12px 4px' }}><BizDot b={b} /> {Q.biz(b)?.name}</div>
                    {ts.map(x => (
                      <RowBtn key={x.id} on={x.id === t?.id} onClick={() => setId(x.id)}>
                        <b className="sm">{x.name}</b>
                        <span className="faint xs">{x.category} · {Q.user(x.ownerId)?.name ?? 'Unknown'}{x.shared ? ' · shared' : ' · private'}</span>
                      </RowBtn>
                    ))}
                  </div>
                )
              })}
              {!list.length && (
                <Empty icon="search" title="No templates match" body="Nothing matches the current search or category." action={<Btn onClick={() => { setQ(''); setCat('') }}>Clear filters</Btn>} />
              )}
            </div>
          </div>
          {t ? <TemplateEditor key={t.id} t={t} onGone={() => setId(undefined)} onPick={setId} /> : <Card><Empty icon="file" title="Select a template" body="Choose a template from the list to view or edit it." /></Card>}
        </div>
      )}
    </div>
  )
}

function TemplateEditor({ t, onGone, onPick }: { t: Template; onGone: () => void; onPick: (id: string) => void }) {
  const [f, setF] = useState<Form>(() => formOf(t))
  const [pc, setPc] = useState('')
  const [busy, setBusy] = useState(false)
  const [tag, setTag] = useState<AiTag | null>(null)
  const set = (p: Partial<Form>): void => setF(prev => ({ ...prev, ...p }))

  const biz = Q.biz(t.businessId)
  const can = Q.canEdit(t.businessId) && (t.ownerId === Q.me().id || Q.canManage(t.businessId) || t.shared)
  const canDel = Q.canEdit(t.businessId) && (t.ownerId === Q.me().id || Q.canAdmin(t.businessId))
  const dirty = JSON.stringify(f) !== JSON.stringify(formOf(t))

  const pool = S.contacts.filter(c => !c.archived && Q.crel(c.id, t.businessId)).slice(0, 30)
  const ct = pool.find(c => c.id === pc) ?? pool[0]
  const tok = Q.tokens(ct, Q.me(), t.businessId)
  const rs = Q.render(f.subject, tok)
  const rb = Q.render(f.body, tok)
  const missing = [...new Set(Q.render(f.subject + F.plain(f.body), tok).missing)]

  const save = (): void => {
    Act.saveTemplate({ id: t.id, name: f.name.trim() || t.name, businessId: t.businessId, category: f.category, subject: f.subject, body: f.body, shared: f.shared })
    UI.toast('Template saved')
  }
  const dup = (): void => {
    const copy: TemplateInput = { ...t, name: t.name + ' (copy)', ownerId: Q.me().id, createdAt: F.nowIso() }
    delete copy.id
    const n = Act.saveTemplate(copy)
    onPick(n.id)
    UI.toast('Duplicated')
  }
  const remove = (): void =>
    UI.confirm({
      title: 'Delete template?', body: 'Sequences that copied this template keep their own content.', danger: true, confirm: 'Delete',
      onConfirm: () => {
        Act.deleteTemplate(t.id)
        onGone()
      },
    })
  const aiDraftBody = async (): Promise<void> => {
    if (!ct) return UI.toast('Add a contact to this business first, so the draft has someone to write to', 'bad')
    setBusy(true)
    try {
      const r = await aiDraft(ct, t.businessId, 'intro')
      const co = Q.company(ct.companyId)
      const coName = co ? String(co.tradingName || co.name) : undefined
      const tokenise = (s: string): string => swap(swap(swap(s, ct.firstName, '{{first_name}}'), coName, '{{company_name}}'), Q.me().name, '{{sender_name}}')
      setF(prev => ({ ...prev, subject: prev.subject || tokenise(r.value.subject), body: tokenise(r.value.body) }))
      setTag(r.ai)
    } catch {
      UI.toast('The AI draft could not be generated. Try again shortly.', 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={<span className="row"><BizDot b={t.businessId} />{t.name}</span>}
      right={
        <>
          {canDel && <Btn size="sm" kind="danger" icon="trash" aria-label="Delete template" onClick={remove} />}
          <Btn size="sm" icon="copy" disabled={!Q.canEdit(t.businessId)} onClick={dup}>Duplicate</Btn>
          {can && <Btn size="sm" kind="pri" disabled={!dirty} onClick={save}>Save</Btn>}
        </>
      }
    >
      {!can && <div className="faint sm" style={{ marginBottom: 10 }}><Icon n="lock" s={12} /> Read-only. This template is private to its owner or you need edit access.</div>}
      <div className="grid g3">
        <Fld label="Name"><Inp value={f.name} onChange={v => set({ name: v })} disabled={!can} /></Fld>
        <Fld label="Category"><Sel value={f.category} onChange={v => set({ category: v })} placeholder={f.category ? null : 'Choose a category'} options={f.category && !CATS.includes(f.category) ? [f.category, ...CATS] : CATS} disabled={!can} /></Fld>
        <Fld label="Sharing">
          <div className="row">
            <Toggle on={f.shared} label="Shared with the business" disabled={!can} onChange={v => set({ shared: v })} />
            <span className="sm">{f.shared ? 'Shared with ' + (biz?.name ?? t.businessId) : 'Private'}</span>
          </div>
        </Fld>
      </div>
      <div className="col gap12" style={{ marginTop: 12 }}>
        <Fld label="Subject"><Inp value={f.subject} onChange={v => set({ subject: v })} disabled={!can} /></Fld>
        <div className="fld">
          <span className="sm b" id={'tb-' + t.id}>Body</span>
          {can ? (
            <RichText value={f.body} onChange={v => set({ body: v })} tokens={TOKENS} minH={220} label="Template body" onAI={() => { void aiDraftBody() }} aiBusy={busy} />
          ) : (
            <div className="rte" role="textbox" aria-readonly="true" aria-labelledby={'tb-' + t.id} dangerouslySetInnerHTML={{ __html: F.body(f.body) }} />
          )}
        </div>
        {can && (
          <div className="row wrap xs" style={{ gap: 8 }}>
            <AiBadge tag={tag} />
            {!tag && <AiNotConfigured />}
            <span className="faint">AI drafting uses {biz?.name} positioning: “{biz?.style}” It never invents customer results.</span>
          </div>
        )}
        <div className="card card-b" style={{ background: 'var(--surf2)' }}>
          <div className="row xs" style={{ marginBottom: 6 }}>
            <Icon n="eye" s={12} />
            {ct ? (
              <>
                <label htmlFor={'tp-' + t.id}>Test preview with</label>
                <Sel id={'tp-' + t.id} className="sm" style={{ width: 240 }} value={ct.id} onChange={setPc} options={pool.map(c => [c.id, c.name + ' · ' + (Q.company(c.companyId)?.name ?? 'No company')] as const)} />
              </>
            ) : (
              <span className="faint">Preview shows tokens unfilled until this business has contacts.</span>
            )}
            {ct && missing.length > 0 && <Chip tone="warn">Unresolved: {missing.join(', ')}</Chip>}
          </div>
          <div className="b sm">{rs.text || <span className="faint">No subject</span>}</div>
          <div className="sm" style={{ marginTop: 6 }} dangerouslySetInnerHTML={{ __html: F.body(rb.text) }} />
        </div>
        <div className="faint xs">Owner {Q.user(t.ownerId)?.name ?? 'Unknown'} · created {F.date(t.createdAt)} · modified {F.rel(t.updatedAt)}</div>
      </div>
    </Card>
  )
}
