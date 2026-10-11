import { useEffect, useRef, useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Contact } from '../../data/types'
import { Banner, Btn, Chip, Empty, Modal, Skel, Spinner } from '../../kit'
import { checkedLabel, fmtResets, formatPhone, isPhoneFailure, loadPhoneStatus, phoneKey, phoneLeft, revealPhone, TYPE_LABEL, usePhoneStatus, type PhoneDone, type PhoneFailure } from '../../phone/client'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from '../entities/guards'

const VENDOR: Record<string, string> = { leadmagic: 'LeadMagic', signalhire: 'SignalHire', wiza: 'Wiza' }
export const PHONE_NOTE = "For manual calls. Check the Do Not Call Register before cold calling, and don't text without consent."

const str = (ct: Contact, k: string): string => {
  const v = ct[k]
  return typeof v === 'string' ? v : ''
}

/** confidence may arrive as 0-1 or 0-100. */
export function confidenceText(c: number): string {
  const pct = c <= 1 ? c * 100 : c
  return `${Math.round(Math.min(100, Math.max(0, pct)))}% confidence`
}

const today = (): string => new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

/** One banner per way a lookup can fail. Nothing here names a vendor key or says why the server is unset. */
export function PhoneFailureBanner({ o, onRetry, onEdit }: { o: PhoneFailure; onRetry: () => void; onEdit: () => void }) {
  switch (o.status) {
    case 'notConfigured':
      return <Banner tone="warn">Phone lookup isn't set up. An admin needs to choose a provider on the server.</Banner>
    case 'cap':
      return <Banner tone="warn">Phone lookups are used up until {o.usage.resetsOn ? fmtResets(o.usage.resetsOn) : 'the 1st of next month'}.</Banner>
    case 'noInput':
      return (
        <Banner tone="warn" action={<Btn size="sm" onClick={onEdit}>Edit contact</Btn>}>
          Add the contact's LinkedIn URL or work email, or their name and company, to look up a mobile.
        </Banner>
      )
    case 'providerError':
      return <Banner tone="bad" action={<Btn size="sm" onClick={onRetry}>Try again</Btn>}><b>The phone lookup had a problem.</b> Try again in a few minutes.</Banner>
    case 'error':
      return <Banner tone="bad" action={<Btn size="sm" onClick={onRetry}>Retry</Btn>}><b>Lookup failed.</b> {o.message}</Banner>
    case 'cancelled':
      return <Banner tone="info">Cancelled. A request already sent may still have been counted.</Banner>
  }
}

export function FindMobile({ contactId }: { contactId?: string }) {
  const ct = Q.contact(contactId)
  if (!ct) return <MissingModal title="Find mobile" what="Contact" />
  const b = Q.primaryBiz(ct)
  if (b && !Q.canEdit(b)) return <NoEditModal title={'Find mobile — ' + ct.name} what="look up phone numbers" />
  return <FindMobileFlow ctId={ct.id} />
}

