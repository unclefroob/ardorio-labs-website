import { useState, type FocusEvent, type MouseEvent } from 'react'
import { useStore } from '../data/store'
import { S } from '../data/store'
import { Act } from '../data/Act'
import { F } from '../data/F'
import { Q } from '../data/Q'
import { Icon, Menu, type MenuItem } from '../kit'
import { useMailState } from '../mail/client'
import { navParent } from '../routes'
import { UI, useUi } from '../ui/store'
import { NAV, navItemVisible } from './nav'

function counts(): Record<string, number> {
  const me = Q.me()
  const today = F.today()
  return {
    myday: S.tasks.filter(t => t.assigneeId === me.id && Q.inScope(t.businessId) && !Q.done(t) && t.status !== 'Snoozed' && t.due.slice(0, 10) <= today).length,
    inbox: Q.threads().filter(t => t.unread && !t.archived && Q.threadBody(t)).length,
    notifications: Q.notifs().filter(n => !n.read).length,
    recs: S.recs.filter(r => r.status === 'New' && Q.inScope(r.businessId)).length,
  }
}

/** What each count means, so it is read out as "Inbox, 3 unread", not "Inbox 3". */
const COUNT_WORD: Record<string, string> = { inbox: 'unread', myday: 'due today', recs: 'new', notifications: 'unread' }

const ADMIN_KEY = 'sos.sidebar.admin'
const readOpen = (): boolean => { try { return localStorage.getItem(ADMIN_KEY) === '1' } catch { return false } }

