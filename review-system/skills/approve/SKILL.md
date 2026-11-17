---
name: approve
description: Human sign-off on a feature's evals and mockup. Records the approval so the build gate opens. Only the user can run this.
argument-hint: <feature>
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Approval result (recorded by a script before you saw this message):

!`node "${CLAUDE_SKILL_DIR}/../../scripts/approve.mjs" "$ARGUMENTS"`

If the line above starts with APPROVED: tell the user in one line that `specs/$ARGUMENTS` is approved and
that any later change to its requirements.md, eval.md or mockup.html will need approval again.
Then offer to continue with `/review-system:check $ARGUMENTS` (build loop, first-time-user test and
one results report), or just the build loop with `/review-system:review-loop $ARGUMENTS`.

If it starts with NOT APPROVED: repeat the reason and what to do. Do not try to approve it yourself.
