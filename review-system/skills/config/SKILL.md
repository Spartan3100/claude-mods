---
name: config
description: Show or change this project's review-system settings - hook mode (block / warn / off), auto-merge (on / off), round cap - and list features with their status. Use when the user asks to toggle the review hooks, turn auto-merge on or off, or see review-system status.
argument-hint: "[hooks block|warn|off] [auto-merge on|off] [approval high|all] [rounds N]"
allowed-tools: Bash(node:*)
---

Current state:

!`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs"`

Requested change: `$ARGUMENTS`

1. If not set up, tell the user to run `/review-system:setup` and stop.
2. With no arguments, show the settings as a short table (hook mode, auto-merge, base branch,
   max rounds, dev command, app URL, test database) and the feature list, then stop.
3. Otherwise edit `.claude/review-system.json` in the project root. Allowed changes:
   - `hooks block|warn|off` -> `hookMode`. block = gates deny the action; warn = Claude is told but
     not stopped; off = no gating (the first-time-user code block stays on regardless).
   - `auto-merge on|off` -> `autoMerge` (true/false). On = when a loop passes, merge the feature branch
     into `baseBranch` locally for **low/medium** risk; high risk always waits for the human. Never pushes.
   - `approval high|all` -> `requireApproval`. high = only high-risk (or unrated) features wait for
     `/review-system:approve`; all = every feature does.
   - `rounds N` -> `maxRounds` (1-10).
   - `base <branch>` -> `baseBranch`.
   Keep every other key unchanged. Confirm with one line per change: old -> new.
