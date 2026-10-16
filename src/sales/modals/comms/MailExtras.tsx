import { useRef, useState } from 'react'
import { Q } from '../../data/Q'
import { Btn, Chip } from '../../kit'
import { UI } from '../../ui/store'

// What an email carries besides its words, shared by Compose and the inline Reply: files, and the mailbox's signature.

/** A file picked to send, read into base64 the way the server takes it. */
export interface PendingFile { name: string; mime: string; size: number; data: string }

export const MAX_FILES = 10
/** The server's limit (Gmail's 25 MB, less base64's growth). */
export const MAX_ATTACH_BYTES = 18 * 1024 * 1024
const BLOCKED = /\.(ade|adp|apk|appx|bat|cab|chm|cmd|com|cpl|dll|dmg|exe|hta|ins|isp|iso|jar|js|jse|lib|lnk|mde|msc|msi|msix|msp|mst|nsh|pif|ps1|scr|sct|shb|sys|vb|vbe|vbs|vxd|wsc|wsf|wsh)$/i

export const fileSize = (n: number): string => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

function readFile(f: File): Promise<PendingFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve({ name: f.name, mime: f.type || 'application/octet-stream', size: f.size, data: String(r.result).replace(/^data:[^,]*,/, '') })
    r.onerror = () => reject(r.error ?? new Error('Could not read ' + f.name))
    r.readAsDataURL(f)
  })
}

/** Add picked files to those already attached, refusing (with the reason) what Gmail would refuse. */
export async function addFiles(have: PendingFile[], picked: File[]): Promise<{ files: PendingFile[]; error: string }> {
  const out = [...have]
  for (const f of picked) {
    if (BLOCKED.test(f.name)) return { files: out, error: `Gmail does not allow ${f.name} to be sent, because files of this type can carry viruses.` }
    if (out.length >= MAX_FILES) return { files: out, error: `Attach at most ${MAX_FILES} files.` }
    if (out.reduce((t, x) => t + x.size, 0) + f.size > MAX_ATTACH_BYTES) return { files: out, error: `Attachments can add up to ${fileSize(MAX_ATTACH_BYTES)}. For bigger files, share a link instead.` }
    try { out.push(await readFile(f)) } catch { return { files: out, error: `Could not read ${f.name}.` } }
  }
  return { files: out, error: '' }
}

export const toSend = (files: PendingFile[]): Array<{ name: string; mime: string; data: string }> => files.map(f => ({ name: f.name, mime: f.mime, data: f.data }))

/** The paperclip button and the attached files as chips, each removable. */
export function Attachments({ files, onChange, disabled }: { files: PendingFile[]; onChange: (files: PendingFile[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (list: FileList | null): Promise<void> => {
    if (!list?.length) return
    setBusy(true)
    const r = await addFiles(files, [...list])
    setBusy(false)
    onChange(r.files)
    if (r.error) UI.toast(r.error, 'bad')
    if (input.current) input.current.value = ''
  }
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <input ref={input} type="file" multiple hidden aria-label="Attach files" onChange={e => void pick(e.target.files)} />
      <Btn size="xs" kind="ghost" icon="clip" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? 'Reading…' : 'Attach'}</Btn>
      {files.map((f, i) => (
        <Chip key={f.name + i} icon="file" title={f.mime}>
          {f.name} · {fileSize(f.size)}
          <button type="button" className="chip-x" aria-label={'Remove ' + f.name} onClick={() => onChange(files.filter((_, j) => j !== i))}>×</button>
        </Chip>
      ))}
    </div>
  )
}

const SIG_TAGS = new Set(['A', 'B', 'BIG', 'BLOCKQUOTE', 'BR', 'CENTER', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'H4', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL'])
const SIG_ATTRS = new Set(['alt', 'align', 'valign', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'color', 'face', 'size', 'dir', 'style', 'title', 'bgcolor'])

/**
 * A signature, made safe to show here. The server already allows only these tags and attributes when it saves one; this is the
 * browser's own check of the same rules, since the HTML is shown in the page itself.
 */
export function safeSignature(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walk = (el: Element): void => {
    for (const c of [...el.children]) {
      if (!SIG_TAGS.has(c.tagName)) { c.remove(); continue }
      for (const a of [...c.attributes]) {
        const k = a.name.toLowerCase()
        const v = a.value.trim()
        const ok = c.tagName === 'A' && k === 'href' ? /^(https?:\/\/|mailto:|tel:)/i.test(v)
          : c.tagName === 'IMG' && k === 'src' ? /^https:\/\//i.test(v)
          : SIG_ATTRS.has(k) && !(k === 'style' && /url\s*\(|expression|javascript:|@import|behavior/i.test(v))
        if (!ok) c.removeAttribute(a.name)
      }
      if (c.tagName === 'A') { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer') }
      if (c.tagName === 'IMG' && !c.getAttribute('src')) { c.remove(); continue }
      walk(c)
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}

/**
 * The signature this email will end with, shown under the editor with a switch to leave it off. With none set, says where to add one.
 * Images in it are the sender's own (their logo), loaded from where Gmail keeps them.
 */
export function SignatureLine({ mailboxId, on, onChange }: { mailboxId: string; on: boolean; onChange: (on: boolean) => void }) {
  const mb = Q.mailbox(mailboxId)
  const sig = safeSignature(mb?.signature ?? '')
  if (!mb) return null
  if (!sig) {
    return (
      <div className="row xs faint" style={{ gap: 6 }}>
        No signature for {mb.address}.
        <Btn size="xs" kind="ghost" onClick={() => { UI.close(); UI.nav('integrations') }}>Add one in Integrations</Btn>
      </div>
    )
  }
  return (
    <div className="col" style={{ gap: 4 }}>
      <label className="row xs" style={{ gap: 6 }}>
        <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
        Add my signature
      </label>
      {on && <div className="sig-preview sm" aria-label="Signature" dangerouslySetInnerHTML={{ __html: sig }} />}
    </div>
  )
}
