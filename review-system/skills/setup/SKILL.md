---
name: setup
description: Set up the review-system workflow in the current project - specs/ folder, REVIEW.md linked from CLAUDE.md, Git-per-feature rules, and .claude/review-system.json (hook mode, auto-merge, dev command, test database). Run once per project.
argument-hint: "[hooks block|warn|off] [auto-merge on|off]"
allowed-tools: Bash(node:*)
---

Current state:

!`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs"`

Options given: `$ARGUMENTS`

Whenever this asks the human anything, use AskUserQuestion and wait: one sentence of context,
2-4 options with your recommendation first, each saying what you'll do if picked.

Work in the project root (the Git root, or the current folder if there is no repo). If it's
already set up, only fill what's missing and say what you changed.

1. **Git.** If there is no repo, ask before running `git init` (the workflow needs Git: a branch per
   feature and a local commit per working version). Detect the base branch (`main`/`master`/current).
2. **Learn the app.** From package.json / pyproject / docker-compose / README / .env.example, find:
   the dev command, the local URL and port, the stack, and how the app stores data (SQLite file,
   Postgres URL, in-memory...). Ask the user only for what you can't find.
3. **Config.** Write `.claude/review-system.json`:
   ```json
   {
     "hookMode": "block",
     "autoMerge": false,
     "requireApproval": "high",
     "baseBranch": "<detected>",
     "maxRounds": 5,
     "earlyStopAfterFixRounds": 2,
     "devCommand": "<detected>",
     "appUrl": "<detected>",
     "testDatabase": { "strategy": "<sqlite-copy | postgres-temp | env-override | in-memory | none>", "...": "..." }
   }
   ```
   Apply `hooks ...` / `auto-merge ...` / `approval high|all` from the options. `requireApproval: high`
   means only high-risk features wait for `/review-system:approve`; `all` makes every feature wait. See `/review-system:first-time-user` for
   the testDatabase shapes.
4. **REVIEW.md** in the project root from `${CLAUDE_SKILL_DIR}/../../templates/REVIEW.md`. Fill the
   "How to test this app" placeholders, and adapt "What counts as a real failure" to this app
   (keep it short; delete examples that don't apply). If a REVIEW.md exists, merge in only missing
   sections, and keep a `## Learned rules` section at the bottom.
5. **CLAUDE.md** in the project root (create if missing). Append, once:
   ```markdown
   ## Review system
   @REVIEW.md

   - Use Git. Every feature is built on its own branch `feature/<name>` from `<base>`; commit each
     working version locally so any change can be found and rolled back. Never push. Merge to
     `<base>` only as `.claude/review-system.json` allows (autoMerge, and never for high risk).
   - New features go: `/review-system:classify-risk` -> `/review-system:write-evals` -> human runs
     `/review-system:approve` -> `/review-system:review-loop`. Bugs go through `/review-system:fix-a-bug`.
   - Don't call a feature done until every eval in its `specs/<feature>/eval.md` passes.
   ```
   (The `@REVIEW.md` import loads the review rules in every session, which is how the built-in
   `/code-review` command picks them up: it reads CLAUDE.md, not REVIEW.md directly.)
6. **Folders.** Create `specs/` with a short `specs/README.md` explaining the per-feature layout
   (`requirements.md`, `eval.md`, `mockup.html`, `state.md`, `.approval`). Add nothing to `.gitignore`;
   specs and approvals are meant to be committed.
7. **Browser.** Check the plugin's Playwright browser works: start the dev server, `browser_navigate`
   to the app URL, `browser_snapshot`. The first launch can fail once; retry. If it keeps failing, tell
   the user to add `"--browser", "msedge"` to the args in the plugin's `.mcp.json` and restart.
   If the Playwright tools are missing entirely, the plugin's `runtime/` folder needs
   `npm install --ignore-scripts` (it runs Playwright MCP through `node`, not `npx`).
8. Commit the setup files on the base branch (`chore: set up review-system`), after showing the user
   the list of files. Then report the settings in a short table and the next step:
   `/review-system:write-evals <feature> <description>`.
