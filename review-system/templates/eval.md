---
feature: {{feature}}
status: draft            # draft -> in-review -> approved (only via /review-system:approve) -> building -> passed | stopped
risk: {{risk}}           # low | medium | high, from /review-system:classify-risk
mockup: {{mockup}}       # mockup.html, or none
---

# Evals: {{feature}}

Each eval is a fixed pass/fail check. It must be strict enough that bad work FAILS it.
The verifier runs every eval against the running app and records PASS or FAIL with evidence.
Do not soften an eval to make it pass; change it only with human re-approval.

## How to run
- App: `{{devCommand}}` at {{appUrl}}
- Data setup: <seed data / accounts each eval needs, or "none">

## Evals
<!-- One block per eval. IDs never change once approved; add new ones at the end. -->

### E1 - <short name>
- **Covers:** requirements.md > <section / bullet>
- **Type:** ui | api | data | security | visual
- **Steps:**
  1. ...
- **Pass if:** <observable, unambiguous result: exact text, element, status code, DB row>
- **Fail if:** <the specific wrong outcomes to look for>

## Visual check (only if mockup: mockup.html)
- Compare each app screen to the matching state in mockup.html at desktop and 390px wide.
- Pass if layout, content order, labels and states match; colors/spacing may differ within reason.

## Out of scope
- <things this feature deliberately does not do, so nobody fails it for them>

## Decisions made without asking
<!-- write-evals lists every assumption it made here, for the human reviewer. -->
