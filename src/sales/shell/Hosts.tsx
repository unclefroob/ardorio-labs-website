import { createElement, type ComponentType } from 'react'
import { Icon } from '../kit/Icon'
import { useStore } from '../data/store'
import { DRAWERS, MODALS } from '../registry'
import { useUi, type ModalProps } from '../ui/store'
import { Palette } from './Palette'

export function Hosts() {
  useStore()
  const u = useUi()
  const Drawer = u.drawer ? DRAWERS[u.drawer.name] : undefined
  return (
    <>
      {u.modals.map(m => {
        const C = MODALS[m.name]
        return C ? createElement(C as ComponentType<ModalProps>, { key: m.id, ...m.props }) : null
      })}
      {u.drawer && Drawer && createElement(Drawer as ComponentType<ModalProps>, { key: u.drawer.name, ...u.drawer.props })}
      {u.palette && <Palette />}
      <div className="toasts" role="status" aria-live="polite">
        {u.toasts.map(t => (
          <div key={t.id} className={'toast ' + (t.tone || '')}>
            <Icon n={t.tone === 'bad' ? 'alert' : 'check'} s={14} />
            <span style={{ flex: 1 }}>{t.msg}</span>
            {t.action && (
              <button className="btn xs" style={{ background: 'rgba(255,255,255,.12)', borderColor: 'transparent', color: '#fff' }} onClick={t.action.fn}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
