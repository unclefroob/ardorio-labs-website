import { useState } from 'react'
import { Q } from '../../data/Q'
import { Btn, Ck, Empty, Modal, SearchInp } from '../../kit'
import { UI } from '../../ui/store'

interface Props { title?: string; onPick?: (ids: string[]) => void; exclude?: string[] }

export function PickContacts({ title, onPick, exclude }: Props) {
  const [q, setQ] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const needle = q.toLowerCase()
  const all = Q.contacts().filter(c => !(exclude ?? []).includes(c.id))
  const matches = all.filter(c => !needle || (c.name + ' ' + c.title + ' ' + (Q.company(c.companyId)?.name ?? '')).toLowerCase().includes(needle))
  const pool = matches.slice(0, 80)

  return (
    <Modal
      title={title ?? 'Select contacts'}
      width={560}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" disabled={!ids.length || !onPick} onClick={() => { UI.close(); onPick?.(ids) }}>Add {ids.length || ''}</Btn>
        </>
      }
    >
      <SearchInp value={q} onChange={setQ} w={2000} placeholder="Search name, title or company" />
      {pool.length ? (
        <div className="col" style={{ gap: 2, maxHeight: 360, overflow: 'auto', marginTop: 8 }}>
          {pool.map(c => (
            <Ck key={c.id} checked={ids.includes(c.id)} onChange={v => setIds(v ? ids.concat(c.id) : ids.filter(x => x !== c.id))}>
              <span className="sm">{c.name} <span className="faint">· {c.title} · {Q.company(c.companyId)?.name}</span></span>
            </Ck>
          ))}
          {matches.length > pool.length && <div className="faint xs" style={{ padding: 4 }}>Showing the first {pool.length} of {matches.length}. Search to narrow the list.</div>}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <Empty icon="users" title={needle ? 'No contacts match' : all.length === 0 && (exclude ?? []).length ? 'Everyone is already added' : 'No contacts yet'} body={needle ? 'Try a different name, title or company.' : 'Contacts you add or import will appear here.'} />
        </div>
      )}
    </Modal>
  )
}
