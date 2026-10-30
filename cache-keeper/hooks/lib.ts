// Pure logic for the cache meter: no $ in here.

export type Tone = 'normal' | 'dim' | 'warning' | 'error' | 'success'
export type CacheLike = { lastApiAt: number | null; ctxPercent: number | null; now: number }
export type PrefsLike = { ttlMin: number; warnMin: number }
export type CellView = { text: string; tone: Tone; needs: boolean; ring?: string; pct?: number }
export type CacheView = CellView & { isExpired: boolean; isCold: boolean }

export const COMPRESS_AT = 70
export const CONFIRM_MS = 15_000
export const HANDOFF_FRESH_MS = 60 * 60_000

export const normCwd = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export const fmtLeft = (ms: number) => {
  const m = Math.floor(ms / 60_000)
  return m >= 1 ? `${m}m` : `${Math.max(0, Math.floor(ms / 1000))}s`
}

export const fmtK = (n: number | null) => (n === null ? '?' : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export function ringGlyph(pct: number | null): string {
  if (pct === null) return '○'
  const p = Math.min(100, Math.max(0, pct))
  if (p < 12.5) return '○'
  if (p < 37.5) return '◔'
  if (p < 62.5) return '◑'
  if (p < 87.5) return '◕'
  return '●'
}

export function ctxView(c: CacheLike): CellView {
  if (c.ctxPercent === null) return { text: '—', tone: 'dim', needs: false }
  const needs = c.ctxPercent >= COMPRESS_AT
  return { text: `${Math.round(c.ctxPercent)}%`, tone: needs ? 'warning' : 'normal', needs, ring: ringGlyph(c.ctxPercent), pct: Math.min(100, Math.max(0, c.ctxPercent)) }
}

export function cacheView(c: CacheLike, p: PrefsLike): CacheView {
  if (c.lastApiAt === null) return { text: 'cold', tone: 'dim', needs: false, isExpired: false, isCold: true, ring: '○', pct: 0 }
  const life = p.ttlMin * 60_000
  const left = life - (c.now - c.lastApiAt)
  if (left <= 0) return { text: 'expired', tone: 'error', needs: true, isExpired: true, isCold: true, ring: '○', pct: 0 }
  const needs = left <= p.warnMin * 60_000
  const pct = Math.min(100, Math.max(0, (left / life) * 100))
  return { text: `${fmtLeft(left)} left`, tone: needs ? 'warning' : 'normal', needs, isExpired: false, isCold: false, ring: ringGlyph(pct), pct }
}

/** True once per cache fill: the lifetime has dropped to the warning level but not yet run out. */
export function shouldWarnCache(left: number | null, warnMs: number, alreadyFor: number | null, fillAt: number | null): boolean {
  return left !== null && left > 0 && left <= warnMs && fillAt !== null && alreadyFor !== fillAt
}

/** Keep the handoff short and plain: drop control characters and cap the length. */
export function cleanHandoff(text: string, max = 6000): string {
  const safe = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
  return safe.length > max ? `${safe.slice(0, max - 1)}…` : safe
}

export const BUILD = '2026-10-06.1'

export function ringColor(tone: Tone): string {
  switch (tone) {
    case 'warning': return '#F2B01E'
    case 'error': return '#F85149'
    case 'success': return '#3FB950'
    case 'dim': return '#6E7681'
    default: return '#9AA0A6'
  }
}

const RING_R = 9
const RING_C = 2 * Math.PI * RING_R

export function ringSvg(pct: number, color: string): string {
  const p = Math.min(100, Math.max(0, pct))
  const arc = (p / 100) * RING_C
  const track = '<circle cx="12" cy="12" r="9" fill="none" stroke="rgba(128,128,128,0.35)" stroke-width="3.5"/>'
  const fill =
    p <= 0
      ? ''
      : `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="${p >= 100 ? 'butt' : 'round'}" stroke-dasharray="${arc.toFixed(2)} ${RING_C.toFixed(2)}" transform="rotate(-90 12 12)"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">${track}${fill}</svg>`
}
