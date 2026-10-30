import type { EngineInterface, Register } from 'claude-code'

import type { AdvisorMode, Level } from '../types'
import { SWITCH_READ_MS, isOn, parseSwitches, projectKey, switchesPath } from './mod-switch'

// Mods panel switch (hooks/mod-switch.ts): while this mod is off for this chat or
// project, its hooks stand aside. Read here since $ never crosses an import.
const MOD_NAME = 'effort-advisor'
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


// Effort Advisor: before each new prompt starts a turn, it rates how much thinking
// the task needs: keyword rules first (free), a cheap Haiku call when they do not
// settle it. The guidance is Anthropic's effort advice: low for iteration and
// polish, high when a hidden mistake is costly, xhigh only for long critical jobs
// left to run alone, medium otherwise; never max. When that differs from the level in use, it
// asks "Switch before Claude starts?" with Switch / Switch and auto-adjust / Keep.
// The chosen level is applied to this session's own model requests at turn.step,
// so subagents keep theirs. /effort-advisor ask|auto|off|reset|status controls it.

const OVERRIDE = { plugin: 'effort-advisor', key: 'override' } as const
const MODE = { plugin: 'effort-advisor', key: 'mode' } as const
const SESSION_LEVEL = { plugin: 'effort-advisor', key: 'sessionLevel' } as const

const LEVELS: readonly Level[] = ['low', 'medium', 'high', 'xhigh', 'max']
const LABEL: Record<Level, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
}

// Prompts shorter than this ("yes", "go ahead") continue the task in hand.
const MIN_CHARS = 25

type Rated = Exclude<Level, 'max'>

// Keyword rules, tried before Haiku; patterns from Effort Optimizer.
const PATTERNS: Record<Rated, RegExp[]> = {
  low: [
    /\bbrainstorm/i,
    /\b(give me|list|suggest|come up with)\b.{0,30}\b(\d+|a few|some|several)\b.{0,30}\b(options|ideas|names|titles|subject lines|hooks|variations|alternatives)\b/i,
    /\b(rewrite|rephrase|reword|shorten|tighten)\b/i,
    /\bmake (it|this|that)\b.{0,20}\b(shorter|friendlier|clearer|simpler|punchier|more casual|more formal)\b/i,
    /\b(tweak|polish|small change|minor change|fix (the|a|this) typo|adjust the (layout|wording|copy)|rename)\b/i,
    /\b(tag|label|categori[sz]e|classify|sort)\b.{0,20}\b(these|this list|the following|by)\b/i,
    /\b(short|quick|brief|one[- ]line) summary\b|\btl;?dr\b|\bsummari[sz]e (this )?(briefly|in \d+)/i,
    /\b(rough|first) (draft|outline|pass)\b|\bsketch (an?|the) outline\b/i,
  ],
  high: [
    /\b(check|verify|reconcile|cross[- ]check|compare)\b.{0,60}\bagainst\b/i,
    /\b(fact[- ]check|double[- ]check|audit)\b/i,
    /\bcheck every (number|figure|line|claim)\b/i,
    /\b(contract|agreement|terms and conditions|payment terms|legal)\b/i,
    /\bflag (anything|everything|any)\b.{0,30}\b(unusual|off|wrong|risk|risky|mismatch)/i,
    /\b(financial|revenue|p&l|invoice|billing) (report|figures|numbers|data)\b/i,
    /\bwhy (did|is|are|do|does)\b.{0,40}\b(go up|go down|drop|increase|decrease|spike|churn|fail)/i,
    /\b\d{2,}[- ]page\b|\blong document\b/i,
    /\b(build|fix|debug|test)\b.{0,20}\bskill\b/i,
    /\bedge cases?\b/i,
    /\b(security|migration|production data|delete (all|every))\b/i,
  ],
  xhigh: [
    /\b(walk away|while i'?m (away|gone|out)|unattended|overnight|for hours|take as long as|don'?t ask me|no questions|without asking me)\b/i,
    /\bbest one[- ]shot\b/i,
  ],
  medium: [
    /\bwrite (a|an|the)\b.{0,30}\b(email|reply|post|message|follow[- ]up|update|newsletter)\b/i,
    /\bturn (this|the|my)\b.{0,40}\binto (a|an)\b/i,
    /\brepurpose\b/i,
    /\bsummari[sz]e\b.{0,30}\b(call|meeting|notes|transcript)\b|\bnext steps\b/i,
    /\b(weekly|monthly|status|client) (update|report)\b/i,
    /\b(get me up to speed|brief me|quick research|research)\b/i,
  ],
}

