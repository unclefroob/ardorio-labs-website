const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/

/** Client-unique id: `<prefix>_<12 random chars>`. The server has no sequence counter. */
export function uid(prefix: string): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let out = ''
  // 256 % 62 !== 0, so reject the biased tail to keep the distribution flat.
  for (let i = 0; i < bytes.length; i++) {
    let b = bytes[i]
    while (b >= 248) {
      const again = new Uint8Array(1)
      crypto.getRandomValues(again)
      b = again[0]
    }
    out += ALPHABET[b % 62]
  }
  return `${prefix}_${out}`
}

export function isValidId(id: string): boolean {
  return ID_RE.test(id)
}
