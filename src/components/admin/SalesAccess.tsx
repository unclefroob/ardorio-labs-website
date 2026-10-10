import { useEffect, useState } from 'react'
import { createMember, updateMember } from '../../sales/api/members'
import { BUSINESS_IDS } from '../../sales/api/contract'
import type { BusinessId, Role, SalesUserDTO } from '../../sales/api/contract'
import { BUSINESS_NAMES, ROLE_OPTIONS } from './salesAccessState'
import type { SalesAccessState } from './salesAccessState'

type Choice = Role | ''

export function SalesAccessModal({ userId, name, access, onClose, onSaved }: {
  userId: string
  name: string
  access: SalesAccessState
  onClose: () => void
  onSaved: (flash: string) => void
}) {
  const me = access.me!
  const existing = access.members.get(userId)
  const [roles, setRoles] = useState<Record<BusinessId, Choice>>(() => {
    const init = {} as Record<BusinessId, Choice>
    for (const b of BUSINESS_IDS) init[b] = existing?.active ? (existing.m[b] ?? '') : ''
    return init
  })
  const [isSuper, setIsSuper] = useState(!!existing?.super && existing.active)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canEditBusiness = (b: BusinessId) => me.super || me.permissions[b].admin
  const anyAccess = isSuper || BUSINESS_IDS.some(b => roles[b])

  async function save() {
    setSaving(true)
    setError('')
    try {
      let saved: SalesUserDTO
      if (!existing) {
        if (!anyAccess) { onClose(); return }
        const chosen: Partial<Record<BusinessId, Role>> = {}
        for (const b of BUSINESS_IDS) if (roles[b]) chosen[b] = roles[b] as Role
        saved = await createMember({ userId, roles: chosen, ...(isSuper ? { super: true } : {}) })
      } else {
        const patch: Partial<Record<BusinessId, Role | null>> = {}
        for (const b of BUSINESS_IDS) {
          const before = existing.active ? (existing.m[b] ?? '') : ''
          if (canEditBusiness(b) && roles[b] !== before) patch[b] = roles[b] || null
        }
        // Switching everything off keeps the member record (and its history) and just deactivates it.
        const req = {
          ...(Object.keys(patch).length ? { roles: patch } : {}),
          ...(me.super && isSuper !== existing.super ? { super: isSuper } : {}),
          ...(anyAccess !== existing.active ? { active: anyAccess } : {}),
        }
        if (Object.keys(req).length === 0) { onClose(); return }
        saved = await updateMember(userId, req)
      }
      access.upsert(saved)
      onSaved(`Sales access updated for ${name}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const selectCls = 'bg-cream-100 border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-stone-400 disabled:opacity-50 min-w-0'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="sales-access-title"
        className="relative bg-cream-100 border border-cream-300 rounded-2xl p-8 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 id="sales-access-title" className="font-serif text-xl text-ink mb-1">Sales access</h2>
        <p className="text-stone-500 text-sm mb-6">
          Choose what {name} can do in SalesOS at ardorio.co/sales, per business. Leave every business on “No access” to switch it off.
        </p>

        <div className="space-y-3 mb-5">
          {BUSINESS_IDS.map(b => (
            <div key={b} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
              <label htmlFor={`sales-role-${b}`} className="label">{BUSINESS_NAMES[b]}</label>
              <select id={`sales-role-${b}`} className={selectCls} value={roles[b]} disabled={!canEditBusiness(b) || saving}
                onChange={e => setRoles(r => ({ ...r, [b]: e.target.value as Choice }))}>
                <option value="">No access</option>
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>

        {me.super && (
          <label className="flex items-start gap-2 text-sm text-ink mb-5">
            <input type="checkbox" className="mt-1" checked={isSuper} disabled={saving} onChange={e => setIsSuper(e.target.checked)} />
            <span>Super admin <span className="text-stone-500">(admin in every business, can manage other super admins)</span></span>
          </label>
        )}
        {!me.super && BUSINESS_IDS.some(b => !canEditBusiness(b)) && (
          <p className="text-stone-500 text-xs mb-5">You can only change the businesses where you are an admin.</p>
        )}

        {error && <p role="alert" className="font-mono text-xs text-red-500 mb-4">{error}</p>}

        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving…' : 'Save access'}</button>
          <button onClick={onClose} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors px-3">Cancel</button>
        </div>
      </div>
    </div>
  )
}
