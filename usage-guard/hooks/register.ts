import type { Register, EngineInterface } from 'claude-code'

import { ugLabel, ugSummarize, ugWorst } from './lib'
import { SWITCH_READ_MS, isOn, parseSwitches, projectKey, switchesPath } from './mod-switch'

// Mods panel switch (hooks/mod-switch.ts): while this mod is off for this chat or
// project, its hooks stand aside. Read here since $ never crosses an import.
const MOD_NAME = 'usage-guard'
let modSwitch = { at: -Infinity, on: true }

async function modIsOn($: EngineInterface): Promise<boolean> {
  try {
    const now = await $.clock.now()
    if (now - modSwitch.at < SWITCH_READ_MS) return modSwitch.on
    const file = switchesPath($.plugin.root)
    const raw = (await $.fs.exists(file)) ? String(await $.fs.read(file)) : ''
    const on = isOn(parseSwitches(raw), MOD_NAME, { chat: await $.session.id(), project: projectKey(await $.session.root()) })
    if (on !== modSwitch.on) $.ui.invalidate('ui.render')
    modSwitch = { at: now, on }
  } catch {
    // Keep the last answer: a half-written file is read again shortly.
  }
  return modSwitch.on
}


// Usage in the bottom bar as small circles, with the 5-hour reset time:  usage 5h ◑ 62% (resets 1h 12m) · 7d ◔ 31%
// Also warns when an agent starts near a limit and refuses new agents at the edge.

const ugWarnAt = 85 // percent: toast on every agent spawn
const ugBlockAt = 97 // percent: refuse new agents (they die mid-task at the limit)
const ugRefreshMs = 60_000

async function ugSessionStart($: any, e: any, next: any) {
  $.clock.every(3000, () => void modIsOn($))
  const refresh = async () => {
    const { rateLimits } = await $.session.usage()
    $.ui.status(rateLimits.length === 0 ? undefined : `usage ${ugSummarize(rateLimits, await $.clock.now())}`)
  }
  await refresh().catch(() => {})
  $.clock.every(ugRefreshMs, () => {
    void refresh().catch(() => {})
  })

  return next(e)
}

async function ugTurnComplete($: any, e: any, next: any) {
  if (!(await modIsOn($))) return next(e)
  const { rateLimits } = await $.session.usage()
  $.ui.status(rateLimits.length === 0 ? undefined : `usage ${ugSummarize(rateLimits, await $.clock.now())}`)
  return next(e)
}

async function ugAgentSpawn($: any, e: any, next: any) {
  if (!(await modIsOn($))) return next(e)
  const { rateLimits } = await $.session.usage()
  const top = ugWorst(rateLimits)

  if (top !== null && top.percentUsed >= ugBlockAt) {
    const reset = top.resetsAt ? ` (resets ${top.resetsAt})` : ''
    return {
      deny: `usage-guard: ${ugLabel(top.kind)} usage is at ${Math.round(top.percentUsed)}%${reset}. Not starting "${e.description}" because it would likely die mid-task. Tell the user and wait for their go-ahead or the reset.`,
    }
  }

  if (top !== null && top.percentUsed >= ugWarnAt) {
    $.ui.toast(`usage-guard: ${ugLabel(top.kind)} usage at ${Math.round(top.percentUsed)}% — starting "${e.description}"`)
  }

  return next(e)
}

export const register: Register = on => {
  on('session.start', ugSessionStart)
  on('turn.complete', ugTurnComplete)
  on('agent.spawn', ugAgentSpawn)
}
