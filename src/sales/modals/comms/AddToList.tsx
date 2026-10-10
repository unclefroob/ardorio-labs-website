import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import { Banner, Btn, Fld, Inp, Modal, Sel } from '../../kit'
import { UI } from '../../ui/store'
import { NoEditModal } from '../entities/guards'

const NEW = '__new'

export function AddToList({ contactIds }: { contactIds?: string[] }) {
  if (!Q.anyEdit()) return <NoEditModal title="Add to list" what="manage lists" />
  return <AddToListForm ids={contactIds ?? []} />
}

function AddToListForm({ ids }: { ids: string[] }) {
  useStore()
  const ls = S.lists.filter(l => l.type === 'static' && Q.editScope().includes(l.businessId))
  const [id, setId] = useState(ls[0]?.id ?? NEW)
  const [nm, setNm] = useState('')

  const add = (): void => {
    let lid = id
    if (id === NEW) {
      const biz = Q.defaultBiz()
      if (!nm.trim()) return UI.toast('Name the list', 'bad')
      if (!biz) return UI.toast('You need edit access to a business to create a list', 'bad')
      lid = Act.saveList({ name: nm.trim(), businessId: biz, type: 'static' }).id
    }
    Act.listAdd(lid, ids)
    UI.close()
    UI.toast('Added to ' + (Q.list(lid)?.name ?? 'list'), undefined, { label: 'Open list', fn: () => UI.nav('lists', { id: lid }) })
  }

  return (
    <Modal
      title={'Add ' + ids.length + ' contact' + (ids.length === 1 ? '' : 's') + ' to list'}
      icon="list"
      width={460}
      footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" disabled={!ids.length} onClick={add}>Add</Btn></>}
    >
      <div className="col gap12">
        {!ids.length && <Banner tone="warn">No contacts are selected. Select contacts first, then add them to a list.</Banner>}
        {!ls.length && <Banner tone="info">There are no static lists yet. Name one below to create it.</Banner>}
        <Fld label="List">
          <Sel value={id} onChange={setId} options={ls.map(l => [l.id, (Q.biz(l.businessId)?.name ?? '') + ' · ' + l.name] as const).concat([[NEW, '+ Create new static list'] as const])} />
        </Fld>
        {id === NEW && <Fld label="New list name"><Inp value={nm} onChange={setNm} autoFocus /></Fld>}
        <div className="faint sm">Dynamic lists update automatically from their filters and can't be added to manually.</div>
      </div>
    </Modal>
  )
}
