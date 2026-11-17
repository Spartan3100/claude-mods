# REVIEW.md

Rules for every review of this app: the review-system reviewer agent, `/code-review`, and any
human pass. Linked from CLAUDE.md so it loads in every session. Keep it short; prune rules
that stop mattering.

## What counts as a real failure here
<!-- Say what "broken" means for THIS app. Examples - edit to fit: -->
- A user can see, change or delete another user's data.
- Money, totals, prices or quantities come out wrong.
- A user gets locked out, logged out, or loses work they entered.
- A screen named in requirements.md is missing, unreachable, or doesn't match mockup.html.
- An error is swallowed: the UI says it worked when it didn't.
- Copy or docs that state something false ("it lies").

## Severity
- **Important** - one of the failures above, a crash, data loss, or a security hole. Must be fixed
  before the feature passes.
- **Nit** - style, naming, small polish. Cap: report at most 3 per review, never block on them.
- **Pre-existing** - the problem was there before this change. Report once, never block on it.

## Ignore
- Generated, vendored and lock files: `node_modules/`, `dist/`, `build/`, `.next/`, `*.lock`,
  `package-lock.json`, `specs/*/mockup.html`.
- Formatting that a formatter or linter would fix.
- Cleanup-only suggestions with no behavior change.

## How to report
- Start with a count: "N important, N nit, N pre-existing." If there is nothing to fix, say
  "Nothing to fix." and stop.
- Every finding gives: severity, **class** (the kind of problem, e.g. `missing-authz-check`,
  `unhandled-empty-state`, `stale-state-after-mutation`), `file:line` as evidence, what breaks for
  the user, and the fix. Name the class so the fix is applied everywhere it occurs.
- Never repeat a finding already reported in an earlier round.

## How to test this app
<!-- Filled in by /review-system:setup; edit as needed. -->
- Start: `{{devCommand}}` then open {{appUrl}}
- Test data: {{testDatabase}}
- Check every screen state (loading, empty, error, success) and a 390px-wide mobile viewport.

## Learned rules
<!-- One line each. Added only after a human approves. Format:
- [YYYY-MM-DD] <rule> (why: <escaped bug | false positive>, feature: <name>) -->
