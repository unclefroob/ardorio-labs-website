import { useCallback, useEffect, useState } from 'react'
import { getCandidates } from '../../api/members'
import { SalesHttpError } from '../../api/http'
import type { MemberCandidate, Role } from '../../api/contract'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId } from '../../data/types'
import { Banner, BizDot, Btn, Ck, Empty, Fld, Inp, Modal, Sel, Skel, Spinner } from '../../kit'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'

interface Props { id?: string }
interface Form { userId: string; title: string; m: Partial<Record<BusinessId, Role>>; super: boolean }

const ROLES: ReadonlyArray<readonly [string, string]> = [
  ['', 'No access'],
  ['viewer', 'Viewer — read only'],
  ['sales', 'Sales — sales user'],
  ['manager', 'Manager — team manager'],
  ['admin', 'Admin — business admin'],
]

type Cands = { s: 'loading' } | { s: 'error'; msg: string } | { s: 'ready'; list: MemberCandidate[] }

function useCandidates(enabled: boolean): [Cands, () => void] {
  const [n, setN] = useState(0)
  const [res, setRes] = useState<{ n: number; c: Cands } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    getCandidates()
      .then(r => { if (live) setRes({ n, c: { s: 'ready', list: r.candidates } }) })
      .catch((e: unknown) => { if (live) setRes({ n, c: { s: 'error', msg: e instanceof SalesHttpError ? e.message : "Couldn't reach the server" } }) })
    return () => { live = false }
  }, [enabled, n])
  const c: Cands = res && res.n === n ? res.c : { s: 'loading' }
  return [c, useCallback(() => setN(x => x + 1), [])]
}

export function UserEdit({ id }: Props) {
  const u = id ? S.users.find(x => x.id === id) : undefined
  const [f, set] = useF<Form>(u
    ? { userId: u.id, title: u.title, m: { ...u.m }, super: u.super }
    : { userId: '', title: '', m: {}, super: false })
  const [cands, retry] = useCandidates(!u && Q.anyAdmin())
  const [busy, setBusy] = useState(false)

  if (!Q.anyAdmin() || (id && !u) || (u?.super && !Q.isSuper())) {
    return (
      <Modal title={u ? `Edit ${u.name}` : 'Add user'} icon="user" width={560} footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Banner tone={id && !u ? 'bad' : 'warn'}>{id && !u ? 'This user no longer exists.' : 'Only business admins can manage user access.'}</Banner>
      </Modal>
    )
  }
  const editable = (b: BusinessId): boolean => Q.canAdmin(b)
  const picked = cands.s === 'ready' ? cands.list.find(c => c.userId === f.userId) : undefined

  const save = async (): Promise<void> => {
    if (!u && !f.userId) {
      UI.toast('Choose who to add', 'bad')
      return
    }
    const m: Partial<Record<BusinessId, Role>> = {}
    for (const b of S.businesses) {
      const r = f.m[b.id]
      if (r) m[b.id] = r
    }
    if (!f.super && !Object.keys(m).length) {
      UI.toast('Assign at least one business', 'bad')
      return
    }
    setBusy(true)
    const saved = await Act.saveUser({ id: u?.id, userId: u ? undefined : f.userId, m, super: Q.isSuper() ? f.super : undefined, title: f.title.trim() })
    setBusy(false)
    if (!saved) return
    UI.close()
    UI.toast(u ? 'Access updated, takes effect immediately' : `${saved.name} added to SalesOS`)
  }

  return (
    <Modal
      title={u ? `Edit ${u.name}` : 'Add user'}
      sub={u ? u.email : 'Give an existing login access to SalesOS'}
      icon="user"
      width={560}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" disabled={busy || (!u && cands.s !== 'ready')} onClick={() => { void save() }}>{busy ? <><Spinner />Saving…</> : 'Save'}</Btn>
        </>
      }
    >
      {!u && (
        <div style={{ marginBottom: 12 }}>
          {cands.s === 'loading' && <Skel rows={2} />}
          {cands.s === 'error' && (
            <Banner tone="bad" action={<Btn size="sm" onClick={retry}>Retry</Btn>}>Couldn't load people who can be added. {cands.msg}</Banner>
          )}
          {cands.s === 'ready' && !cands.list.length && (
            <Empty icon="user" title="Nobody left to add" body="Every login that can use SalesOS already has access. Create the login first, then come back here." />
          )}
          {cands.s === 'ready' && cands.list.length > 0 && (
            <Fld label="Person" req hint={picked ? picked.email : 'Only existing logins that are not yet SalesOS members are listed.'}>
              <Sel
                value={f.userId}
                onChange={v => set('userId', v)}
                placeholder="Select…"
                options={cands.list.map(c => [c.userId, `${c.displayName || c.username}${c.invitePending ? ' (invite pending)' : ''}`] as const)}
              />
            </Fld>
          )}
        </div>
      )}
      <div className="grid g2">
        {u && <Fld label="Name"><Inp value={u.name} disabled readOnly /></Fld>}
        {u && <Fld label="Email"><Inp value={u.email} disabled readOnly /></Fld>}
        <Fld label="Title" style={{ gridColumn: '1/-1' }}><Inp value={f.title} onChange={v => set('title', v)} /></Fld>
      </div>
      <div className="b sm" style={{ margin: '14px 0 8px' }}>Business membership & role</div>
      {Q.isSuper() && <Ck checked={f.super} onChange={v => set('super', v)}>Super Administrator (all businesses)</Ck>}
      {!f.super && (
        <div className="col" style={{ gap: 6, marginTop: 8 }}>
          {S.businesses.map(b => (
            <div key={b.id} className="row">
              <BizDot b={b.id} />
              <span style={{ width: 90 }} className="sm">{b.name}</span>
              <Sel
                className="sm"
                style={{ width: 220 }}
                aria-label={`${b.name} role`}
                value={f.m[b.id] ?? ''}
                onChange={v => set('m', { ...f.m, [b.id]: v === '' ? undefined : (v as Role) })}
                disabled={!editable(b.id)}
                options={ROLES}
              />
              {!editable(b.id) && <span className="faint xs">Not your business</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
