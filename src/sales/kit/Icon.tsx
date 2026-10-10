import type { CSSProperties } from 'react'
import { ICON_PATHS } from './iconPaths'

export interface IconProps {
  n: string
  s?: number
  style?: CSSProperties
  className?: string
}

export function Icon({ n, s = 15, style, className }: IconProps) {
  const d = ICON_PATHS[n] ?? ICON_PATHS.info
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', ...style }}
      className={className}
      aria-hidden="true"
    >
      {d.split(' M').map((p, i) => (
        <path key={i} d={(i ? 'M' : '') + p} />
      ))}
    </svg>
  )
}
