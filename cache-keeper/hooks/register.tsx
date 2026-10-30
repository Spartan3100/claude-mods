/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheState, Prefs, Ui } from '../types'
import { BUILD, CONFIRM_MS, HANDOFF_FRESH_MS, cacheView, cleanHandoff, ctxView, fmtK, fmtLeft, normCwd, ringColor, ringSvg, shouldWarnCache } from './lib'
import { SWITCH_READ_MS, isOn, parseSwitches, projectKey, switchesPath } from './mod-switch'

// Mods panel switch (hooks/mod-switch.ts): while this mod is off for this chat or
// project, its hooks stand aside. Read here since $ never crosses an import.
const MOD_NAME = 'cache-keeper'
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


// cache-keeper: the cache cell from the old status strip, on its own.
//   cache <ring> 42m left   [Refresh] [Keep warm: on] [Compress] [Continue ▸] [⚙ ▾]
// Keep warm: a tiny tool-less fork of this session reads the cached prefix just before it lapses, so the
//   next real message is not rewritten at full price. It pauses itself after idle hours.
// Compress: summarizes the conversation (the cache then starts cold).
// Continue ▸: asks for a handoff note, saves it, and tells you to /clear. The fresh session opens with the
//   note already in the prompt box, ready to send.

const ckCacheInit: CacheState = { lastApiAt: null, ctxPercent: null, halted: null, lastActiveAt: null, resumedAt: null, now: 0 }
const ckPrefsInit: Prefs = { ttlMin: 60, isAuto: false, idleHours: 8, warnMin: 10 }
const ckUiInit: Ui = { menu: false, confirm: false, armedAt: null, msg: '', busy: false }

const ckCache = atom({ plugin: 'cache-keeper', key: 'cache' } as const, ckCacheInit)
const ckPrefs = atom({ plugin: 'cache-keeper', key: 'prefs' } as const, ckPrefsInit)
const ckUi = atom({ plugin: 'cache-keeper', key: 'ui' } as const, ckUiInit)

const ckTickMs = 30_000
const ckAutoWithinMs = 5 * 60_000
const ckHandoffKey = 'cache-keeper.handoff'

const ckHandoffPrompt =
  'Do not continue the task. Write a handoff note so a brand-new session can pick this work up with no other context. ' +
  'Use these headings: Goal, Done so far, In progress, Next steps (in order), Key files and commands, Decisions and gotchas. ' +
  'Be specific: file paths, branch names, exact commands, open questions. Plain text only, under 600 words, no code fence.'

let ckIsBusy = false
let ckSessionCwd = ''
let ckStartedAt = 0
let ckToastFill: number | null = null
let ckToastCtx = false

const ckPatchCache = ($: EngineInterface, p: Partial<CacheState>) => update($, ckCache, c => ({ ...c, ...p }))
const ckPatchUi = ($: EngineInterface, p: Partial<Ui>) => update($, ckUi, u => ({ ...u, ...p }))

async function ckSetPrefs($: EngineInterface, p: Partial<Prefs>) {
  const next = { ...(await read($, ckPrefs)), ...p }
  await update($, ckPrefs, () => next)
  await $.store.set('cache-keeper.prefs', next)
}

async function ckLoadPrefs($: EngineInterface) {
  const saved = (await $.store.get('cache-keeper.prefs')) as Partial<Prefs> | undefined
  if (saved && typeof saved === 'object') await update($, ckPrefs, p => ({ ...p, ...saved }))
}

async function ckSample($: EngineInterface) {
  const now = await $.clock.now()
  const { context } = await $.session.usage()
  await ckPatchCache($, { now, ctxPercent: context.percent ?? null })
}

// One tiny tool-less question over this session's own transcript: the cached prefix is read, which resets its
// time-to-live. It adds nothing to the conversation.
async function ckRefresh($: EngineInterface) {
  await ckPatchUi($, { msg: 'refreshing cache…' })
  const r = await $.model.fork({ prompt: 'Reply with the single word: ok' })
  const now = await $.clock.now()
  if (r.isAnswered) {
    const rewritten = r.usage.cache_creation_input_tokens
    await ckPatchCache($, { lastApiAt: now, now })
    await ckPatchUi($, {
      msg: rewritten > 1000 ? `cache had lapsed: ${fmtK(rewritten)} tokens rewritten at full price` : `cache refreshed: ${fmtK(r.usage.cache_read_input_tokens)} tokens read from cache`,
    })
  } else {
    await ckPatchUi($, { msg: `refresh failed: ${r.reason}` })
  }
  await ckSample($)
}

