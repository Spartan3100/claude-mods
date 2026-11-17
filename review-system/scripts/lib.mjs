// Shared helpers for the review-system hooks and scripts. No dependencies.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CONFIG_REL = join('.claude', 'review-system.json');

export const DEFAULT_CONFIG = {
  hookMode: 'block',        // block | warn | off
  autoMerge: false,         // local merge into baseBranch for low/medium risk when the loop passes
  requireApproval: 'high',  // high: only high-risk evals wait for /review-system:approve | all: every feature does
  baseBranch: 'main',
  maxRounds: 5,
  earlyStopAfterFixRounds: 2,
  devCommand: '',
  appUrl: '',
  testDatabase: { strategy: 'none' },
};

// Walk up from `start` to the folder that holds .claude/review-system.json.
export function findProjectRoot(start) {
  let dir = resolve(start || process.cwd());
  for (;;) {
    if (existsSync(join(dir, CONFIG_REL))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function readConfig(root) {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(join(root, CONFIG_REL), 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function readFrontMatter(file) {
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*?)\s*(#.*)?$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

const readOr = (f) => (existsSync(f) ? readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

// Hash of what the human approved: requirements, evals (minus the status line) and mockup.
// Any later change to these means the approval no longer holds.
export function specHash(featureDir) {
  const evals = readOr(join(featureDir, 'eval.md')).replace(/^status:.*$/m, 'status:');
  const h = createHash('sha256');
  for (const part of [readOr(join(featureDir, 'requirements.md')), evals, readOr(join(featureDir, 'mockup.html'))]) {
    h.update(part).update('\0');
  }
  return h.digest('hex');
}

export function approvalState(featureDir) {
  const f = join(featureDir, '.approval');
  if (!existsSync(f)) return 'none';
  try {
    return JSON.parse(readFileSync(f, 'utf8')).hash === specHash(featureDir) ? 'valid' : 'stale';
  } catch {
    return 'stale';
  }
}

export function listFeatures(root) {
  const specs = join(root, 'specs');
  if (!existsSync(specs)) return [];
  return readdirSync(specs)
    .filter((n) => statSync(join(specs, n)).isDirectory() && existsSync(join(specs, n, 'eval.md')))
    .map((name) => {
      const dir = join(specs, name);
      const ev = readFrontMatter(join(dir, 'eval.md')) || {};
      const st = readFrontMatter(join(dir, 'state.md'));
      return {
        name,
        dir,
        status: ev.status || 'draft',
        risk: ev.risk || 'unrated',
        approval: approvalState(dir),
        loop: st,
      };
    });
}

// Whether this feature's evals need the human's /review-system:approve before building.
// Unrated risk counts as high, so a feature can't skip approval by leaving risk out.
export function approvalRequired(f, cfg = DEFAULT_CONFIG) {
  if (cfg.requireApproval === 'all') return true;
  return !['low', 'medium'].includes(f.risk);
}

// A feature whose evals a human still has to approve before app code may change.
export function needsReview(f, cfg = DEFAULT_CONFIG) {
  if (['parked', 'passed', 'stopped'].includes(f.status)) return false;
  if (!approvalRequired(f, cfg)) return false;
  return f.approval !== 'valid';
}
