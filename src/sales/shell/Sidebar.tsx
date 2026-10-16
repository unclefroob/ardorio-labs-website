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
  // Folded to icons: each item keeps its name for screen readers and as a hover label.
  const rail = ui.rail

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
          <button type="button" className="ws" aria-label="Switch workspace" title={rail ? (bz ? bz.name : 'All Businesses') : undefined}>
            <span className="ws-mark" style={{ background: bz ? bz.accent : 'var(--fg)' }}>{bz ? bz.name[0] : 'A'}</span>
            <span className="ws-l" style={{ flex: 1, minWidth: 0 }}>
              <span className="b" style={{ display: 'block' }}>{bz ? bz.name : 'All Businesses'}</span>
              <span className="faint xs">{bz ? 'Workspace' : 'Ardorio SalesOS · Portfolio'}</span>
            </span>
            <Icon n="down" s={14} className="ws-l" style={{ color: 'var(--fg3)' }} />
          </button>
        }
        items={wsItems}
      />
      <div className="side-scroll">
        {NAV.map(g => {
          const vis = g.items.filter(i => navItemVisible(i, { anyAdmin: admin, member: Q.member, canAdmin: Q.canAdmin }))
          if (!vis.length) return null
          return (
            <div key={g.group}>
              <div className="ng"><span className="ni-l">{g.group}</span></div>
              {vis.map(i => {
                const n = cnt[i.page]
                return (
                  <button
                    key={i.page} type="button" className={'ni' + (active === i.page ? ' on' : '')} aria-current={active === i.page ? 'page' : undefined} onClick={() => UI.nav(i.page)}
                    title={rail ? i.label + (n ? ` (${n})` : '') : undefined} aria-label={rail ? i.label + (n ? `, ${n}` : '') : undefined}
                  >
                    <Icon n={i.icon} s={15} />
                    <span className="ni-l">{i.label}</span>
                    {n ? <span className={i.page === 'inbox' ? 'badge' : 'cnt'}>{n}</span> : null}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="side-foot">
        <button type="button" className="ni side-fold" onClick={() => UI.rail(!rail)} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!rail}>
          <Icon n={rail ? 'right' : 'left'} s={15} />
          <span className="ni-l">Collapse</span>
        </button>
        <div className="row ni-l" style={{ gap: 8 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id="sos-lg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8B2FFC" />
                <stop offset="1" stopColor="#3B82F6" />
              </linearGradient>
            </defs>
            <rect width="24" height="24" rx="6" fill="url(#sos-lg)" />
            <path d="M7 17 12 6l5 11" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="b sm">Ardorio SalesOS</div>
            <div className="faint xs">{live ? 'Gmail connected (read only). Calendar is simulated.' : 'Simulated email and calendar integrations'}</div>
          </div>
        </div>
      </div>
    </nav>
  )
}
