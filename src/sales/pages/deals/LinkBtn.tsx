import type { ButtonHTMLAttributes } from 'react'

/** A button that reads as a link, for actions that open a drawer or modal rather than navigate. */
export function LinkBtn({ style, ...r }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--acc-ink)', cursor: 'pointer', textAlign: 'left', ...style }}
      {...r}
    />
  )
}
