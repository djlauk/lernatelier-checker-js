import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Run via npm so the same npm executable is used on Windows and Linux.
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this check with npm run verify:package');
const npm = (args, cwd = process.cwd()) => execFileSync(process.execPath, [npmCli, ...args], {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});

mkdirSync('release', { recursive: true });
const packOutput = JSON.parse(npm(['pack', '--json', '--pack-destination', 'release']));
// npm <=11 returns an array; npm 12 returns an object keyed by package name.
const [packed] = Array.isArray(packOutput) ? packOutput : Object.values(packOutput);
const paths = new Set(packed.files.map(file => file.path));
for (const required of ['package.json', 'README.md', 'dist/index.js', 'dist/index.d.ts', 'templates/Lernperiode-NR.md']) {
  assert.ok(paths.has(required), `Package is missing ${required}`);
}
assert.ok([...paths].every(path => !/^(src|test|node_modules|\.github)\//.test(path)), 'Unexpected development files in package');

const consumer = mkdtempSync(join(tmpdir(), 'lernatelier-package-test-'));
writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
const archive = resolve('release', packed.filename);
// A consumer must not need TypeScript, lifecycle scripts or development dependencies.
npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', archive], consumer);
const { name } = JSON.parse(readFileSync('package.json', 'utf8'));
const smoke = `
  import assert from 'node:assert/strict';
  const { analyse } = await import(${JSON.stringify(name)});
  const result = analyse('# Lern-Periode NR');
  assert.equal(result.status, 'red');
  assert.ok(result.diagnostics.some(item => item.code === 'name.missing'));
`;
execFileSync(process.execPath, ['--input-type=module', '--eval', smoke], { cwd: consumer, stdio: 'inherit' });
console.log(`Verified installable distribution: ${archive}`);
