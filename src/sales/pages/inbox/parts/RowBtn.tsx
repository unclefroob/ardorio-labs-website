import type { ReactNode } from 'react'

const reset = {
  display: 'flex', flexDirection: 'column', gap: 3, width: '100%', textAlign: 'left', border: 0, background: 'transparent',
  padding: '10px 14px', font: 'inherit', color: 'inherit', cursor: 'pointer',
} as const

/** A selectable list row: the `.th` container supplies hover and selection, the inner button takes focus and clicks. */
export function RowBtn({ on, unread, onClick, children, label }: { on?: boolean; unread?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <div className={'th' + (unread ? ' unread' : '') + (on ? ' on' : '')} style={{ padding: 0 }}>
      <button type="button" style={reset} aria-current={on ? 'true' : undefined} aria-label={label} onClick={onClick}>
        {children}
      </button>
    </div>
  )
}