function FindMobileFlow({ ctId }: { ctId: string }) {
  useStore()
  const ct = Q.contact(ctId)
  const status = usePhoneStatus()
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<PhoneDone | PhoneFailure | null>(null)
  const [added, setAdded] = useState<Record<string, boolean>>({})
  const live = useRef<AbortController | null>(null)

  // Leaving the modal stops waiting. It cannot recall a request the server has already started.
  useEffect(() => () => live.current?.abort(), [])

  if (!ct) return <MissingModal title="Find mobile" what="Contact" />
  const b = Q.primaryBiz(ct)
  const st = status.s === 'ok' ? status.status : undefined
  const label = st?.label ?? (st?.provider ? VENDOR[st.provider] : undefined) ?? 'your provider'
  const left = phoneLeft(st?.usage)
  const capped = left === 0

  const run = async (): Promise<void> => {
    if (!b || busy || !st?.configured || capped) return
    if (!UI.guard(b, 'Finding a mobile')) return
    const ac = new AbortController()
    live.current = ac
    setBusy(true)
    setOut(null)
    setAdded({})
    const o = await revealPhone(ct.id, b, ac.signal)
    if (live.current !== ac) return
    live.current = null
    setBusy(false)
    setOut(o)
  }

  const cancel = (): void => {
    live.current?.abort()
    live.current = null
    setBusy(false)
    setOut({ status: 'cancelled' })
  }

  const editContact = (): void => {
    UI.close()
    UI.open('editContact', { id: ct.id })
  }

  // Applied only from a click, only when the viewer can edit, and never over a different number without a confirm.
  const add = (e164: string, type: 'mobile' | 'other' | 'unknown'): void => {
    if (!b || !UI.guard(b, 'Adding a number')) return
    const field = type === 'mobile' ? 'mobile' : 'phone'
    const value = formatPhone(e164)
    const have = str(ct, field).trim()
    const vendor = out && !isPhoneFailure(out) && out.provider ? VENDOR[out.provider] : label
    const doApply = (): void => {
      if (Act.applyPhoneLookup(ct.id, b, { field, value, source: `Phone lookup (${vendor}) ${today()}` })) {
        setAdded(a => ({ ...a, [e164]: true }))
        UI.toast(`${field === 'mobile' ? 'Mobile' : 'Phone'} added to ${ct.name}. Marked Unverified.`)
      }
    }
    if (have && phoneKey(have) === phoneKey(e164)) {
      setAdded(a => ({ ...a, [e164]: true }))
      return UI.toast(`${ct.name} already has this number.`)
    }
    if (have) {
      UI.confirm({
        title: `Replace ${field === 'mobile' ? 'mobile' : 'phone'}?`,
        body: `${ct.name} already has ${have} as their ${field === 'mobile' ? 'mobile' : 'phone'}. Replace it with ${value}?`,
        confirm: 'Replace',
        onConfirm: doApply,
      })
      return
    }
    doApply()
  }

  const done = out && !isPhoneFailure(out) ? out : null
  const failed = out && isPhoneFailure(out) ? out : null
  const checked = done ? checkedLabel(done.lastCheckedAt) : null

  let body
  if (!b) {
    body = <Banner tone="warn">This contact isn't linked to a business yet, so a lookup can't be billed. Link it to a business first.</Banner>
  } else if (busy) {
    body = (
      <div className="col gap12" style={{ padding: '10px 0' }} aria-busy="true">
        <div className="row"><Spinner />Looking up a mobile for {ct.name}…</div>
        <Skel rows={2} />
        <div className="faint xs">Cancelling stops waiting, but a request already sent may still be counted.</div>
      </div>
    )
  } else if (status.s === 'loading') {
    body = <div className="row" aria-busy="true"><Spinner />Checking phone lookup…</div>
  } else if (status.s === 'error') {
    body = <Banner tone="warn" action={<Btn size="sm" onClick={() => void loadPhoneStatus({ force: true })}>Retry</Btn>}>Couldn't check phone lookup just now.</Banner>
  } else if (!st?.configured) {
    body = <PhoneFailureBanner o={{ status: 'notConfigured' }} onRetry={() => void run()} onEdit={editContact} />
  } else if (failed) {
    body = (
      <div className="col gap12">
        <PhoneFailureBanner o={failed} onRetry={() => void run()} onEdit={editContact} />
        {(failed.status === 'cancelled') && !capped && <div><Btn kind="pri" icon="phone" onClick={() => void run()}>Find mobile</Btn></div>}
      </div>
    )
  } else if (done) {
    body = (
      <div className="col gap12">
        {done.status === 'not_found' || !done.numbers.length ? (
          <Empty icon="search" title={done.charged ? 'Not found' : 'Not found, no charge'} body={done.charged ? `${label} had no usable number for ${ct.name}. This lookup was still counted.` : `${label} had no number for ${ct.name}.`} />
        ) : (
          <div className="col" style={{ gap: 0, border: '1px solid var(--line)', borderRadius: 8 }} role="list" aria-label="Numbers found">
            {done.numbers.map(n => {
              const field = n.type === 'mobile' ? 'mobile' : 'phone'
              const have = str(ct, field).trim()
              const same = !!have && phoneKey(have) === phoneKey(n.e164)
              const isAdded = !!added[n.e164] || same
              return (
                <div key={n.e164} role="listitem" className="row wrap" style={{ gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
                  <b>{formatPhone(n.e164)}</b>
                  <Chip tone={n.type === 'mobile' ? 'ok' : ''}>{TYPE_LABEL[n.type]}</Chip>
                  {typeof n.confidence === 'number' && <Chip>{confidenceText(n.confidence)}</Chip>}
                  <span className="sp" />
                  {have && !same && <span className="faint xs">replaces {have}</span>}
                  {isAdded
                    ? <Chip tone="ok" icon="check">{same && !added[n.e164] ? 'Already set' : 'Added, Unverified'}</Chip>
                    : <Btn size="sm" kind="pri" onClick={() => add(n.e164, n.type)}>{n.type === 'mobile' ? 'Add as mobile' : 'Add as phone'}</Btn>}
                </div>
              )
            })}
          </div>
        )}
        {checked && <div className="faint xs">{checked}</div>}
        <div className="faint xs">{PHONE_NOTE}</div>
      </div>
    )
  } else if (capped && st) {
    body = <PhoneFailureBanner o={{ status: 'cap', usage: st.usage }} onRetry={() => void run()} onEdit={editContact} />
  } else {
    body = (
      <div className="col gap12">
        <div className="muted sm">
          Looks up a mobile number for {ct.name}{Q.company(ct.companyId)?.name ? ' at ' + Q.company(ct.companyId)?.name : ''}. Nothing is added to the contact unless you click to add it.
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Chip icon="phone">Phone lookup: {label}</Chip>
          {st && left !== null && <span className="sm muted">{left} of {st.usage.limit} phone lookups left this month (resets {fmtResets(st.usage.resetsOn)})</span>}
        </div>
        <div><Btn kind="pri" icon="phone" onClick={() => void run()}>Find mobile</Btn></div>
        <div className="faint xs">{PHONE_NOTE}</div>
      </div>
    )
  }

  return (
    <Modal
      title={'Find mobile — ' + ct.name}
      icon="phone"
      width={560}
      footer={busy ? <Btn onClick={cancel}>Cancel search</Btn> : <Btn onClick={UI.close}>Close</Btn>}
    >
      <div aria-live="polite">{body}</div>
    </Modal>
  )
}
