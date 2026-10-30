import type { EngineInterface, Register } from 'claude-code'

import type { InstalledMod, ModInfo, Scope } from '../types'
import { homeOf, isOn, parseSwitches, projectKey, switchesPath } from './mod-switch'
import type { Switches, Where } from './mod-switch'

// The Mods panel: a Mods button above the prompt opens a side pane listing every
// mod in ~/.claude/mods and this chat's dev-mods folder, each with what it does
// and an On/Off switch. A switch applies to this project (folder-less chats share
// one setting) or to this chat alone, as the scope buttons at the top say.
// Mods obey it through their own copy of hooks/mod-switch.ts.

const NAME = 'mods-panel'
const PANE = 'mods-panel'
const SCOPE = { plugin: 'mods-panel', key: 'scope' } as const
const SCAN_MS = 5000

// Module variables reset on a reload.
let scan: { at: number; chat: string; mods: ModInfo[] } | null = null

async function readSwitches($: EngineInterface): Promise<Switches> {
  const path = switchesPath($.plugin.root)
  return (await $.fs.exists(path)) ? parseSwitches(String(await $.fs.read(path))) : {}
}

async function whereAmI($: EngineInterface): Promise<Where> {
  return { chat: await $.session.id(), project: projectKey(await $.session.root()) }
}

const titleOf = (name: string) =>
  name
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

async function readMod($: EngineInterface, dir: string, chatOnly: boolean): Promise<ModInfo | null> {
  try {
    if (!(await $.fs.exists(`${dir}/hooks/hooks.json`))) return null
    const manifest = JSON.parse(String(await $.fs.read(`${dir}/.claude-plugin/plugin.json`))) as {
      name?: unknown
      description?: unknown
    }
    const name = typeof manifest.name === 'string' ? manifest.name : ''
    if (!name || name === NAME) return null
    return {
      name,
      title: titleOf(name),
      what: typeof manifest.description === 'string' ? manifest.description : '',
      switchable: await $.fs.exists(`${dir}/hooks/mod-switch.ts`),
      chatOnly,
    }
  } catch {
    return null
  }
}

async function findMods($: EngineInterface, chat: string): Promise<ModInfo[]> {
  const now = await $.clock.now()
  if (scan && scan.chat === chat && now - scan.at < SCAN_MS) return scan.mods
  const home = homeOf($.plugin.root)
  const folders = [
    { base: `${home}/.claude/mods`, chatOnly: false },
    { base: `${home}/.claude/dev-mods/${chat}`, chatOnly: true },
  ]
  const found = new Map<string, ModInfo>()
  for (const { base, chatOnly } of folders) {
    const entries = await $.fs.list(base).catch(() => [])
    for (const entry of entries) {
      if (entry.kind !== 'dir') continue
      const mod = await readMod($, `${base}/${entry.name}`, chatOnly)
      if (mod && !found.has(mod.name)) found.set(mod.name, mod)
    }
  }
  const mods = [...found.values()].sort((a, b) => a.title.localeCompare(b.title))
  scan = { at: now, chat, mods }
  return mods
}

// Installed plugins that are mods (their hooks.json names a module), from the plugin registry.
// Their switch is Claude Code's own enabledPlugins in settings.json: new chats only.
const settingsPath = ($: EngineInterface) => `${homeOf($.plugin.root)}/.claude/settings.json`

async function readJson($: EngineInterface, path: string): Promise<any> {
  return (await $.fs.exists(path)) ? JSON.parse(String(await $.fs.read(path))) : {}
}

async function findInstalled($: EngineInterface): Promise<InstalledMod[]> {
  const home = homeOf($.plugin.root)
  const registry = await readJson($, `${home}/.claude/plugins/installed_plugins.json`).catch(() => ({}))
  const enabled = ((await readJson($, settingsPath($)).catch(() => ({}))).enabledPlugins ?? {}) as Record<string, unknown>
  const found: InstalledMod[] = []
  for (const [id, entries] of Object.entries((registry.plugins ?? {}) as Record<string, { installPath?: string }[]>)) {
    const dir = entries[0]?.installPath?.replace(/\\/g, '/')
    if (!dir) continue
    try {
      const hooks = await readJson($, `${dir}/hooks/hooks.json`)
      if (!Array.isArray(hooks.modules) || hooks.modules.length === 0) continue
      const manifest = await readJson($, `${dir}/.claude-plugin/plugin.json`)
      const name = id.split('@')[0] ?? id
      found.push({
        id,
        title: titleOf(name),
        what: typeof manifest.description === 'string' ? manifest.description : '',
        isEnabled: enabled[id] !== false,
      })
    } catch {
      // An unreadable plugin is left out.
    }
  }
  return found.sort((a, b) => a.title.localeCompare(b.title))
}

async function setPluginEnabled($: EngineInterface, id: string, on: boolean) {
  const settings = await readJson($, settingsPath($))
  settings.enabledPlugins = { ...settings.enabledPlugins, [id]: on }
  await $.fs.write(settingsPath($), `${JSON.stringify(settings, null, 2)}\n`)
  $.ui.toast(`${titleOf(id.split('@')[0] ?? id)} turned ${on ? 'on' : 'off'}. Takes effect in new chats.`)
  await $.ui.invalidate('ui.render')
}

function withoutChatSwitch(chats: Switches['chats'], chat: string, name: string): Switches['chats'] {
  const mine = { ...chats?.[chat] }
  delete mine[name]
  const rest = { ...chats }
  if (Object.keys(mine).length > 0) rest[chat] = mine
  else delete rest[chat]
  return rest
}

