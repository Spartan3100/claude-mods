export type Scope = 'project' | 'chat'

export type ModInfo = {
  name: string
  title: string
  what: string
  /** Its hooks read the Mods panel switch (hooks/mod-switch.ts). */
  switchable: boolean
  /** Loaded from this chat's own dev-mods folder, not in every chat. */
  chatOnly: boolean
}

/** A mod installed as a plugin from a marketplace (benai-mods and the like). */
export type InstalledMod = {
  /** The plugin id, `name@marketplace`, as settings.json's enabledPlugins keys it. */
  id: string
  title: string
  what: string
  isEnabled: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'mods-panel': {
      /** Where a flipped switch applies: the project (or folder-less chats), or this chat alone. */
      scope: Scope
    }
  }
}
