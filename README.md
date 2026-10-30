# Claude Code mods

My Claude Code mods, plus the benai-mods collection, set up the same way on every computer.

| Mod | What it does |
| --- | --- |
| cache-keeper | The toolbar above the prompt: cache countdown, Refresh, Keep warm, Compact, New session, settings, Mods |
| mods-panel | The Mods pane: switch each mod on or off, plus installed marketplace mods |
| effort-advisor | Shows and suggests the effort level in the status line |
| usage-guard | Usage limits in the status line; warns before agents hit a limit |
| close-out-check | After code changes, flags a stale changelog, version or handoff note |
| where-are-we | At session start: branch, changed files, PR, dev servers |
| ship-it | Release helper |
| screen-share | Local copy; not loaded (the benai-mods one is used) |
| benai-mods/ | Bundled collection: Helper Desk, Handoff, Reflect, Brain Dump, and more |

## New computer

Needs Git, the GitHub CLI signed in (`gh auth login`), and Claude Code. In PowerShell:

```powershell
gh repo clone Spartan3100/claude-mods "$HOME\.claude\mods"; & "$HOME\.claude\mods\install.ps1"
```

Then open a new Claude Code chat.

## Updating

On the computer where you change a mod: commit and push from `~/.claude/mods`.
Everywhere else: run `install.ps1` again. It pulls the changes and picks up any new mod folder.
