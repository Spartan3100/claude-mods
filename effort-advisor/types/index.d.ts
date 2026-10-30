export type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type AdvisorMode = 'ask' | 'auto' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'effort-advisor': {
      /** The level the mod applies to this session's requests; null leaves the session's own. */
      override: Level | null
      /** ask: offer a switch; auto: switch without asking; off: do nothing. */
      mode: AdvisorMode
      /** The session's own effort setting, as the last request carried it. */
      sessionLevel: Level | null
    }
  }
}