async function ckCompress($: EngineInterface) {
  await ckPatchUi($, { confirm: false, armedAt: null, msg: 'compressing…' })
  const r = await $.session.compact()
  await ckPatchCache($, { lastApiAt: null })
  await ckPatchUi($, { msg: 'skip' in r ? `compress skipped: ${r.skip}` : 'compressed; cache is cold until your next message' })
  await ckSample($)
}

async function ckAskCompress($: EngineInterface) {
  const ui = await read($, ckUi)
  if (ui.confirm) return ckPatchUi($, { confirm: false, armedAt: null })
  return ckPatchUi($, { confirm: true, armedAt: await $.clock.now(), msg: '' })
}

// Continue in a new session: a fork writes the handoff note (it shares this session's cache, so it costs about
// one reply), it is saved for this folder, and the next /clear opens with it in the prompt box.
async function ckContinue($: EngineInterface) {
  if ((await read($, ckUi)).busy) return
  await ckPatchUi($, { busy: true, msg: 'writing the handoff note…' })
  try {
    const r = await $.model.fork({ prompt: ckHandoffPrompt })
    const text = r.isAnswered ? cleanHandoff(r.text) : ''
    if (text === '') {
      await ckPatchUi($, { msg: r.isAnswered ? 'handoff came back empty; try again' : `handoff failed: ${r.reason}` })
      return
    }
    const now = await $.clock.now()
    await $.store.set(ckHandoffKey, { cwd: normCwd(ckSessionCwd), text, at: now })
    await ckPatchUi($, { msg: 'context saved for the new session. Type /clear to wipe this session; the new one opens with everything needed to continue in the prompt box.' })
    $.ui.toast('Context saved. Type /clear to wipe this session and continue in a new one.')
  } finally {
    await ckPatchUi($, { busy: false })
  }
}

// After /clear the process lives on under a new session id with no session.start, so session.end (reason
// 'clear') is the cue. The prompt box mounts a moment later, so fill it with a few tries.
async function ckPlaceHandoff($: EngineInterface) {
  const saved = (await $.store.get(ckHandoffKey)) as { cwd?: string; text?: string; at?: number } | undefined
  if (!saved || typeof saved.text !== 'string' || saved.cwd !== normCwd(ckSessionCwd)) return
  const now = await $.clock.now()
  if (typeof saved.at !== 'number' || now - saved.at > HANDOFF_FRESH_MS) {
    await $.store.delete(ckHandoffKey)
    return
  }
  const text = `Continue from this handoff note. Read it, check the repo's current state, then pick up at Next steps.\n\n${saved.text}`
  for (let i = 0; i < 6; i++) {
    await $.clock.sleep(1000)
    const r = await $.prompt.fill({ text }).catch(() => null)
    if (r && r.isFilled) {
      await $.store.delete(ckHandoffKey)
      $.ui.toast('Handoff note is in the prompt box. Edit it or press Enter.')
      return
    }
  }
}

async function ckHeadsUp($: EngineInterface) {
  const prefs = await read($, ckPrefs)
  const c = await read($, ckCache)
  if (c.lastApiAt !== null) {
    const left = prefs.ttlMin * 60_000 - (c.now - c.lastApiAt)
    if (shouldWarnCache(left, prefs.warnMin * 60_000, ckToastFill, c.lastApiAt)) {
      ckToastFill = c.lastApiAt
      $.ui.toast(`Cache expires in ${fmtLeft(left)}. Press Refresh, or turn on Keep warm.`)
    }
  }
  const ctx = ctxView(c)
  if (ctx.needs && !ckToastCtx) {
    ckToastCtx = true
    $.ui.toast(`Context is ${ctx.text} full. Compress, or press Continue to move to a fresh session.`)
  } else if (!ctx.needs) {
    ckToastCtx = false
  }
}

