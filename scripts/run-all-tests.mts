/**
 * Runs every scripts/test-*.mts and fails if any test fails, crashes, or runs zero checks.
 * Usage: npm test      (or: npx tsx scripts/run-all-tests.mts [filter])
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = import.meta.dirname;
const filter = process.argv[2] || '';
const files = fs.readdirSync(dir).filter((f) => /^test-.*\.mts$/.test(f) && f.includes(filter)).sort();
if (files.length === 0) { console.error('No test files found.'); process.exit(1); }

let failed = 0;
const rows: string[] = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync('npx', ['tsx', path.join(dir, f)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900_000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const lines = out.trim().split('\n');
  const last = (lines[lines.length - 1] || '').trim();
  const zero = /\b0 checks\b/.test(out);
  const ok = r.status === 0 && !zero;
  if (!ok) { failed++; console.log(`\n----- ${f} (exit ${r.status}) -----\n${lines.slice(-25).join('\n')}`); }
  rows.push(`${ok ? '✓ PASS' : '✗ FAIL'}  ${f.padEnd(34)} ${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${last.slice(0, 60)}`);
}
console.log('\n' + rows.join('\n'));
console.log(failed ? `\n${failed} of ${files.length} test files FAILED` : `\nAll ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
