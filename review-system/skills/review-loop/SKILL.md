---
name: review-loop
description: Build an approved feature in rounds - a builder, a verifier that runs every eval in the browser, and a reviewer that follows REVIEW.md, each in a fresh subagent - until every eval passes and review finds nothing new, with round caps, early stop, learned rules and optional auto-merge. Use when the user says "build feature X", "run the review loop", or after approving a feature's evals.
argument-hint: <feature>
allowed-tools: Bash(node:*)
---

Project state:

!`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs"`

Feature: `$ARGUMENTS`

Whenever this asks the human anything, use AskUserQuestion and wait: one sentence of context,
2-4 options with your recommendation first, each saying what you'll do if picked.

You are the **orchestrator**. You don't build, verify or review yourself; you start the
`review-system:builder`, `review-system:verifier` and `review-system:reviewer` agents, each in its
own fresh context, keep score in `state.md`, and handle Git. Keep your own messages short.

## 0. Preconditions (stop and tell the user if any fails)
- `specs/<feature>/eval.md` exists and its approval is `valid` or `not-required` in the state
  above. If not: "evals not approved; review them and run `/review-system:approve <feature>`".
- Read `.claude/review-system.json`: `baseBranch`, `maxRounds` (default 5),
  `earlyStopAfterFixRounds` (default 2), `autoMerge`, `devCommand`, `appUrl`.
- Git: the project is a repo with a clean working tree (else ask whether to commit or stash first).
  Create or check out `feature/<feature>` from `baseBranch`. Record the base commit.
- If `state.md` already exists with phase `awaiting-user` or `building`, resume from its round
  instead of starting over.

## 1. Start
- Write `specs/<feature>/state.md` from `${CLAUDE_SKILL_DIR}/../../templates/state.md`
  (round 1, phase building, evals_total = number of evals, evals_failing = evals_total,
  last_round_commit = base commit).
- Set `status: building` in eval.md (front matter only; change nothing else in that file).
- Start the dev server in the background with `devCommand` if it isn't already answering at `appUrl`.

## 2. Each round N (1..maxRounds)
1. **Build.** Start `review-system:builder` with a brief: feature name, round N, the failing evals
   with the verifier's evidence from the last round, open reviewer findings (id, class, file:line),
   and, if the reviewer wrote RETHINK, the word **RETHINK** and its paragraph. Round 1: just "build
   the feature". If the builder returns QUESTIONS, go to step 4 (ask the human) before verifying.
2. **Verify.** Set phase `verifying`. Make sure the app is running and reflects the changes
   (restart the dev server if needed). Start `review-system:verifier` with the feature name, app URL
   and test accounts. Record each eval's PASS/FAIL in state.md and set `evals_failing`.
3. **Review.** Set phase `reviewing`. Start `review-system:reviewer` with: round N, the base
   branch, the range to review (round 1: `<base>...HEAD` including uncommitted changes; later:
   changes since `last_round_commit`), and the full list of findings already reported (ids,
   classes, locations), so it doesn't repeat them.
4. **Decisions.** If the builder or reviewer raised a question only the human can answer, set
   phase `awaiting-user`, show a progress report (round, evals passing x/y, open findings) and ask
   with AskUserQuestion. Record the answer under "Decisions asked of the human", then continue.
5. **Checkpoint.** Commit everything on `feature/<feature>` locally:
   `wip(<feature>): round N - <passed>/<total> evals`. Set `last_round_commit` to that commit.
   Never push.
6. **Track repeats.** Match this round's failures to earlier ones: same eval ID failing, or same
   finding class at the same location (or reported STILL OPEN). Note "seen since round K".
7. **Decide:**
   - **Pass**: every eval PASS, VISUAL PASS or N/A, and no new or still-open **Important**
     finding -> step 3.
   - **Early stop**: any eval or finding has survived `earlyStopAfterFixRounds` (2) rounds of
     fixes, i.e. failed in rounds K, K+1 and K+2 -> phase `stopped`, `stop_reason: same problem
     after 2 fix rounds: <which>` -> step 3.
   - **Cap**: N = maxRounds -> phase `stopped`, `stop_reason: round cap` -> step 3.
   - Otherwise N+1 and back to 1. From round 4 on, the reviewer writes RETHINK instead of new
     findings, and the builder must change approach.

## 3. Finish
- Update state.md (`phase: passed` or `stopped`). On pass, set `evals_failing: 0` and
  `status: passed` in eval.md; on stop, `status: stopped`.
- **Learned rules.** Candidates: a finding class that came back in 2+ rounds, an eval that kept
  failing for the same reason, or a finding the reviewer or human called a false positive. For each,
  draft a one-line rule for REVIEW.md, e.g. `- [2026-10-30] Every list endpoint filters by the
  current user's account id (why: escaped bug, feature: invoices)`. Ask the human which to add
  (AskUserQuestion, multiSelect). Append only approved ones under `## Learned rules`. Never add
  a rule without approval.
- **Merge.**
  - Passed, `autoMerge: true`, risk low or medium: squash the wip commits into one commit
    `feat(<feature>): <summary>`, then `git checkout <base> && git merge --no-ff feature/<feature>`.
    Report the merge. Never push.
  - Passed, risk high, or `autoMerge: false`: leave the branch; tell the user it's ready and how to
    merge (`git checkout <base>` then `git merge --no-ff feature/<feature>`). High risk: say a
    human must review the diff before merging.
  - Stopped: don't merge. Report what's still failing and the stop reason, then ask what next:
    "Rework the requirements/evals" (needs re-approval for high risk), "One more round with a hint"
    (they give it), or "Leave it here".
  - Passed but not merged on its own (high risk or `autoMerge: false`): ask "Merge into `<base>`
    now?" with "Merge" / "I'll review the diff first" (recommend the second for high risk).
- Final report, short: result, rounds used, evals x/y, findings fixed by class, learned rules
  added, branch and merge status. Suggest `/review-system:first-time-user <feature>` next for
  medium/high risk.