// xhigh needs all three: you walk away, the job is long and hard, and it is critical.
const LONG_AND_CRITICAL = /\b(every|all (of )?(the|our)|full report|comprehensive|end[- ]to[- ]end|before we sign|investor|roadmap|from the last (year|quarter))\b/i

const REASONS: Record<Rated, string> = {
  low: 'quick iteration, a simple task, or polishing a draft',
  medium: 'everyday work with a clear result',
  high: 'a hidden mistake here would be costly',
  xhigh: "a long, critical job you're leaving Claude to run alone",
}

const RULES = `You pick the reasoning effort for a prompt to an AI assistant that also writes code. Effort sets how much time Claude spends reading, testing and checking, and how many decisions it makes without the user. It does not set intelligence.
Ask in this order and stop at the first yes:
1. Will the user iterate back and forth, is the task simple, or is it polishing an existing draft? -> low (brainstorming, quick rewrites, renames, small edits, tagging, short summaries, lookups, running a known command)
2. Would a hidden mistake cost money, a client, trust or a wrong decision, or are there many edge cases? -> high (checking numbers across sources, open-ended "why did X happen" analysis, contract or risk review, fact-checking, long documents, multi-file code changes, bugs with an unclear cause, security or data-loss risk, verifying work done at lower effort)
3. Is the user handing off a long, hard AND critical job and walking away? All three must hold. -> xhigh
4. Everything else, or unsure -> medium (everyday writing, a feature in known code, a bug with an obvious cause, meeting summaries, standard reports, quick research)
Length alone is not a reason for higher effort. Never answer max.
Reply with exactly one line: the level (low, medium, high or xhigh), a colon, then a reason of at most 10 words.`

type Rating = { level: Level; reason: string }

function byRules(text: string): Rated | null {
  const hit = (level: Rated) => PATTERNS[level].some(rule => rule.test(text))
  if (hit('xhigh') && LONG_AND_CRITICAL.test(text)) return 'xhigh'
  const low = hit('low')
  const high = hit('high')
  if (low && high) return null // conflicting signals: let Haiku weigh them
  if (low) return 'low'
  if (high) return 'high'
  if (hit('xhigh')) return null // walking away, but not clearly long and critical
  if (hit('medium')) return 'medium'
  return null
}

const isLevel = (value: unknown): value is Level =>
  typeof value === 'string' && (LEVELS as readonly string[]).includes(value)

async function getMode($: EngineInterface): Promise<AdvisorMode> {
  const { value } = await $.state.get(MODE)
  return value ?? 'ask'
}

async function currentLevel($: EngineInterface): Promise<Level | null> {
  const override = (await $.state.get(OVERRIDE)).value
  if (isLevel(override)) return override
  const seen = (await $.state.get(SESSION_LEVEL)).value
  if (isLevel(seen)) return seen
  const fromSettings = await $.settings.read({ key: 'effortLevel' })
  return isLevel(fromSettings) ? fromSettings : null
}

async function rate($: EngineInterface, text: string): Promise<Rating | null> {
  const ruled = byRules(text)
  if (ruled) return { level: ruled, reason: REASONS[ruled] }

  const reply = await $.model.complete({
    model: 'haiku',
    system: [{ text: RULES, cache: true }],
    prompt: `Prompt:\n"""\n${text.slice(0, 4000)}\n"""`,
    maxTokens: 60,
    effort: 'low',
    timeoutMs: 8000,
  })
  if (!reply.isAnswered) return null
  const m = /\b(low|medium|high|xhigh|max)\b\s*[:|]?\s*(.*)/i.exec(reply.text)
  if (!m) return null
  const word = (m[1] ?? '').toLowerCase()
  const level: Rated = word === 'max' ? 'xhigh' : (word as Rated)
  return { level, reason: (m[2] ?? '').trim().replace(/\.$/, '') || REASONS[level] }
}

