import { useState, type FC } from 'react'
import { Act } from '../../../data/Act'
import { F } from '../../../data/F'
import { Q } from '../../../data/Q'
import type { BusinessId, Note } from '../../../data/types'
import { Av, BizDot, Btn, Chip, Empty, Icon, Sel, TA } from '../../../kit'
import { UI } from '../../../ui/store'

export interface NotesProps { kind: 'company' | 'contact' | 'deal'; id: string; b: BusinessId; notes: Note[] }

interface Editing { id: string; body: string }

export const Notes: FC<NotesProps> = ({ kind, id, b, notes }) => {
  const [text, setText] = useState('')
  const [vis, setVis] = useState<'business' | 'private'>('business')
  const [ed, setEd] = useState<Editing | null>(null)
  const me = Q.me()
  const can = Q.canEdit(b)
  const all = notes ?? []
  const list = all.filter(n => (n.visibility !== 'private' || n.by === me.id) && (!n.businessId || Q.member(n.businessId)))
  const hidden = all.length - list.length
  const bizName = Q.biz(b)?.name ?? 'business'
  const add = (): void => {
    if (!text.trim()) return
    Act.addNote(kind, id, text, b, vis)
    setText('')
    UI.toast('Note added')
  }
  return (
    <div className="col gap12">
      {can && (
        <div className="card card-b col">
          <TA value={text} onChange={setText} rows={3} placeholder="Add a note…" aria-label="New note" />
          <div className="row">
            <Sel
              className="sm"
              style={{ width: 200 }}
              aria-label="Note visibility"
              value={vis}
              onChange={v => setVis(v === 'private' ? 'private' : 'business')}
              options={[['business', 'Visible to ' + bizName + ' team'], ['private', 'Private to me']]}
            />
            <span className="sp" />
            <Btn kind="pri" size="sm" disabled={!text.trim()} onClick={add}>Add note</Btn>
          </div>
        </div>
      )}
      {list.map(n => (
        <div key={n.id} className="card card-b">
          <div className="row xs faint" style={{ marginBottom: 6 }}>
            <Av u={Q.user(n.by)} s={18} />
            <span>{Q.user(n.by)?.name ?? 'Unknown user'}</span>·<span>{F.dt(n.ts)}</span>
            {n.edited && <span>· edited</span>}
            {n.businessId && <BizDot b={n.businessId} s={6} />}
            {n.visibility === 'private' && <Chip icon="lock">Private</Chip>}
            <span className="sp" />
            {n.by === me.id && (
              <>
                <Btn size="xs" kind="ghost" icon="edit" aria-label="Edit note" onClick={() => setEd({ id: n.id, body: n.body })} />
                <Btn size="xs" kind="ghost" icon="trash" aria-label="Delete note" onClick={() => UI.confirm({ title: 'Delete this note?', body: 'The note is removed for everyone who can see it.', confirm: 'Delete', danger: true, onConfirm: () => Act.deleteNote(kind, id, n.id) })} />
              </>
            )}
          </div>
          {ed && ed.id === n.id ? (
            <div className="col">
              <TA value={ed.body} onChange={v => setEd({ id: n.id, body: v })} aria-label="Edit note text" />
              <div className="row">
                <Btn size="sm" kind="pri" disabled={!ed.body.trim()} onClick={() => { Act.editNote(kind, id, n.id, ed.body); setEd(null) }}>Save</Btn>
                <Btn size="sm" onClick={() => setEd(null)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <div className="sm" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
          )}
        </div>
      ))}
      {!list.length && (
        <Empty icon="note" title="No notes yet" body={can ? 'Capture context the next person will need. Notes can be kept private to you.' : 'Notes added by your team will appear here.'} />
      )}
      {hidden > 0 && (
        <div className="faint xs">
          <Icon n="lock" s={11} /> {hidden} restricted note{hidden > 1 ? 's' : ''} not shown
        </div>
      )}
    </div>
  )
}
