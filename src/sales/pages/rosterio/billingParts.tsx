import { Btn, Inp } from '../../kit/basic'
import { UI } from '../../ui/store'

/** The customer's "add your card" link, to copy and send yourself. */
export function CardLink({ url }: { url: string }) {
  const copy = (): void => {
    if (!navigator.clipboard) return UI.toast('Copy is not available in this browser. Select the link and copy it.', 'warn')
    navigator.clipboard.writeText(url).then(() => UI.toast('Link copied'), () => UI.toast('Could not copy. Select the link and copy it.', 'warn'))
  }
  return (
    <div className="row" style={{ gap: 8 }}>
      <Inp readOnly aria-label="Card link" value={url} onChange={() => undefined} className="mono" style={{ flex: 1, minWidth: 0 }} onFocus={e => e.currentTarget.select()} />
      <Btn size="sm" icon="copy" onClick={copy}>Copy</Btn>
    </div>
  )
}
