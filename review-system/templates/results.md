---
feature: {{feature}}
result: {{passed | stopped}}
risk: {{risk}}
date: {{YYYY-MM-DD}}
---

# Results: {{feature}}

| | |
|---|---|
| Result | passed / stopped (stop_reason) |
| Risk | low / medium / high |
| Evals | x/y passing |
| Rounds | N of maxRounds |
| Review findings | N important fixed, N open, N nit, N pre-existing |
| First-time user | finished goal: yes / no / skipped (why) |
| Branch / merge | `feature/<f>` - merged into `<base>` / waiting for you |

## Evals
| ID | Name | Result | Evidence (one line) |
|---|---|---|---|

## Review findings
<!-- by class: severity, file:line, round found, fixed in round / still open -->

## First-time user
<!-- verdict, then stuck points grouped blocker / confusing / annoying, each with a suggested fix -->

## Decisions
<!-- Everything that needs the human, numbered. After the question round, record each answer and what was done. -->
1. ...
