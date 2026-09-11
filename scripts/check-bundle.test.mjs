import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { auditBundle, BUNDLE_BUDGETS, DEV_MARKERS, validateManifest } from './check-bundle.mjs';

function fixture(t, files = { 'assets/app.js': 'console.log(1);' }, manifest) {
  const directory = mkdtempSync(join(tmpdir(), 'planet-bundle-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = {
    ...files,
    '.vite/manifest.json': JSON.stringify(manifest ?? { 'index.html': { file: 'assets/app.js', isEntry: true } }),
  };
  for (const [file, content] of Object.entries(output)) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), content);
  }
  return directory;
}

const generous = { chunkRawExclusive: 1000000, totalRaw: 2000000, totalGzip: 2000000 };

test('approved five-location feature budgets stay fixed without relaxing the chunk limit', () => {
  assert.deepEqual(BUNDLE_BUDGETS, { chunkRawExclusive: 500000, totalRaw: 715000, totalGzip: 190000 });
});

test('individual raw limit is exclusive', t => {
  for (const size of [499999, 500000, 500001]) {
    const directory = fixture(t, { 'assets/app.js': 'a'.repeat(size) });
    const report = auditBundle(directory);
    assert.equal(
      report.errors.some(error => error.includes('Chunk raw budget')),
      size >= 500000,
    );
    assert.equal(report.raw, size);
  }
});

test('aggregate raw limit is inclusive and counts small public JS too', t => {
  for (const size of [714999, 715000, 715001]) {
    const directory = fixture(t, { 'assets/app.js': 'a'.repeat(350000), 'public/extra.js': 'b'.repeat(size - 350000) });
    const report = auditBundle(directory);
    assert.equal(report.files.length, 2);
    assert.equal(
      report.errors.some(error => error.includes('Chunk raw budget')),
      false,
    );
    assert.equal(
      report.errors.some(error => error.includes('Total raw budget')),
      size > 715000,
    );
  }
});

test('gzip is summed per file at level 9 and the aggregate limit is inclusive', t => {
  const content = 'console.log("level nine");'.repeat(100);
  const directory = fixture(t, { 'assets/app.js': content, 'extra.mjs': content, 'nested/extra.cjs': content });
  const expected = gzipSync(content, { level: 9 }).length * 3;
  for (const limit of [expected - 1, expected, expected + 1]) {
    const report = auditBundle(directory, { ...generous, totalGzip: limit });
    assert.equal(report.gzip, expected);
    assert.equal(report.raw, Buffer.byteLength(content) * 3);
    assert.equal(
      report.errors.some(error => error.includes('Total gzip budget')),
      limit < expected,
    );
  }
});

test('missing, empty, and non-JS output fail', t => {
  const directory = fixture(t, {});
  assert.throws(() => auditBundle(join(directory, 'missing')), /Missing or unreadable production output/);
  assert(auditBundle(directory).errors.some(error => error.includes('empty production JavaScript')));
  assert(auditBundle(fixture(t, { 'assets/style.css': 'body {}' })).errors.length > 0);
  assert(auditBundle(fixture(t, { 'assets/app.js': '' })).errors.some(error => error.includes('Empty JavaScript')));
});

test('all production bridge markers fail even in JS absent from the manifest', t => {
  for (const marker of DEV_MARKERS) {
    const directory = fixture(t, {
      'assets/app.js': 'console.log(1);',
      'public/bridge.js': `window.${marker} = true;`,
    });
    assert(auditBundle(directory).errors.some(error => error.includes(`Production DEV bridge marker: ${marker}`)));
  }
});

test('valid output passes and missing or malformed manifest fails', t => {
  const directory = fixture(t);
  assert.deepEqual(auditBundle(directory).errors, []);
  writeFileSync(join(directory, '.vite/manifest.json'), '{');
  assert(auditBundle(directory).errors.some(error => error.includes('production manifest')));
  rmSync(join(directory, '.vite/manifest.json'));
  assert(auditBundle(directory).errors.some(error => error.includes('production manifest')));
});

const emitted = new Set(['assets/app.js', 'assets/core.js', 'assets/renderer.js']);
const graph = () => ({
  'index.html': { file: 'assets/app.js', isEntry: true, imports: ['_core.js', '_renderer.js'] },
  '_core.js': { file: 'assets/core.js' },
  '_renderer.js': { file: 'assets/renderer.js', imports: ['_core.js'] },
});

test('manifest accepts a dependency DAG and normalized Windows paths', () => {
  assert.deepEqual(validateManifest(graph(), emitted), []);
  const manifest = graph();
  manifest['index.html'].file = 'assets\\app.js';
  manifest['index.html'].dynamicImports = ['nested\\extra.js'];
  manifest['nested/extra.js'] = { file: 'assets/core.js' };
  assert.deepEqual(validateManifest(manifest, emitted), []);
});

test('manifest rejects missing imports, dynamic imports, files and entries', () => {
  for (const field of ['imports', 'dynamicImports']) {
    const manifest = graph();
    manifest['index.html'][field] = ['_missing.js'];
    assert(validateManifest(manifest, emitted).some(error => error.includes('Missing manifest reference')));
  }
  assert(validateManifest(graph(), new Set(['assets/app.js'])).some(error => error.includes('Missing emitted file')));
  const manifest = graph();
  manifest['index.html'].isEntry = false;
  assert(validateManifest(manifest, emitted).some(error => error.includes('Missing production JavaScript entry')));
});

test('manifest rejects static, dynamic, and self cycles', () => {
  for (const field of ['imports', 'dynamicImports']) {
    const manifest = graph();
    manifest['_core.js'][field] = ['_renderer.js'];
    assert(validateManifest(manifest, emitted).some(error => error.includes('cycle')));
  }
  const manifest = graph();
  manifest['_core.js'].imports = ['_core.js'];
  assert(validateManifest(manifest, emitted).some(error => error.includes('cycle')));
});

test('invalid manifest structure and unsafe paths fail without exposing host paths', () => {
  for (const manifest of [
    null,
    [],
    {},
    { 'index.html': null },
    { 'index.html': { file: 'assets/app.js', imports: 'bad' } },
  ]) {
    assert(validateManifest(manifest, emitted).length > 0);
  }
  for (const file of ['/host/private.js', 'C:\\host\\private.js', '../outside.js', 'assets/../outside.js']) {
    const manifest = graph();
    manifest['index.html'].file = file;
    const errors = validateManifest(manifest, emitted);
    assert(errors.length > 0);
    assert(!errors.join().includes(file));
  }
});
