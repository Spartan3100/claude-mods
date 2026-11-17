---
name: first-time-user
description: Send a fresh agent that has never seen the code to use the live app like a first-time customer, on a temporary database, and report every place someone could get stuck, with suggested fixes. Use after a feature passes its review loop, before release, or when the user asks "test it like a new user".
argument-hint: <feature or goal>
allowed-tools: Bash(node:*)
---

Project state:

!`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs"`

Target: `$ARGUMENTS`

Whenever this asks the human anything, use AskUserQuestion and wait: one sentence of context,
2-4 options with your recommendation first, each saying what you'll do if picked.

## 1. Pick the goal
If the target is a feature in `specs/`, read its `requirements.md` (you may; the tester may not) and
turn it into **one plain-language customer goal** with no hints about how the UI works, e.g. "You
just signed up. Invite a teammate to your workspace." Never include routes, selectors or field names.

## 2. Temporary database (never touch real data)
Use `testDatabase` in `.claude/review-system.json`:
- `sqlite-copy` (`{ "strategy": "sqlite-copy", "file": "dev.db", "envVar": "DATABASE_URL" }`):
  copy the file to a temp path and point the env var at the copy.
- `postgres-temp` (`{ "strategy": "postgres-temp", "adminUrl": "...", "envVar": "DATABASE_URL",
  "migrate": "npx prisma migrate deploy" }`): create a database named `fttest_<timestamp>`,
  run the migrate/seed command against it, drop it at the end.
- `env-override` (`{ "strategy": "env-override", "env": { ... } }`): set those env vars.
- `in-memory`: the app needs nothing.
- `none` or missing: **stop and ask** the user how to give the test its own data (offer the
  strategies above), save the answer to the config, then continue. Don't run against the real DB.

Start the app with `devCommand` and the test env in the background, on a free port if the normal
one is in use. Wait until `appUrl` answers.

## 3. Run the tester
Start the `review-system:first-time-user` agent with only: the app URL and the goal. Nothing about
the code, the specs, or how the feature works. (It has browser tools only; a hook also blocks it
from reading files or running commands.) Wait for it to finish.

## 4. Clean up
Stop the app you started, delete the temp DB copy or drop the temp database.

## 5. Report and suggest fixes
- Show the tester's verdict and stuck points, grouped blocker / confusing / annoying.
- For each, now look at the code and suggest a concrete fix (file and change). Don't apply them.
- Ask which to apply: one multiSelect question per group, blockers first, each fix an option
  (recommended ones first, labelled "(Recommended)"). Applied fixes to a feature go through the normal flow: small copy/UX fixes
  can be made directly; anything that changes requirements means updating the spec and re-approval.
- Offer to turn real blockers into new evals in the feature's eval.md (needs re-approval).
