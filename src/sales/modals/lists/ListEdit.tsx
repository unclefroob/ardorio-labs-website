import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import type { BusinessId, ListRec } from '../../data/types'
import { Banner, Btn, Fld, Inp, Modal, Sel, Seg } from '../../kit'
import { listMembers, readFilter, titleRegex } from '../../pages/inbox/parts/listMembers'
import { INDUSTRIES, STATES } from '../../shared/constants'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'

interface ListForm { name: string; businessId: BusinessId | ''; type: ListRec['type']; industry: string[]; state: string; title: string }

export function ListEdit({ id, onDone }: { id?: string; onDone?: (l: ListRec) => void }) {
  const l = Q.list(id)
  const editable = Q.myBiz().filter(b => Q.canEdit(b))
  const def = Q.defaultBiz()
  const b0: BusinessId | '' = l?.businessId ?? (def && Q.canEdit(def) ? def : (editable[0] ?? ''))
  const flt = readFilter(l?.filter)
  const [f, set] = useF<ListForm>({ name: l?.name ?? '', businessId: b0, type: l?.type ?? 'static', industry: flt.industry, state: flt.state, title: flt.title })

  if (!b0 || (l && !Q.canEdit(l.businessId))) {
    return (
      <Modal title={l ? 'Edit list' : 'New list'} icon="list" width={540} footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Banner tone="warn">You need edit access to a business before you can {l ? 'edit this list' : 'create a list'}.</Banner>
      </Modal>
    )
  }

  const rx = titleRegex(f.title)
  const badTitle = !!f.title && !rx
  const preview = f.type === 'dynamic' && f.businessId && !badTitle ? listMembers({ type: 'dynamic', businessId: f.businessId, contactIds: [], filter: { industry: f.industry, state: f.state, title: f.title } }).length : null

  const save = (): void => {
    if (!f.businessId) return
    if (!f.name.trim()) return UI.toast('Name required', 'bad')
    if (badTitle) return UI.toast('Title filter is not valid', 'bad')
    const x = Act.saveList({
      id: l?.id, name: f.name.trim(), businessId: f.businessId, type: f.type,
      filter: f.type === 'dynamic' ? { industry: f.industry, state: f.state, title: f.title } : undefined,
    })
    UI.close()
    onDone?.(x)
    UI.toast('List saved')
  }

  return (
    <Modal title={l ? 'Edit list' : 'New list'} icon="list" width={540} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save}>Save</Btn></>}>
      <div className="col gap12">
        <Fld label="Name" req><Inp value={f.name} onChange={v => set('name', v)} autoFocus /></Fld>
        <div className="grid g2">
          <Fld label="Business">
            <Sel value={f.businessId} onChange={v => set('businessId', editable.find(b => b === v) ?? f.businessId)} options={editable.map(b => [b, Q.biz(b)?.name ?? b] as const)} />
          </Fld>
          <Fld label="Type"><Seg value={f.type} onChange={v => set('type', v === 'dynamic' ? 'dynamic' : 'static')} opts={[['static', 'Static'], ['dynamic', 'Dynamic']]} /></Fld>
        </div>
        {f.type === 'dynamic' && (
          <>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="xs b" style={{ padding: 0, marginBottom: 4 }}>Industries</legend>
              <div className="row wrap" style={{ gap: 4 }}>
                {INDUSTRIES.map(i => (
                  <Btn key={i} size="xs" kind={f.industry.includes(i) ? 'pri' : undefined} aria-pressed={f.industry.includes(i)} onClick={() => set('industry', f.industry.includes(i) ? f.industry.filter(x => x !== i) : f.industry.concat(i))}>{i}</Btn>
                ))}
              </div>
            </fieldset>
            <div className="grid g2">
              <Fld label="State"><Sel value={f.state} onChange={v => set('state', v)} placeholder="Any" options={STATES} /></Fld>
              <Fld label="Title contains" hint="Use | for OR, e.g. CTO|Head of Digital" err={badTitle ? 'Not a valid pattern' : undefined}><Inp value={f.title} onChange={v => set('title', v)} /></Fld>
            </div>
            {preview != null && <div className="sm"><b>{preview}</b> contact{preview === 1 ? '' : 's'} currently match</div>}
          </>
        )}
      </div>
    </Modal>
  )
}
