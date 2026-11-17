---
feature: {{feature}}
phase: building          # building | verifying | reviewing | awaiting-user | passed | stopped
round: 1
max_rounds: {{maxRounds}}
evals_total: 0
evals_failing: 0
branch: feature/{{feature}}
last_round_commit: {{baseCommit}}
stop_reason:
---

# Review loop: {{feature}}

## Still failing
<!-- eval IDs and open findings, each with its class and first round seen -->

## Rounds
<!-- ### Round N
- Builder: what changed (commit sha)
- Verifier: E1 PASS, E2 FAIL (evidence) ...
- Reviewer: N new findings (class, file:line, severity)
- Repeats: <finding/eval> seen since round K -->

## Decisions asked of the human

## Learned-rule candidates
<!-- class seen in 2+ rounds, or a finding the human called a false positive -->
