---
name: check
description: One command for a whole feature - sets up the project if needed, rates risk, writes evals and mockup, then (after the human approves once) runs the build/verify/review loop and the first-time-user test, and ends with one results report and one round of questions. Use when the user says "check feature X", "build and verify X", or wants the review system to run hands-off.
argument-hint: <feature> [description]
allowed-tools: Bash(node:*)
---

Project state:

!`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs"`

Request: `$ARGUMENTS` (first word = feature folder name, kebab-case; the rest = description).

You run the whole review-system flow for one feature. The human doesn't read along: when
something needs them, you stop and put it to them as a choice they can click, then continue with
their answer. Everything else runs without them.

Each stage below follows another skill's SKILL.md. Read that file and do its steps, with these
substitutions: `$ARGUMENTS` = the feature (plus description where it takes one),
`${CLAUDE_SKILL_DIR}` = that skill's own folder (`${CLAUDE_SKILL_DIR}/../<skill>`), and a
`!` status line = run `node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs"` yourself.
Wherever a stage says "ask the user", follow "How to ask" below instead.

## How to ask
Every question to the human goes through **AskUserQuestion**, never as a question in prose, and
you wait for the answer before continuing past it.
- **Ask now, and wait** when it's **important**: the answer changes what gets built or
  how it behaves for a customer, touches data, security or money, decides a merge, or blocks
  any eval. Also the cases in "When to stop and ask now".
- **Batch for the end** when it's **minor**: nits, learned-rule candidates, copy/polish fixes,
  anything that doesn't change behavior. These go in one final AskUserQuestion round (stage 8).
- Each question: one short sentence of context in the question text (what happened, why it
  matters), a `header` that starts with `Important` or `Minor`, and 2-4 options. Put your
  recommendation first with "(Recommended)" in its label. Each option's description says what you
  will do if it's picked and what it costs. Use multiSelect for lists (fixes, rules).
- Order questions most important first. Up to 4 per call; if there are more, make another call.
- Record every question and answer under Decisions in RESULTS.md.

## Pick up where things are
Use the project state above to find the first stage not yet done, and start there:

| State | Next stage |
|---|---|
| not set up | 1 |
| feature has no `requirements.md` with a risk | 2 |
| no `eval.md` | 3 |
| `eval.md` approval `none` or `stale` | 4 |
| approval `valid` or `not-required`, loop not `passed`/`stopped` | 5 |
| loop `passed` or `stopped`, no `RESULTS.md` | 6 |
| `RESULTS.md` exists | say so, show it, ask if they want a re-run |

## Stages
1. **Setup** - `${CLAUDE_SKILL_DIR}/../setup/SKILL.md` with defaults (hooks block, auto-merge off)
   unless the request says otherwise. Skip its "show the user the list of files" pause; just commit.
2. **Risk** - `${CLAUDE_SKILL_DIR}/../classify-risk/SKILL.md`. Needs a description; if none was
   given and there is no requirements.md, ask for it (free text via the "Other" option).
3. **Evals** - `${CLAUDE_SKILL_DIR}/../write-evals/SKILL.md`, through the self-check, ending with
   `status: in-review`.
4. **Approval checkpoint** - only when the status line shows approval `none` or `stale` (high or
   unrated risk, or `requireApproval: all`). If it shows `not-required`, skip straight to stage 5
   and list "risk rated <level>; evals weren't reviewed before building" as a Decision so the human
   can disagree with the rating. Never lower a risk rating to skip this stop. Otherwise: the gate
   blocks app code until the human approves, and you can't approve. Open the mockup in the browser
   pane if you can, show eval.md's path, then ask (header `Important: approve`), with the risk, the
   eval count and the riskiest one or two "Decisions made without asking" in the question text:
   - "Looks right (Recommended)": you will reply with exactly what to type,
     `/review-system:approve <feature>` then `/review-system:check <feature>`, and end your turn
     (only the human can approve, by typing it).
   - "Change something": they say what in "Other" or a follow-up; edit the spec, keep
     `status: in-review`, and ask again.
   - "Walk me through it": summarize every eval in one line each, then ask again.
5. **Build loop** - `${CLAUDE_SKILL_DIR}/../review-loop/SKILL.md`, all rounds. Builder or reviewer
   questions that are important: ask now. If the loop **stops** (round cap or early stop), ask now
   (header `Important: loop stopped`): what's still failing in one line, options such as "Rework the
   spec (Recommended)", "One more round with a hint" (they give it in Other), "Stop here and report".
   Learned-rule candidates are minor: save them for stage 8. Merge on its own only when the rules
   allow it without asking (passed, `autoMerge: true`, low/medium risk); otherwise the merge is an
   important question for stage 8, asked first.
6. **First-time user** - `${CLAUDE_SKILL_DIR}/../first-time-user/SKILL.md` if the loop passed and
   the feature has UI. Skip it (and say why in the report) if the loop stopped. Blockers the tester
   hit are important: ask now which to fix (multiSelect, recommended fixes listed first).
   Confusing/annoying points are minor: stage 8.
7. **Report** - write `specs/<feature>/RESULTS.md` from
   `${CLAUDE_SKILL_DIR}/../../templates/results.md` and commit it on the feature branch. Show only
   its summary table; the questions carry the rest.
8. **Final question round** - AskUserQuestion with whatever is left, important first (merge, then
   anything from the risk rating), then minor (learned rules, polish fixes; multiSelect). If nothing
   is left, say "Nothing needs you." and stop. Then do what they picked, following the owning
   skill's rules (rules into REVIEW.md, fixes that change requirements need the spec updated and
   re-approval, merges with `--no-ff`, never push).

## When to stop and ask now
Always important, always asked on the spot (with options, per "How to ask"):
- Stage 2 has no description to work from.
- The working tree is dirty when the loop starts: "Commit it (Recommended)" / "Stash it" / "Stop".
- The builder returns QUESTIONS, or the reviewer finds an Important issue it can't fix without a
  product decision.
- `testDatabase` is `none` and the app keeps real data (never test against it): offer the
  strategies from the first-time-user skill as options.

Keep your messages short while it runs: one line per stage ("Evals: 12 written, risk medium"),
one line per loop round ("Round 2: 11/12 evals, 1 new finding").
