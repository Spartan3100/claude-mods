import { expect, test } from 'claude-code/testing'

const USAGE = {
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}
const TASK = 'Refactor the auth module across the API and the web app to use sessions'

function engine(on: any, rating: string, pick: string, asked: string[]) {
  const state = new Map<string, unknown>()
  on('state.get', (_: unknown, e: any) => ({ value: { value: state.get(e.key) } }))
  on('state.set', (_: unknown, e: any) => (state.set(e.key, e.value), { value: {} }))
  on('settings.read', () => ({ value: 'medium' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: rating, usage: USAGE } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', (_: unknown, e: any) => {
    const question = e.questions[0].question
    asked.push(question)
    return { result: { questions: e.questions, answers: { [question]: pick } } }
  })
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  return state
}

test('a mismatch asks, and Switch sets the override', async ($, on) => {
  const asked: string[] = []
  const state = engine(on, 'high|multi-file change', 'Switch to High', asked)

  await $.prompt.submit({ text: TASK })

  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('High effort task')
  expect(state.get('override')).toBe('high')
})

test('a matching level asks nothing', async ($, on) => {
  const asked: string[] = []
  const state = engine(on, 'medium|everyday work', 'Switch to Medium', asked)

  await $.prompt.submit({ text: TASK })

  expect(asked.length).toBe(0)
  expect(state.get('override')).toBe(undefined)
})

test('auto-adjust switches the mode and stops asking', async ($, on) => {
  const asked: string[] = []
  const state = engine(on, 'low|quick lookup', 'Switch, and auto-adjust from now', asked)

  await $.prompt.submit({ text: TASK })
  expect(state.get('mode')).toBe('auto')
  expect(state.get('override')).toBe('low')

  state.set('override', 'high')
  await $.prompt.submit({ text: TASK })
  expect(asked.length).toBe(1)
  expect(state.get('override')).toBe('low')
})

test('short follow-ups are not rated', async ($, on) => {
  const asked: string[] = []
  engine(on, 'high|x', 'Switch to High', asked)

  await $.prompt.submit({ text: 'yes, go ahead' })

  expect(asked.length).toBe(0)
})

test('switched off in the Mods panel, it rates nothing', async ($, on) => {
  let rated = 0
  on('model.complete', () => (rated++, { value: { isAnswered: true, text: 'high|x', usage: USAGE } }))
  on('state.get', () => ({ value: { value: undefined } }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('clock.now', () => ({ value: 10_000 }))
  on('session.id', () => ({ value: 'chat-1' }))
  on('session.root', () => ({ value: 'C:\Dev\App' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: JSON.stringify({ chats: { 'chat-1': { 'effort-advisor': false } } }) }))

  await $.prompt.submit({ text: TASK })

  expect(rated).toBe(0)
})

async function ratedBy($: any, on: any, text: string, haiku = 'medium: everyday') {
  const asked: string[] = []
  let calls = 0
  const state = new Map<string, unknown>()
  on('state.get', (_: unknown, e: any) => ({ value: { value: state.get(e.key) } }))
  on('state.set', (_: unknown, e: any) => (state.set(e.key, e.value), { value: {} }))
  on('settings.read', () => ({ value: 'medium' }))
  on('model.complete', () => (calls++, { value: { isAnswered: true, text: haiku, usage: USAGE } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', (_: unknown, e: any) => {
    const question = e.questions[0].question
    asked.push(question)
    return { result: { questions: e.questions, answers: { [question]: e.questions[0].options[0].label } } }
  })
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  await $.prompt.submit({ text })
  return { asked, calls, override: state.get('override') }
}

test('rules rate a quick rewrite low, with no Haiku call', async ($, on) => {
  const r = await ratedBy($, on, "Rewrite this email so it's shorter and friendlier please")
  expect(r.calls).toBe(0)
  expect(r.asked[0]).toContain('Low effort task')
  expect(r.override).toBe('low')
})

test('rules rate a contract review high', async ($, on) => {
  const r = await ratedBy($, on, 'Review this vendor contract and flag anything unusual in the payment terms')
  expect(r.calls).toBe(0)
  expect(r.override).toBe('high')
})

test('xhigh only when walking away from a long critical job', async ($, on) => {
  const r = await ratedBy($, on, 'Build the full report end-to-end overnight, without asking me anything')
  expect(r.calls).toBe(0)
  expect(r.override).toBe('xhigh')
})

test('unclear prompts go to Haiku, and max is capped to xhigh', async ($, on) => {
  const r = await ratedBy($, on, 'Refactor the auth module across the API and the web app', 'max: very hard')
  expect(r.calls).toBe(1)
  expect(r.override).toBe('xhigh')
})
