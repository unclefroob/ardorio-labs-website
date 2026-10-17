import { Fragment, type ReactNode } from 'react'
import { Icon } from '../kit/Icon'
import { UI } from '../ui/store'

export function PageHead({ title, sub, children, crumb, eyebrow }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; crumb?: ReactNode[]; eyebrow?: ReactNode }) {
  return (
    <div className="ph">
      <div style={{ minWidth: 0 }}>
        {crumb && (
          <div className="crumb">
            <button onClick={UI.back}><Icon n="left" s={12} /> Back</button>
            {crumb.map((c, i) => <Fragment key={i}><span>/</span>{c}</Fragment>)}
          </div>
        )}
        {eyebrow && <div className="faint sm">{eyebrow}</div>}
        <h1 tabIndex={-1}>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="acts">{children}</div>
    </div>
  )
}
