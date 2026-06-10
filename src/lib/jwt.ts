// Decodes the payload without verifying the signature — the client only needs
// the exp claim to know a round-trip is pointless. The API remains the
// authority on token validity.
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number }
    if (typeof payload.exp !== 'number') return false
    return payload.exp * 1000 <= Date.now()
  } catch {
    // Malformed token — treat as expired so it gets cleared and re-issued
    return true
  }
}
