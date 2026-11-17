// review-system hook. `node gate.mjs pre` for PreToolUse, `node gate.mjs stop` for Stop.
// Does nothing outside projects that have .claude/review-system.json.
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { findProjectRoot, listFeatures, needsReview, readConfig, readFrontMatter } from '../scripts/lib.mjs';

const event = process.argv[2];
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const out = (obj) => {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
};
const deny = (reason) =>
  out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const note = (text) => out({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });

const root = findProjectRoot(input.cwd || process.cwd());
if (!root) process.exit(0);
const cfg = readConfig(root);
const tool = input.tool_name || '';
const ti = input.tool_input || {};

// Path of a tool call relative to the project root, with forward slashes; null if outside it.
function relPath(p) {
  if (!p) return null;
  const abs = isAbsolute(p) ? p : resolve(input.cwd || root, p);
  const rel = relative(root, abs).replace(/\\/g, '/');
  return rel.startsWith('..') || isAbsolute(rel) ? null : rel;
}

if (event === 'pre') {
  // 1. First-time-user tester: browser tools only, never the app's code. Always on.
  if (/(^|:)first-time-user$/.test(input.agent_type || '')) {
    if (/playwright/i.test(tool)) process.exit(0);
    deny(`The first-time-user tester may only use the browser. ${tool} is blocked so it cannot learn how the app is built.`);
  }

  if (cfg.hookMode === 'off') process.exit(0);
  const act = (reason) => (cfg.hookMode === 'block' ? deny(reason) : note(`review-system warning: ${reason}`));

  const isEdit = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool);
  const target = relPath(ti.file_path || ti.notebook_path);
  const text = [ti.content, ti.new_string, ...(ti.edits || []).map((e) => e.new_string)].filter(Boolean).join('\n');

  // 2. Only the human records approvals.
  const cmd = tool === 'Bash' || tool === 'PowerShell' ? String(ti.command || '') : '';
  if ((isEdit && target && /(^|\/)\.approval$/.test(target)) || /\.approval\b|approve\.mjs/.test(cmd)) {
    act('Approvals are recorded only by the human running /review-system:approve <feature>. Ask them to review and approve.');
  }
  if (isEdit && target && /^specs\/[^/]+\/eval\.md$/.test(target)) {
    if (/^status:\s*approved\b/m.test(text)) {
      act('Only /review-system:approve may set status: approved. Set status: in-review and ask the human to approve.');
    }
    if (/^status:\s*passed\b/m.test(text)) {
      const f = listFeatures(root).find((x) => target === `specs/${x.name}/eval.md`);
      if (!f || !f.loop || f.loop.evals_failing !== '0') {
        act(`${target} cannot be marked passed: state.md does not show every eval passing (evals_failing must be 0).`);
      }
    }
  }

  // Low/medium risk skips approval, so a high rating can only be lowered by the human.
  if (isEdit && target && /^specs\/[^/]+\/(eval|requirements)\.md$/.test(target) && /^risk:\s*(low|medium)\b/m.test(text)) {
    const current = (readFrontMatter(join(root, target)) || {}).risk;
    if (current === 'high') {
      act(`${target} is rated high risk; only the human may lower it (it would skip approval). Ask them, or keep risk: high.`);
    }
  }

  // 3. No building while a feature's evals are unapproved (or changed since approval).
  // Notes and docs (*.md) aren't app code; only code changes wait for approved evals.
  if (isEdit && target && !/^(specs|\.claude)\//.test(target) && !/\.md$/i.test(target)) {
    const pending = listFeatures(root).filter((f) => needsReview(f, cfg));
    if (pending.length) {
      const list = pending.map((f) => `${f.name} (${f.approval === 'stale' ? 'changed since approval' : f.status})`).join(', ');
      act(
        `Evals not approved for: ${list}. Don't change app code until the human reviews eval.md/mockup.html and runs ` +
          `/review-system:approve <feature>, or sets status: parked to set the feature aside.`,
      );
    }
  }
  process.exit(0);
}

if (event === 'stop') {
  if (cfg.hookMode === 'off' || input.agent_type) process.exit(0);
  const running = listFeatures(root).filter(
    (f) => f.loop && ['building', 'verifying', 'reviewing'].includes(f.loop.phase) && f.loop.evals_failing !== '0',
  );
  if (!running.length) process.exit(0);
  const list = running
    .map((f) => `${f.name} (round ${f.loop.round}/${f.loop.max_rounds}, ${f.loop.evals_failing || '?'} evals failing)`)
    .join(', ');
  const reason =
    `Review loop still running for ${list}. Don't call it done: continue the loop, or if you need the human, set ` +
    `phase: awaiting-user in specs/<feature>/state.md and ask; if the round cap or early-stop rule hit, set phase: stopped with stop_reason.`;
  if (cfg.hookMode === 'block' && !input.stop_hook_active) out({ decision: 'block', reason });
  out({ systemMessage: `review-system: ${reason}` });
}
