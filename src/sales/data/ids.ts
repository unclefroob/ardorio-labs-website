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

function fnv(s: string, seed: number): string {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}

/** Deterministic id from a natural key, so concurrent clients converge on one record: `<prefix>_<hash>`. */
export function stableId(prefix: string, key: string): string {
  return `${prefix}_${fnv(key, 2166136261)}${fnv(key, 33554467)}`
}

/** Pass an id through when it is valid, otherwise squash it to a valid one (contract: ids over 80 chars are hashed). */
export function detId(id: string): string {
  return isValidId(id) ? id : stableId(id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'id', id)
}
