/**
 * Shared test fixture loader.
 *
 * Several tests run the whole engine on a real PGSStats export. That file is private account data and is not committed,
 * so it must be supplied: put an export at public/assets/aistudio/PGSStats_e818d197.json, or point POKESORT_FIXTURE at one.
 * A missing fixture is a hard FAILURE (never a silent pass).
 */
import fs from 'node:fs';
import path from 'node:path';

export const FIXTURE_PATH = process.env.POKESORT_FIXTURE
  ? path.resolve(process.env.POKESORT_FIXTURE)
  : path.resolve(import.meta.dirname, '../public/assets/aistudio/PGSStats_e818d197.json');

export function loadFixture(): any {
  if (!fs.existsSync(FIXTURE_PATH)) {
    console.error(`\n  ✗ FAIL: test fixture not found: ${FIXTURE_PATH}\n    Add a PGSStats export there, or set POKESORT_FIXTURE=/path/to/PGSStats.json\n`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}
