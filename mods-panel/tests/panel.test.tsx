import { expect, test } from 'claude-code/testing'

const SWITCHES = 'mod-switches.json'
const CHAT = 'chat-1'
const PROJECT = 'c:/dev/app'

const PANE = {
  plugin: 'mods-panel',
  component: 'Pane',
  requestId: 'mods-panel',
  props: {
    title: 'Mods',
    isFocused: true,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const MANIFESTS: Record<string, string> = {
  [`mods/ship-it/.claude-plugin/plugin.json`]: '{"name":"ship-it","description":"Ships it"}',
  [`mods/where-are-we/.claude-plugin/plugin.json`]: '{"name":"where-are-we","description":"Shows where you are"}',
}
const EXISTS = new Set([
  `mods/ship-it/hooks/hooks.json`,
  `mods/ship-it/hooks/mod-switch.ts`,
  `mods/where-are-we/hooks/hooks.json`,
])

const rel = (path: string) => path.replace(/\\/g, '/').split('/.claude/')[1] ?? path

function engine(on: any) {
  const files = new Map<string, string>(Object.entries(MANIFESTS))
  const state = new Map<string, unknown>()
  on('fs.exists', (_: unknown, e: any) => ({ value: EXISTS.has(rel(e.path)) || files.has(rel(e.path)) }))
  on('fs.read', (_: unknown, e: any) => {
    const text = files.get(rel(e.path))
    return text === undefined ? { deny: 'missing' } : { value: text }
  })
  on('fs.write', (_: unknown, e: any) => (files.set(rel(e.path), e.text), { value: undefined }))
  on('fs.list', (_: unknown, e: any) => ({
    value: rel(e.path) === 'mods'
      ? [
          { name: 'ship-it', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
          { name: 'where-are-we', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
        ]
      : [],
  }))
  on('session.id', () => ({ value: CHAT }))
  on('session.root', () => ({ value: 'C:\\Dev\\App' }))
  on('clock.now', () => ({ value: 1000 }))
  on('state.get', (_: unknown, e: any) => ({ value: { value: state.get(e.key) } }))
  on('state.set', (_: unknown, e: any) => (state.set(e.key, e.value), { value: {} }))
  return files
}

const switches = (files: Map<string, string>) => JSON.parse(files.get(SWITCHES) ?? '{}')

test('lists each mod with what it does, and flags one without the switch', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: 'Ship It' }))?.text).toBe('Ship It')
  expect((await ui.find({ type: 'Text', text: 'Shows where you are' }))?.text).toBe('Shows where you are')
  expect(await ui.find({ key: 'switch-ship-it' })).toBeDefined()
  expect(await ui.find({ key: 'switch-where-are-we' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Ask Claude to add the Mods switch/ })).toBeDefined()
  await ui.unmount()
})

test('a switch turns a mod off for the project', async ($, on) => {
  const files = engine(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'switch-ship-it' })

  expect(switches(files).projects[PROJECT]['ship-it']).toBe(false)
  await ui.unmount()
})

test('this-chat scope overrides the project, and reset drops it', async ($, on) => {
  const files = engine(on)
  files.set(SWITCHES, JSON.stringify({ projects: { [PROJECT]: { 'ship-it': false } } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'scope-chat' })
  await ui.press({ key: 'switch-ship-it' })
  expect(switches(files).chats[CHAT]['ship-it']).toBe(true)
  expect(switches(files).projects[PROJECT]['ship-it']).toBe(false)

  await ui.press({ key: 'reset-ship-it' })
  expect(switches(files).chats).toEqual({})
  await ui.unmount()
})
