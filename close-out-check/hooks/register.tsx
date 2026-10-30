import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Report } from '../types'
import { SWITCH_READ_MS, isOn, parseSwitches, projectKey, switchesPath } from './mod-switch'

// Mods panel switch (hooks/mod-switch.ts): while this mod is off for this chat or
// project, its hooks stand aside. Read here since $ never crosses an import.
const MOD_NAME = 'close-out-check'
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


const coReport = atom({ plugin: 'close-out-check', key: 'report' } as const, null)
const coIsHidden = atom({ plugin: 'close-out-check', key: 'isHidden' } as const, false)

const coChangelogs = ['CHANGELOG.md', 'CHANGELOG']
const coHandoffs = ['HANDOFF.md', 'PROJECT_STATE.md', 'STATUS.md']
const coDocOnly = /\.(md|txt|mdx)$/i

let coStartSha = ''

async function coRun($: EngineInterface, argv: string[]) {
  const r = await $.process.run(argv, { timeoutMs: 15_000 }).catch(() => null)
  return r === null || r.exitCode !== 0 ? '' : r.stdout.trim()
}

async function coExisting($: EngineInterface, names: string[]) {
  const found: string[] = []
  for (const n of names) if (await $.fs.exists(n)) found.push(n)
  return found
}

async function coCheck($: EngineInterface, startSha: string): Promise<Report | null> {
  if (!startSha) return null
  const committed = (await coRun($, ['git', 'diff', '--name-only', `${startSha}..HEAD`])).split('\n')
  const working = (await coRun($, ['git', 'status', '--porcelain'])).split('\n').map(l => l.slice(3).replace(/^.* -> /, ''))
  const changed = [...new Set([...committed, ...working].map(s => s.trim()).filter(Boolean))]
  if (changed.filter(f => !coDocOnly.test(f)).length === 0) return null

  const touched = (names: string[]) => changed.some(f => names.includes(f.split('/').pop() ?? ''))
  const missing: string[] = []

  const changelog = await coExisting($, coChangelogs)
  if (changelog.length > 0 && !touched(changelog)) missing.push('CHANGELOG not updated')

  if (await $.fs.exists('package.json')) {
    const hasVersion = /"version"\s*:/.test(String(await $.fs.read('package.json')))
    if (hasVersion && !changed.includes('package.json')) missing.push('version not bumped')
  }

  const handoffs = await coExisting($, coHandoffs)
  if (handoffs.length > 0 && !touched(handoffs)) missing.push(`${handoffs[0]} not updated`)

  const stat = (await coRun($, ['git', 'diff', '--shortstat', startSha])).replace(/^\s+/, '')
  return { files: changed.length, stat, missing }
}

async function coSessionStart($: any, e: any, next: any) {
  $.clock.every(3000, () => void modIsOn($))
  coStartSha = await coRun($, ['git', 'rev-parse', 'HEAD'])
  return next(e)
}

async function coTurnComplete($: any, e: any, next: any) {
  if (!(await modIsOn($))) return next(e)
  if (!e.isAborted && e.agentId === undefined) {
    const r = await coCheck($, coStartSha).catch(() => null)
    await update($, coReport, () => r)
    await update($, coIsHidden, () => false)
  }
  return next(e)
}

async function coRenderBand($: any, e: any, next: any) {
  if (!(await modIsOn($))) return next(e)
  const r = await read($, coReport)
  if (e.props.hasSurvey || r === null || (await read($, coIsHidden))) return next(e)

  const { Box, Text, Button } = $.ui.resolve(e)
  const fix = () => {
    void $.prompt.submit({
      text: `Close out this work: ${r.missing.join('; ')}. Follow the repo's release/documentation rules, keep entries accurate to what changed this session, and do not touch unrelated files.`,
    })
    void update($, coIsHidden, () => true)
  }

  // Several bands share this slot: draw ours and stack whatever sits beneath it.
  const rest = await next(e)

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor={r.missing.length === 0}>
          {r.stat || `${r.files} files changed`} ·{' '}
          {r.missing.length === 0 ? '✔ docs & version look current' : `! ${r.missing.join(' · ')}`}{' '}
        </Text>
        {r.missing.length > 0 && <Button key="co-fix" label="Fix" variant="primary" onPress={fix} />}
        <Button key="co-hide" label="Hide" onPress={() => update($, coIsHidden, () => true)} />
      </Box>
      {rest}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', coSessionStart)
  on('turn.complete', coTurnComplete)
  on('ui.render', { component: 'AbovePrompt' }, coRenderBand)
}