async function save($: EngineInterface, switches: Switches) {
  await $.fs.write(switchesPath($.plugin.root), `${JSON.stringify(switches, null, 2)}\n`)
  $.ui.invalidate('ui.render')
}

async function flip($: EngineInterface, name: string, on: boolean, where: Where) {
  // The scope as it is at the press, not as it was when the row was drawn.
  const scope = (await $.state.get(SCOPE)).value ?? 'project'
  const s = await readSwitches($)
  if (scope === 'chat') {
    await save($, { ...s, chats: { ...s.chats, [where.chat]: { ...s.chats?.[where.chat], [name]: on } } })
    return
  }
  // A project-wide flip also drops this chat's own switch, so the change shows here.
  const chats = withoutChatSwitch(s.chats, where.chat, name)
  if (where.project) {
    const projects = { ...s.projects, [where.project]: { ...s.projects?.[where.project], [name]: on } }
    await save($, { ...s, chats, projects })
  } else {
    await save($, { ...s, chats, global: { ...s.global, [name]: on } })
  }
}

async function useProjectSetting($: EngineInterface, name: string, where: Where) {
  const s = await readSwitches($)
  await save($, { ...s, chats: withoutChatSwitch(s.chats, where.chat, name) })
}

async function setScope($: EngineInterface, scope: Scope) {
  await $.state.set(SCOPE, scope)
  $.ui.invalidate('ui.render')
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Mods' })

async function cacheKeeperShows($: EngineInterface): Promise<boolean> {
  const dir = `${homeOf($.plugin.root)}/.claude/mods/cache-keeper`
  return (await $.fs.exists(dir)) && isOn(await readSwitches($), 'cache-keeper', await whereAmI($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Open the Mods panel: switch mods on or off' })
    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    await openPane($)
    return { text: 'Mods panel opened.' }
  })

  // One small button at the top right of whatever other mods draw above the prompt.
  // The Mods cell in cache-keeper's toolbar opens this pane.
  on('ui.press', { plugin: 'cache-keeper', element: 'ck-mods' }, async ($, e) => {
    await openPane($)
    return { element: e.element }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Button } = $.ui.resolve(e)
    // cache-keeper's toolbar carries its own Mods cell; no second button then.
    if (await cacheKeeperShows($)) return below
    const button = <Button key="open-mods" label="Mods" plain dimColor hover={{ scope: 'mods-btn', color: '#e8b56d', backgroundColor: '#2c2924' }} onPress={() => void openPane($)} />
    if (!below) return button
    return (
      <Box gap={2} alignItems="flex-start">
        {below}
        {button}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const where = await whereAmI($)
    const scope = (await $.state.get(SCOPE)).value ?? 'project'
    const switches = await readSwitches($).catch((): Switches => ({}))
    const mods = await findMods($, where.chat)
    const installed = await findInstalled($)
    const projectLabel = where.project ? 'This project' : 'Chats without a folder'

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text dimColor>Switches apply to</Text>
          <Box gap={1} flexWrap="wrap">
            <Button
              key="scope-project"
              label={projectLabel}
              variant={scope === 'project' ? 'primary' : 'secondary'}
              onPress={() => void setScope($, 'project')}
            />
            <Button
              key="scope-chat"
              label="This chat only"
              variant={scope === 'chat' ? 'primary' : 'secondary'}
              onPress={() => void setScope($, 'chat')}
            />
          </Box>
        </Box>
        {mods.length === 0 && <Text dimColor>No mods found.</Text>}
        {mods.map(mod => {
          const isModOn = isOn(switches, mod.name, where)
          const isChatSet = switches.chats?.[where.chat]?.[mod.name] !== undefined
          return (
            <Box key={`row-${mod.name}`} flexDirection="column">
              <Box justifyContent="space-between" gap={1}>
                <Text bold>{mod.title}</Text>
                {mod.switchable ? (
                  <Button
                    key={`switch-${mod.name}`}
                    label={isModOn ? '● On' : '○ Off'}
                    variant={isModOn ? 'primary' : 'secondary'}
                    onPress={() => void flip($, mod.name, !isModOn, where)}
                  />
                ) : (
                  <Text dimColor>No switch</Text>
                )}
              </Box>
              {mod.what !== '' && <Text dimColor>{mod.what}</Text>}
              {isChatSet && (
                <Box gap={1}>
                  <Text dimColor italic>
                    Set for this chat only
                  </Text>
                  <Button
                    key={`reset-${mod.name}`}
                    label="Use project setting"
                    dimColor
                    onPress={() => void useProjectSetting($, mod.name, where)}
                  />
                </Box>
              )}
              {!mod.switchable && (
                <Text dimColor italic>
                  Ask Claude to add the Mods switch to this mod.
                </Text>
              )}
              {mod.chatOnly && (
                <Text dimColor italic>
                  Loaded in this chat only
                </Text>
              )}
            </Box>
          )
        })}
        {installed.length > 0 && (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text bold>Installed</Text>
              <Text dimColor>Mods installed from a marketplace. Switching one applies to every chat, from the next new chat.</Text>
            </Box>
            {installed.map(mod => (
              <Box key={`inst-${mod.id}`} flexDirection="column">
                <Box justifyContent="space-between" gap={1}>
                  <Text bold>{mod.title}</Text>
                  <Button
                    key={`inst-switch-${mod.id}`}
                    label={mod.isEnabled ? '● On' : '○ Off'}
                    variant={mod.isEnabled ? 'primary' : 'secondary'}
                    onPress={() => void setPluginEnabled($, mod.id, !mod.isEnabled)}
                  />
                </Box>
                {mod.what !== '' && <Text dimColor>{mod.what}</Text>}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