async function apply($: EngineInterface, level: Level, note: string) {
  await $.state.set(OVERRIDE, level)
  $.ui.status(`effort: ${LABEL[level]}`)
  $.ui.toast(`Effort set to ${LABEL[level]}${note}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(3000, () => void modIsOn($))
    await $.command.register({
      name: 'effort-advisor',
      description: 'Effort advisor: ask, auto, off, reset or status',
      argumentHint: 'ask|auto|off|reset|status',
    })
    return next(e)
  })

  on('command.run', { command: 'effort-advisor' }, async ($, e) => {
    if (!(await modIsOn($))) return { text: 'effort-advisor is switched off here. Turn it on from the Mods button.' }
    return { text: await runCommand($, e.args) }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(await modIsOn($))) return next(e)
    if (e.command || e.isMeta || e.turnId) return next(e)
    const text = e.text.trim()
    if (text.length < MIN_CHARS) return next(e)

    const mode = await getMode($)
    if (mode === 'off') return next(e)

    const rating = await rate($, text).catch(() => null)
    if (!rating) return next(e)

    const current = await currentLevel($)
    if (current === rating.level) return next(e)

    if (mode === 'auto') {
      await apply($, rating.level, ' (auto)')
      return next(e)
    }

    const suggested = LABEL[rating.level]
    const reason = rating.reason ? `: ${rating.reason}` : ''
    const switchTo = `Switch to ${suggested}`
    const switchAuto = 'Switch, and auto-adjust from now'
    const keep = `Keep ${current ? LABEL[current] : 'current'}`
    const answer = await $.ui
      .ask(`This looks like a ${suggested} effort task${reason}. Switch before Claude starts?`, {
        options: [switchTo, switchAuto, keep],
        header: 'Effort',
      })
      .catch(() => keep)

    if (answer === switchTo) await apply($, rating.level, '')
    if (answer === switchAuto) {
      await $.state.set(MODE, 'auto')
      await apply($, rating.level, '; auto-adjusting from now')
    }
    return next(e)
  })

  // Apply the chosen level to the main loop's requests; subagents keep their own.
  on('turn.step', async function* ($, e, next) {
    if (!(await modIsOn($))) return yield* next(e)
    if (e.agentId !== undefined) return yield* next(e)

    const sessionLevel = isLevel(e.effort) ? e.effort : null
    const seen = (await $.state.get(SESSION_LEVEL)).value ?? null
    if (sessionLevel !== seen) {
      await $.state.set(SESSION_LEVEL, sessionLevel)
      // The person changed /effort themselves: theirs wins over ours.
      if (seen !== null) await $.state.set(OVERRIDE, null)
    }

    const override = (await $.state.get(OVERRIDE)).value
    if (!isLevel(override) || e.effort === undefined) return yield* next(e)
    return yield* next({ ...e, effort: override })
  })
}

async function runCommand($: EngineInterface, args: string): Promise<string> {
  const word = args.trim().toLowerCase()
  if (word === 'ask' || word === 'auto' || word === 'off') {
    await $.state.set(MODE, word)
    if (word === 'off') {
      await $.state.set(OVERRIDE, null)
      $.ui.status(undefined)
    }
    return `Effort advisor: ${word}.`
  }
  if (word === 'reset') {
    await $.state.set(OVERRIDE, null)
    $.ui.status(undefined)
    return 'Effort advisor: back to the session\'s own effort level.'
  }
  const mode = await getMode($)
  const level = await currentLevel($)
  return `Effort advisor is ${mode}; effort in use: ${level ? LABEL[level] : 'the model default'}. Use /effort-advisor ask|auto|off|reset.`
}
