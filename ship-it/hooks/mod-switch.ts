// Mods panel switch: the switches live in ~/.claude/mod-switches.json. A chat's
// own switch wins over its project's, which wins over the default (on).
// Each mod carries its own copy of this file: keep the copies the same.
// Plain helpers only: a mod reads the file itself, since $ never crosses an import.

export type Switches = {
  /** Folder-less chats (and any project without its own switch). */
  global?: Record<string, boolean>
  /** By project folder, lowercase with forward slashes. */
  projects?: Record<string, Record<string, boolean>>
  /** By session id. */
  chats?: Record<string, Record<string, boolean>>
}

export type Where = { chat: string; project: string | null }

/** How long a mod trusts its last read of the switches, and how often it looks again. */
export const SWITCH_READ_MS = 1500
export const SWITCH_POLL_MS = 3000

export const homeOf = (root: string) => root.replace(/\\/g, '/').split('/.claude/')[0] ?? ''
export const switchesPath = (root: string) => `${homeOf(root)}/.claude/mod-switches.json`

// A chat the app made a throwaway folder for has no project of its own.
export function projectKey(root: string): string | null {
  const path = root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return path.includes('/scratch-workspaces/') ? null : path
}

export function parseSwitches(raw: string): Switches {
  if (!raw) return {}
  try {
    const json: unknown = JSON.parse(raw)
    return json && typeof json === 'object' ? (json as Switches) : {}
  } catch {
    return {}
  }
}

export function isOn(s: Switches, name: string, where: Where): boolean {
  const chat = s.chats?.[where.chat]?.[name]
  if (chat !== undefined) return chat
  const project = where.project ? s.projects?.[where.project]?.[name] : undefined
  if (project !== undefined) return project
  return s.global?.[name] ?? true
}
