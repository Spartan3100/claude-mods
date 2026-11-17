# review-system

An evals-first build and review workflow for Claude Code, based on the AI LABS video
"Anthropic Just Released A New System For Using Claude Code" and Anthropic's
"Solving code review at Anthropic" post.

## Install (once)
Add this folder to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (separate entries with `;`),
next to your other mods, then restart the Claude app:

    C:\Users\rjones\.claude\mods\review-system

To try it without installing: `claude --plugin-dir C:\Users\rjones\.claude\mods\review-system`.

Playwright MCP is vendored in `runtime/` and launched with `node`, because `npx` is blocked on
this machine. To update it: `cd runtime && npm install --ignore-scripts`.

## Quick start: one command
    /review-system:check <feature> <what it should do>

Runs setup if needed, rates risk, and writes evals and a mockup. For **low/medium** risk it goes
straight on to build. For **high** risk it stops once for you to review and run
`/review-system:approve <feature>`, then `/review-system:check <feature>` again. Either way it
builds, verifies and reviews in rounds, runs the first-time-user test, and writes
`specs/<feature>/RESULTS.md`: an eval table, findings, stuck points, and every decision made.
Anything that needs you comes up as a clickable question with a recommended option and waits
for your answer: important ones (behavior, data, merges, a stopped loop, blockers a new user hit)
right away, minor ones (nits, learned rules, polish) together at the end. It picks up from wherever the feature is,
so re-running it is always safe.

## Per project, step by step
| Step | Command | What happens |
|---|---|---|
| once | `/review-system:setup [hooks block\|warn\|off] [auto-merge on\|off]` | config, REVIEW.md, CLAUDE.md link, specs/ |
| 1 | `/review-system:classify-risk <feature> <description>` | low / medium / high |
| 2 | `/review-system:write-evals <feature> <description>` | requirements.md, eval.md, mockup.html, status in-review |
| 3 | **you** review, then `/review-system:approve <feature>` | high risk only (or `approval all`): build gate opens (only you can run it) |
| 4 | `/review-system:review-loop <feature>` | builder -> verifier -> reviewer rounds on `feature/<name>` |
| 5 | `/review-system:first-time-user <feature>` | code-blind new-user test on a temp DB |
| all | `/review-system:check <feature> [description]` | steps 1-5 plus `RESULTS.md`; stops only for high-risk approval |
| any | `/review-system:fix-a-bug <what's wrong>` | reproduce, find cause in Git, fix on `fix/<slug>` |
| any | `/review-system:config [hooks ...] [auto-merge ...] [approval high\|all] [rounds N]` | show or toggle settings |

## Toggles (per project, `.claude/review-system.json`)
- `hookMode`: `block` (deny), `warn` (tell Claude, don't stop it), `off`. The first-time-user
  code block is always on.
- `autoMerge`: when a loop passes, merge locally into `baseBranch` for low/medium risk.
  High risk always waits for you. Nothing is ever pushed.
- `requireApproval`: `high` (default) = only high-risk or unrated features wait for
  `/review-system:approve`; `all` = every feature does.

## What the hooks enforce
- No app-code edits while any feature that needs approval (see `requireApproval`) is unapproved,
  or changed since approval (a hash of requirements.md + eval.md + mockup.html).
- Claude can't lower a feature's risk from high (that would skip approval); only you can.
- Only `/review-system:approve` can approve; Claude can't write `.approval` or set `status: approved`.
- `status: passed` only when state.md shows 0 failing evals.
- Claude can't end its turn while a loop is mid-round with failing evals (one block per stop,
  then a warning).
- The first-time-user agent can use browser tools only.

Limits: the gate checks Edit/Write tools; a Bash command that writes files isn't inspected. Notes and docs (`*.md`) are never blocked.
