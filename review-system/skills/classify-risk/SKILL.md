---
name: classify-risk
description: Rate a planned feature low / medium / high risk by asking what happens to a customer if it breaks, and record the rating in specs/<feature>/requirements.md. Run before write-evals; write-evals uses the rating to set how strict the evals are.
argument-hint: <feature> [short description]
---

Rate the risk of feature `$ARGUMENTS`. One question decides it: **what happens to a customer if this breaks?**

| Risk | If it breaks... | Examples |
|---|---|---|
| **low** | something only *looks* wrong; nothing stops working | copy, styling, layout, docs, an internal-only screen, an additive change behind a flag |
| **medium** | a feature stops working, but nobody loses anything and it can be fixed later | search, filters, a settings page, notifications, an export |
| **high** | a customer can **lose money**, get **locked out**, lose data, or **see another person's data**, which can't be taken back | payments, billing, auth / login / password reset, permissions, sharing, multi-tenant queries, deletes, migrations, anything touching PII |

Steps:
1. Read `specs/<feature>/requirements.md` if it exists; otherwise use the description given, and
   look at which parts of the codebase the feature will touch (auth, payments, data access...).
2. Rate it by the **worst** realistic failure, not the typical one. The change decides the rating,
   not who asked for it. If it touches any high-risk area at all, it is high.
3. Answer in 3 lines: `RISK: <level>`, the worst-case failure in one sentence, and which parts
   of the feature drive the rating.
4. Record it: set `risk: <level>` in the front matter of `specs/<feature>/requirements.md`
   (create the folder and the file from `${CLAUDE_SKILL_DIR}/../../templates/requirements.md` if needed,
   filling Goal and Requirements from what the user said and marking guesses as `(assumed)`).
   If `eval.md` already exists and was approved, tell the user a changed rating means the evals
   need rewriting and re-approval.
5. Say what the rating means next: low = core evals only and auto-merge allowed; medium = adds
   edge and error cases, auto-merge allowed; high = adds security / money / lockout evals and always
   waits for the human to merge.
