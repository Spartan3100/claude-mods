// Prints the project's review-system config and feature table. Used by skills for context.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { approvalRequired, findProjectRoot, listFeatures, readConfig, readFrontMatter } from './lib.mjs';

const root = findProjectRoot(process.cwd());
if (!root) {
  console.log('review-system: not set up in this project (no .claude/review-system.json).');
  process.exit(0);
}
const cfg = readConfig(root);
console.log(`project: ${root}`);
console.log(`config: ${JSON.stringify(cfg)}`);
const features = listFeatures(root);
// Feature folders that have requirements.md but no eval.md yet (rated, evals not written).
const specs = join(root, 'specs');
const early = existsSync(specs)
  ? readdirSync(specs).filter(
      (n) => statSync(join(specs, n)).isDirectory() && !features.some((f) => f.name === n) &&
        existsSync(join(specs, n, 'requirements.md')),
    )
  : [];
if (!features.length && !early.length) console.log('features: none yet');
for (const n of early) {
  const req = readFrontMatter(join(specs, n, 'requirements.md')) || {};
  console.log(`- ${n}: status=no-evals-yet risk=${req.risk || 'unrated'}`);
}
for (const f of features) {
  const loop = f.loop ? ` loop=${f.loop.phase} round ${f.loop.round}/${f.loop.max_rounds} failing=${f.loop.evals_failing}` : '';
  console.log(`- ${f.name}: status=${f.status} risk=${f.risk} approval=${approvalRequired(f, cfg) ? f.approval : 'not-required'}${loop}`);
}
