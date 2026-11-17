// Records a human approval of a feature's evals. Run only by the user-invoked
// /review-system:approve skill (shell injection), never by the model: the gate hook
// denies model tool calls that touch this script or .approval files.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot, specHash } from './lib.mjs';

const feature = (process.argv[2] || '').trim();
const root = findProjectRoot(process.cwd());
if (!root) {
  console.log('NOT APPROVED: no .claude/review-system.json here. Run /review-system:setup first.');
  process.exit(0);
}
if (!feature) {
  console.log('NOT APPROVED: name the feature, e.g. /review-system:approve checkout');
  process.exit(0);
}
const dir = join(root, 'specs', feature);
const evalFile = join(dir, 'eval.md');
if (!existsSync(evalFile)) {
  console.log(`NOT APPROVED: specs/${feature}/eval.md does not exist.`);
  process.exit(0);
}
const hash = specHash(dir);
writeFileSync(join(dir, '.approval'), JSON.stringify({ approvedAt: new Date().toISOString(), hash }, null, 2));
writeFileSync(evalFile, readFileSync(evalFile, 'utf8').replace(/^status:.*$/m, 'status: approved'));
console.log(`APPROVED: specs/${feature} (requirements.md, eval.md${existsSync(join(dir, 'mockup.html')) ? ', mockup.html' : ''}) at ${hash.slice(0, 12)}.`);