export function Sidebar() {
  const live = useMailState().s === 'live'
  useStore()
  const ui = useUi()
  const ws = S.session.ws
  const bz = Q.biz(ws)
  const mine = Q.myBiz()
  const cnt = counts()
  const active = navParent(ui.route.page)
  const admin = Q.anyAdmin()
  // Folded to icons: each item keeps its name for screen readers, and shows it beside the icon on hover and on keyboard focus.
  const rail = ui.rail
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null)
  const showTip = (text: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>): void => {
    if (!rail) return
    // On focus only when it came from the keyboard: a click focuses too, and the label would linger over an opened menu.
    if (e.type === 'focus' && !e.currentTarget.matches(':focus-visible')) return
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ text, top: r.top + r.height / 2 })
  }
  const tipProps = (text: string) => ({ onMouseEnter: showTip(text), onFocus: showTip(text), onMouseLeave: () => setTip(null), onBlur: () => setTip(null), onMouseDown: () => setTip(null) })
  // Administration is used rarely: closed unless you open it (remembered) or are on one of its pages.
  const [adminOpen, setAdminOpen] = useState(readOpen)
  const toggleAdmin = (): void => {
    setAdminOpen(o => {
      try { localStorage.setItem(ADMIN_KEY, o ? '0' : '1') } catch { /* not remembered */ }
      return !o
    })
  }
  const named = (label: string, page: string, n: number | undefined): string => (n ? `${label}, ${n} ${COUNT_WORD[page] ?? ''}`.trim() : label)
  const mbs = S.mailboxes.filter(m => m.status === 'connected' && m.businessIds.some(b => Q.member(b)))
  const status = live
    ? `Gmail connected${mbs.length ? ` (${mbs.length} mailbox${mbs.length === 1 ? '' : 'es'}${mbs.some(m => m.canSend) ? ', sending on' : ', read only'})` : ''}. Calendar is simulated.`
    : 'Email and calendar are simulated: nothing is sent or received.'

  const wsItems: MenuItem[] = [
    { label: 'Switch workspace', head: true },
    mine.length > 1 && { label: 'All Businesses', dot: '#18141A', checked: ws === 'all', onClick: () => { Act.setSession({ ws: 'all' }); UI.toast('Portfolio view') } },
    ...S.businesses.filter(b => mine.includes(b.id)).map<MenuItem>(b => ({
      label: b.name, dot: b.accent, right: Q.role(b.id), checked: ws === b.id,
      onClick: () => { Act.setSession({ ws: b.id }); UI.toast('Switched to ' + b.name) },
    })),
    ...S.businesses.filter(b => !mine.includes(b.id)).map<MenuItem>(b => ({ label: b.name + ' — no access', dot: b.accent, disabled: true })),
  ]

  return (
    <nav className={'side' + (ui.side ? ' open' : '')} aria-label="Primary">
      <Menu
        width={244}
        trigger={
          <button type="button" className="ws" aria-label={`Workspace: ${bz ? bz.name : 'All Businesses'}. Switch workspace`} {...tipProps(bz ? bz.name : 'All Businesses')}>
            <span className="ws-mark" style={{ background: bz ? bz.accent : 'var(--fg)' }}>{bz ? bz.name[0] : 'A'}</span>
            <span className="ws-l b trunc" style={{ flex: 1, minWidth: 0 }}>{bz ? bz.name : 'All Businesses'}</span>
            <Icon n="down" s={14} className="ws-l" style={{ color: 'var(--fg3)' }} />
          </button>
        }
        items={wsItems}
      />
      <div className="side-scroll">
        {NAV.map(g => {
          const vis = g.items.filter(i => navItemVisible(i, { anyAdmin: admin, member: Q.member, canAdmin: Q.canAdmin }))
          if (!vis.length) return null
          const item = (i: (typeof vis)[number]) => {
            const n = cnt[i.page]
            const name = named(i.label, i.page, n)
            return (
              <button
                key={i.page} type="button" className={'ni' + (active === i.page ? ' on' : '')} aria-current={active === i.page ? 'page' : undefined} onClick={() => UI.nav(i.page)}
                aria-label={name} {...tipProps(name)}
              >
                <Icon n={i.icon} s={15} />
                <span className="ni-l" aria-hidden="true">{i.label}</span>
                {n ? <span className={i.page === 'inbox' ? 'badge' : 'cnt'} aria-hidden="true">{n}</span> : null}
              </button>
            )
          }
          if (g.group === 'Administration') {
            const here = vis.some(i => i.page === active)
            // Folded sidebar: one icon that opens the group as a menu.
            if (rail) {
              return (
                <div key={g.group} className="side-admin">
                  <div className="ng" />
                  <Menu
                    trigger={<button type="button" className={'ni' + (here ? ' on' : '')} aria-label="Administration" {...tipProps('Administration')}><Icon n="settings" s={15} /></button>}
                    items={vis.map<MenuItem>(i => ({ label: i.label, icon: i.icon, checked: i.page === active, onClick: () => UI.nav(i.page) }))}
                  />
                </div>
              )
            }
            const open = adminOpen || here
            return (
              <div key={g.group}>
                <button type="button" className="ng ng-btn" aria-expanded={open} onClick={toggleAdmin} disabled={here} title={here ? 'Open while you are on one of its pages' : undefined}>
                  <span className="ni-l">{g.group}</span>
                  <Icon n={open ? 'down' : 'right'} s={12} />
                </button>
                {open && vis.map(item)}
              </div>
            )
          }
          return (
            <div key={g.group}>
              <div className="ng"><span className="ni-l">{g.group}</span></div>
              {vis.map(item)}
            </div>
          )
        })}
      </div>
      <div className="side-foot">
        <div className="row side-foot-row">
          <button type="button" className="ni side-fold" onClick={() => UI.rail(!rail)} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} aria-keyshortcuts="[" aria-expanded={!rail} {...tipProps(rail ? 'Expand sidebar  [' : 'Collapse sidebar  [')}>
            <Icon n={rail ? 'right' : 'left'} s={15} />
            <span className="ni-l">Collapse</span>
            <kbd className="ni-l side-kbd">[</kbd>
          </button>
          {/* The integrations' state in one dot (its words for hover and screen readers), instead of a paragraph that crowds out the menu. */}
          <span className="side-status" role="img" aria-label={status} title={status} {...tipProps(status)}>
            <span className="dot" style={{ background: live ? 'var(--ok)' : 'var(--warn)' }} />
          </span>
        </div>
      </div>
      {tip && rail && <div className="side-tip" aria-hidden="true" style={{ top: tip.top }}>{tip.text}</div>}
    </nav>
  )
}
