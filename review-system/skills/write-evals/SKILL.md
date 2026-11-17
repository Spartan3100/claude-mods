---
name: write-evals
description: Turn a feature into strict pass/fail evals (specs/<feature>/eval.md) plus an HTML mockup of every screen state, then hand them to the human for approval before any building. Use when starting any new feature in a review-system project, or when the user says "write evals", "spec this feature", or "plan feature X".
argument-hint: <feature> [description]
allowed-tools: Bash(node:*)
---

Project state:

!`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs"`

Feature request: `$ARGUMENTS` (first word = feature folder name, kebab-case; the rest = description).

Whenever this asks the human anything, use AskUserQuestion and wait: one sentence of context,
2-4 options with your recommendation first, each saying what you'll do if picked.

You are writing the checks that prove the feature works **before** anything is built. Do not
edit app code in this skill (the build gate blocks it anyway).

## 1. Requirements and risk
- Folder: `specs/<feature>/`. If `requirements.md` is missing, create it from
  `${CLAUDE_SKILL_DIR}/../../templates/requirements.md` using the description. Mark anything you
  inferred as `(assumed)`.
- If `risk:` is missing or `unrated`, run the `/review-system:classify-risk` steps first.

## 2. Evals (`specs/<feature>/eval.md`)
Copy `${CLAUDE_SKILL_DIR}/../../templates/eval.md`, set `status: draft`, `risk:`, `mockup:`, and fill
`devCommand` / `appUrl` from `.claude/review-system.json`. Then write the evals:
- Every requirement R<n> and every screen state is covered by at least one eval. Each eval has
  concrete steps and an observable **Pass if** (exact text, element, status code, DB row) and **Fail if**.
- Strict enough that bad work fails: test what the user sees, not that code exists.
- Scale with risk:
  - **low**: happy path for each requirement + visual check.
  - **medium**: + empty / loading / error states, invalid and boundary input, refresh mid-flow,
    double-submit.
  - **high**: all of medium, plus negative security evals (user B cannot read or change user A's
    data by changing an ID; logged-out access is refused), money correctness (totals, rounding,
    currency, idempotent retries), lockout / recovery paths, and what is logged.
- Fill **Out of scope** so nobody fails the feature for things it doesn't do.

## 3. Mockup (`specs/<feature>/mockup.html`), only if the feature has UI
- One self-contained HTML file, no build step. Show **every** screen state side by side
  (default, loading, empty, error, success...) at desktop width, and the same states again in a
  390px-wide frame for mobile. Label each state.
- Match the app's existing look (read its CSS / components for colors, fonts, spacing).
- Set `mockup: mockup.html` in eval.md, else `mockup: none`.

## 4. Self-check, up to 3 passes
For each eval ask: could a broken implementation still pass this? Is the pass condition
observable without reading code? Is any requirement or state uncovered? Tighten and repeat.

## 5. Hand off for review
- Set `status: in-review`.
- List under **Decisions made without asking** every assumption you made.
- Open the files for the user: show `specs/<feature>/eval.md` and open `mockup.html` in the browser
  pane (or tell them the path).
- Tell the user, briefly: the risk level, how many evals, the decisions list, and:
  - If approval is required (`requireApproval: all` in `.claude/review-system.json`, or risk high
    or unrated): ask with AskUserQuestion, putting the riskiest one or two decisions in the
    question text: "Looks right (Recommended)" (you reply with exactly what to type:
    `/review-system:approve <feature>`; only the human can approve), "Change something" (they
    say what), "Walk me through the evals". Nothing gets built until they approve.
  - Otherwise (low/medium with `requireApproval: high`, the default): "Risk is <level>, so no approval
    is needed; building can start. eval.md and the mockup are there if you want to look."
- If the user asks for changes, make them, keep `status: in-review`, and ask again. Never set
  `status: approved` yourself.
