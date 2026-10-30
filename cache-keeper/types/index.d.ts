export type CacheState = {
  lastApiAt: number | null
  ctxPercent: number | null
  halted: 'idle' | null
  lastActiveAt: number | null
  resumedAt: number | null
  now: number
}

/** Saved once for the machine (in $.store) and read by every session. */
export type Prefs = { ttlMin: number; isAuto: boolean; idleHours: number; warnMin: number }

export type Ui = { menu: boolean; confirm: boolean; armedAt: number | null; msg: string; busy: boolean }

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': {
      cache: CacheState
      prefs: Prefs
      ui: Ui
    }
  }
}
