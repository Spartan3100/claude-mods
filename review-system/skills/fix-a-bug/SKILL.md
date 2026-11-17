---
name: fix-a-bug
description: Find and fix the cause of a bug - reproduce it, test the cause hypothesis, use Git history to find the change that introduced it, then fix or roll back on a fix branch and add a regression eval. Use when the user reports something broken, "this used to work", or a feature isn't behaving as expected.
argument-hint: <what's wrong>
allowed-tools: Bash(node:*)
---

Project state:

!`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs"`

Problem: `$ARGUMENTS`

Whenever this asks the human anything, use AskUserQuestion and wait: one sentence of context,
2-4 options with your recommendation first, each saying what you'll do if picked.

1. **Pin it down.** Restate the bug as: steps, expected, actual. If you can't tell the steps from
   the report, ask one short question. Find the feature it belongs to in `specs/` if any.
2. **Reproduce first.** Make it happen: in the browser with the Playwright tools against the
   running app, with a failing test, or with a command. No fix until you've seen it fail. If it
   won't reproduce, report what you tried and stop.
3. **Hypothesize and test.** State the suspected cause and a check that would prove it wrong
   (a log line, a query, a narrower repro). Run the check. If wrong, next hypothesis. Keep a short
   list of what you ruled out.
4. **Find the change that caused it.** Use Git: `git log` on the files involved, the feature
   branches and their merge commits, and `git bisect run <repro command>` when there is a scripted
   repro. Name the commit and the feature it came from.
5. **Fix or roll back** on a new branch `fix/<slug>` from `baseBranch`:
   - Small, clear cause -> fix it at the source and fix the same **class** of bug wherever else it occurs.
   - A whole feature is bad and the fix is large -> offer `git revert -m 1 <merge-commit>` of that
     feature's merge instead, and ask first.
   Commit locally. Never push. Merge to `baseBranch` follows the same rule as review-loop:
   only if `autoMerge` is on and the feature's risk is low/medium; otherwise ask.
6. **Prove it.** Re-run the repro (must pass now), the project's tests, and the feature's evals
   with the `review-system:verifier` agent if it has some.
7. **Stop it coming back.**
   - Propose a regression eval for the feature's eval.md (adding it changes the spec, so the human
     must re-approve with `/review-system:approve <feature>`).
   - Ask: why didn't review catch this? Draft a one-line Learned rule for REVIEW.md and add it only
     if the human approves.
8. Report: cause, the commit that introduced it, the fix (or revert), proof, and follow-ups.