async function ckTick($: EngineInterface) {
  await ckSample($)
  const now = await $.clock.now()
  await ckHeadsUp($).catch(() => {})

  const ui = await read($, ckUi)
  if (ui.confirm && ui.armedAt !== null && now - ui.armedAt > CONFIRM_MS) await ckPatchUi($, { confirm: false, armedAt: null })

  const prefs = await read($, ckPrefs)
  if (!prefs.isAuto) return
  const c = await read($, ckCache)
  let halted = c.halted
  if (halted === null) {
    const idleSince = Math.max(c.lastActiveAt ?? ckStartedAt, c.resumedAt ?? 0)
    if (prefs.idleHours > 0 && now - idleSince > prefs.idleHours * 3_600_000) {
      halted = 'idle'
      await ckPatchCache($, { halted })
      await ckPatchUi($, { msg: `Keep warm paused: no activity for ${prefs.idleHours}h. Send a message or Resume.` })
      $.ui.toast(`cache-keeper: keep warm paused after ${prefs.idleHours}h idle`)
    }
  }
  if (halted === null && !ckIsBusy && c.lastApiAt !== null) {
    const left = prefs.ttlMin * 60_000 - (c.now - c.lastApiAt)
    if (left > 0 && left < ckAutoWithinMs) await ckRefresh($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(3000, () => void modIsOn($))
    await ckLoadPrefs($)
    ckSessionCwd = e.cwd
    ckStartedAt = await $.clock.now()
    await ckPatchCache($, { now: ckStartedAt, lastActiveAt: ckStartedAt })
    await ckSample($).catch(() => {})
    $.clock.every(ckTickMs, () => void ckTick($).catch(() => {}))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') void ckPlaceHandoff($).catch(() => {})
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!(await modIsOn($))) return next(e)
    ckIsBusy = true
    if ((await read($, ckUi)).msg) await ckPatchUi($, { msg: '' })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!(await modIsOn($))) return next(e)
    ckIsBusy = false
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await ckPatchCache($, { lastApiAt: now, now, lastActiveAt: now, halted: null })
      await ckSample($).catch(() => {})
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await modIsOn($))) return next(e)
    if (e.props.hasSurvey) return next(e)
    const rest = await next(e)
    const c = await read($, ckCache)
    const prefs = await read($, ckPrefs)
    const ui = await read($, ckUi)
    const cache = cacheView(c, prefs)
    const isArmed = ui.confirm && ui.armedAt !== null && c.now - ui.armedAt < CONFIRM_MS
    const ctx = ctxView(c)

    // Not every surface has every element: the terminal draws no Svg, mobile no Select.
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const Select = 'Select' in els ? els.Select : undefined
    const toneColor = (t: string) => (t === 'warning' || t === 'error' || t === 'success' ? t : undefined)
    const ring = Svg ? <Svg source={ringSvg(cache.pct ?? 0, ringColor(cache.tone))} alt={`${Math.round(cache.pct ?? 0)}%`} width={16} height={16} /> : null
    const text = Svg ? cache.text : `${cache.ring ?? ''} ${cache.text}`
    // Segmented rail: cells sized to their labels, never cut; the text steps down a size
    // (and then to short labels) when the band is too narrow for all of it.
    const AMBER = '#e8b56d'
    const L = {
      refresh: cache.isExpired ? 'Refresh (full price)' : 'Refresh',
      warm: prefs.isAuto ? 'Keep warm: on' : 'Keep warm: off',
      compress: isArmed ? 'Compress…' : 'Compress',
      cont: ui.busy ? 'Saving…' : 'New session ▸',
      gear: ui.menu ? '⚙ Settings ▴' : '⚙ Settings ▾',
    }
    const S = {
      refresh: cache.isExpired ? 'Refresh $' : 'Refresh',
      warm: prefs.isAuto ? 'Warm: on' : 'Warm: off',
      compress: isArmed ? 'Compact…' : 'Compact',
      cont: ui.busy ? 'Saving…' : 'New ▸',
      gear: ui.menu ? '⚙ ▴' : '⚙ ▾',
    }
    // Desktop cells run wider than terminal columns, so the estimate is padded generously.
    const need = (o: typeof L) => Math.ceil(Object.values(o).reduce((n, t) => n + t.length + 6, text.length + 8 + 10) * 1.35)
    const cols = e.props.bodyColumns
    const fit = (o: typeof L) => (need(o) <= cols ? 'body' : need(o) * 0.85 <= cols ? 'footnote' : need(o) * 0.72 <= cols ? 'caption' : null)
    const size = fit(L) ?? fit(S) ?? 'caption'
    const lab = fit(L) ? L : S
    const sep = (key: string) => (
      <Box key={key} justifyContent="center">
        <Text color="#3a3a3a">│</Text>
      </Box>
    )
    const cell = (key: string, child: any) => (
      <Box key={`${key}-cell`} flexGrow={1} flexShrink={0} justifyContent="center" alignItems="center" paddingX={1} borderStyle="round" borderColor="#1b1b1b" hover={{ backgroundColor: '#262422', borderColor: '#3a3631' }}>
        {child}
      </Box>
    )
    const btn = (key: string, label: string, needs: boolean, onPress: () => void) =>
      cell(
        key,
        <Button key={key} label={label} plain dimColor={!needs} hover={{ color: AMBER, backgroundColor: '#262422' }} onPress={onPress}>
          <Text size={size}>{label}</Text>
        </Button>,
      )
    const row = (label: string, control: any) => (
      <Box key={`ck-row-${label}`} gap={2}>
        <Box width={30}>
          <Text>{label}</Text>
        </Box>
        {control}
      </Box>
    )
    const choice = (key: string, options: { value: string; label: string }[], value: string, onSelect: (v: string) => void) =>
      Select ? (
        <Select key={key} options={options} value={value} onSelect={onSelect} />
      ) : (
        // No Select here: one button per option, the current one lit.
        <Box key={key} gap={1} flexWrap="wrap">
          {options.map(o => (
            <Button key={`${key}-${o.value}`} label={o.label} variant={o.value === value ? 'primary' : undefined} onPress={() => onSelect(o.value)} />
          ))}
        </Box>
      )

    return (
      <Box flexDirection="column">
        <Box key="ck-rail" flexDirection="row" flexWrap="nowrap" alignItems="stretch" borderStyle="round" borderColor="#2e2e2e" backgroundColor="#1b1b1b">
          {cell(
            'ck-cache',
            <Box gap={1} alignItems="center">
              {ring}
              <Text size={size} color={toneColor(cache.tone)} dimColor={cache.tone === 'dim'}>
                {text}
              </Text>
            </Box>,
          )}
          {sep('ck-refresh-sep')}
          {btn('ck-refresh', lab.refresh, cache.needs, () => void ckRefresh($))}
          {sep('ck-warm-sep')}
          {btn('ck-warm', lab.warm, prefs.isAuto, () => void ckSetPrefs($, { isAuto: !prefs.isAuto }))}
          {sep('ck-compress-sep')}
          {btn('ck-compress', lab.compress, ctx.needs || isArmed, () => void ckAskCompress($))}
          {sep('ck-continue-sep')}
          {btn('ck-continue', lab.cont, ctx.needs, () => void ckContinue($))}
          {sep('ck-gear-sep')}
          {btn('ck-gear', lab.gear, ui.menu, () => void ckPatchUi($, { menu: !ui.menu }))}
          {sep('ck-mods-sep')}
          {btn('ck-mods', 'Mods', false, () => void $.prompt.fill({ text: '/mods' }).catch(() => null))}
        </Box>
        {rest}

        {isArmed && (
          <Box key="ck-confirm" flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
            <Text bold>Compress this conversation?</Text>
            <Text>Claude will replace it with a short summary to free up context ({ctx.text} full now). The cache starts cold.</Text>
            <Box gap={1}>
              <Button key="ck-yes" label="Yes, compress" variant="primary" onPress={() => void ckCompress($)} />
              <Button key="ck-no" label="Cancel" onPress={() => void ckPatchUi($, { confirm: false, armedAt: null, msg: 'compress cancelled' })} />
            </Box>
          </Box>
        )}

        {prefs.isAuto && c.halted === 'idle' && (
          <Box key="ck-idle" gap={1}>
            <Text bold>Keep warm paused: idle for {prefs.idleHours}h.</Text>
            <Button
              key="ck-resume"
              label={`Resume (${prefs.idleHours}h more)`}
              onPress={() =>
                void (async () => {
                  await ckPatchCache($, { halted: null, resumedAt: await $.clock.now() })
                  await ckPatchUi($, { msg: 'Keep warm resumed' })
                })()
              }
            />
          </Box>
        )}

        {ui.menu && (
          <Box key="ck-menu" flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>Cache settings</Text>
            {row('Cache lifetime', choice('ck-s-ttl', [{ value: '5', label: '5 min' }, { value: '60', label: '60 min' }], String(prefs.ttlMin), v => void ckSetPrefs($, { ttlMin: Number(v) })))}
            {row('Keep warm automatically', choice('ck-s-auto', [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }], prefs.isAuto ? 'on' : 'off', v => void ckSetPrefs($, { isAuto: v === 'on' })))}
            {row(
              'Stop keeping warm after idle',
              choice('ck-s-idle', [{ value: '4', label: '4 hours' }, { value: '8', label: '8 hours' }, { value: '12', label: '12 hours' }, { value: '0', label: 'Never' }], String(prefs.idleHours), v => void ckSetPrefs($, { idleHours: Number(v) })),
            )}
            {row('Warn when this much is left', choice('ck-s-warn', [{ value: '5', label: '5 min' }, { value: '10', label: '10 min' }, { value: '15', label: '15 min' }], String(prefs.warnMin), v => void ckSetPrefs($, { warnMin: Number(v) })))}
            <Text dimColor>Saved once for every session on this PC. cache-keeper build {BUILD}</Text>
          </Box>
        )}

        {ui.msg && <Text dimColor>{ui.msg}</Text>}
      </Box>
    )
  })
}
