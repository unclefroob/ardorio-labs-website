import { useState } from 'react'
import { Act } from '../../../data/Act'
import { Q } from '../../../data/Q'
import { S, useStore } from '../../../data/store'
import type { Contact, ListRec } from '../../../data/types'
import { BizDot, Btn, BulkBar, Card, Chip, DataTable, Empty, Icon, Menu, Owner, download, toCSV, type Col } from '../../../kit'
import { UI } from '../../../ui/store'
import { listMembers, readFilter } from './listMembers'
import { RowBtn } from './RowBtn'

function eligibility(c: Contact, l: ListRec) {
  if (Q.suppression(c.id, l.businessId)) return <Chip tone="bad">Suppressed</Chip>
  if (!c.email) return <Chip tone="warn">No email</Chip>
  if (!c.permission) return <Chip tone="warn">No basis</Chip>
  if (Q.activeEnrol(c.id).length) return <Chip tone="info">In sequence</Chip>
  return <Chip tone="ok">Eligible</Chip>
}

export function ListsInner({ id: id0 }: { id?: string }) {
  useStore()
  const ls = S.lists.filter(l => Q.inScope(l.businessId))
  const [id, setId] = useState<string | null>(id0 ?? ls[0]?.id ?? null)
  const [sel, setSel] = useState<string[]>([])
  const l = ls.find(x => x.id === id)
  const mem = l ? listMembers(l) : []
  const can = !!l && Q.canEdit(l.businessId)
  const canNew = Q.anyEdit()
  const newList = (): void => UI.open('listEdit', { onDone: (x: ListRec) => { setId(x.id); setSel([]) } })

  if (!ls.length) {
    return (
      <Card>
        <Empty
          icon="list" title="No lists yet"
          body="Lists group contacts for outreach. A static list holds contacts you pick; a dynamic list keeps itself up to date from saved filters."
          action={<Btn kind="pri" icon="plus" disabled={!canNew} onClick={newList}>Create list</Btn>}
        />
      </Card>
    )
  }

  const cols: Col<Contact>[] = l ? [
    { k: 'name', l: 'Name', r: c => <b>{c.name}</b> },
    { k: 'title', l: 'Title' },
    { k: 'co', l: 'Company', r: c => Q.company(c.companyId)?.name ?? '—', sort: c => Q.company(c.companyId)?.name },
    { k: 'email', l: 'Email', r: c => c.email || <Chip tone="warn">None</Chip> },
    { k: 's', l: 'Score', right: true, r: c => Q.score(c.id, l.businessId).total, sort: c => Q.score(c.id, l.businessId).total },
    { k: 'el', l: 'Eligibility', nosort: true, r: c => eligibility(c, l) },
    { k: 'o', l: 'Owner', nosort: true, r: c => <Owner id={Q.crel(c.id, l.businessId)?.ownerId} /> },
  ] : []

  const f = l ? readFilter(l.filter) : null

  return (
    <div className="grid two" style={{ gap: 14, alignItems: 'start' }}>
      <div className="card">
        <div className="card-h">
          <h3>Lists</h3>
          <div className="r"><Btn size="xs" icon="plus" disabled={!canNew} onClick={newList}>New</Btn></div>
        </div>
        {ls.map(x => (
          <RowBtn key={x.id} on={x.id === id} onClick={() => { setId(x.id); setSel([]) }}>
            <span className="row" style={{ width: '100%' }}>
              <BizDot b={x.businessId} />
              <b className="sm trunc" style={{ flex: 1 }}>{x.name}</b>
              <span className="faint xs">{listMembers(x).length}</span>
            </span>
            <span className="faint xs">{x.type === 'dynamic' ? 'Dynamic · saved filters' : 'Static'} · {Q.user(x.ownerId)?.name}</span>
          </RowBtn>
        ))}
      </div>
      {l && f ? (
        <div className="card">
          <div className="card-h" style={{ flexWrap: 'wrap' }}>
            <BizDot b={l.businessId} />
            <h3>{l.name}</h3>
            <Chip>{l.type}</Chip>
            <div className="r">
              {can && <Btn size="sm" icon="edit" onClick={() => UI.open('listEdit', { id: l.id })}>Edit</Btn>}
              {can && l.type === 'static' && (
                <Btn size="sm" icon="plus" onClick={() => UI.open('pickContacts', { title: 'Add contacts to ' + l.name, exclude: l.contactIds, onPick: (ids: string[]) => { Act.listAdd(l.id, ids); UI.toast(ids.length + ' added') } })}>Add contacts</Btn>
              )}
              <Btn size="sm" icon="download" disabled={!mem.length} onClick={() => download(l.name.replace(/\W+/g, '_') + '.csv', toCSV([['Name', 'Title', 'Company', 'Email', 'Phone']].concat(mem.map(c => [c.name, c.title, Q.company(c.companyId)?.name ?? '', c.email, c.phone]))))}>Export</Btn>
              {can && <Btn size="sm" kind="pri" icon="send" disabled={!mem.length} onClick={() => UI.open('enrol', { contactIds: sel.length ? sel : mem.map(c => c.id) })}>Enrol {sel.length ? sel.length : 'all'}</Btn>}
              {can && (
                <Menu align="right" trigger={<Btn size="sm" icon="more" aria-label="List actions" />} items={[{
                  label: 'Delete list', icon: 'trash',
                  onClick: () => UI.confirm({ title: 'Delete list?', body: 'Contacts are not deleted.', danger: true, confirm: 'Delete', onConfirm: () => { Act.deleteList(l.id); setId(null); setSel([]) } }),
                }]} />
              )}
            </div>
          </div>
          {l.type === 'dynamic' && (
            <div className="row wrap sm" style={{ padding: '8px 14px', borderBottom: '1px solid var(--line)' }}>
              <Icon n="filter" s={13} />
              {f.industry.length > 0 && <Chip>Industry: {f.industry.join(', ')}</Chip>}
              {f.state && <Chip>State: {f.state}</Chip>}
              {f.title && <Chip>Title matches: {f.title}</Chip>}
              {!f.industry.length && !f.state && !f.title && <span className="faint">No filters set, so every contact in this business matches</span>}
              <span className="faint xs">Membership updates automatically</span>
            </div>
          )}
          <BulkBar n={sel.length} clear={() => setSel([])}>
            {can && l.type === 'static' && <Btn size="sm" onClick={() => { Act.listRemove(l.id, sel); setSel([]) }}>Remove from list</Btn>}
            {Q.canManage(l.businessId) && <Btn size="sm" icon="swap" onClick={() => UI.open('reassign', { kind: 'contacts', ids: sel, businessId: l.businessId })}>Assign owner</Btn>}
          </BulkBar>
          <DataTable
            rows={mem} cols={cols} sel={sel} setSel={setSel} onRow={c => UI.nav('contact', { id: c.id })}
            empty={
              <Empty
                icon="users" title="No contacts in this list"
                body={l.type === 'dynamic' ? 'No contacts match the saved filters.' : 'Add contacts to get started.'}
                action={can && l.type === 'static'
                  ? <Btn kind="pri" icon="plus" onClick={() => UI.open('pickContacts', { title: 'Add contacts to ' + l.name, exclude: l.contactIds, onPick: (ids: string[]) => { Act.listAdd(l.id, ids); UI.toast(ids.length + ' added') } })}>Add contacts</Btn>
                  : can ? <Btn icon="edit" onClick={() => UI.open('listEdit', { id: l.id })}>Edit filters</Btn> : undefined}
              />
            }
          />
        </div>
      ) : (
        <Card><Empty icon="list" title="Select or create a list" body="Pick a list on the left to see its contacts." /></Card>
      )}
    </div>
  )
}
