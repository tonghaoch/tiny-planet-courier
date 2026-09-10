import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Original raw: 684308 B; summed per-file gzip (level 9): 179766 B. Aggregate allowance: +2%.
export const BUNDLE_BUDGETS = Object.freeze({ chunkRawExclusive: 500000, totalRaw: 697994, totalGzip: 183361 });
export const DEV_MARKERS = ['__planetTest', 'setNavigationFixture', 'dockAtStop'];
const isJavaScript = file => /\.(?:js|mjs|cjs)$/i.test(file);
const normalize = value => value.replaceAll('\\', '/');
const isRelativeFile = value =>
  typeof value === 'string' &&
  value.length > 0 &&
  !/[:\x00-\x1f]/.test(value) &&
  normalize(value)
    .split('/')
    .every(part => part !== '' && part !== '.' && part !== '..');

export function validateManifest(manifest, emittedFiles) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Object.keys(manifest).length) {
    return ['Missing or empty production manifest.'];
  }
  const graph = new Map();
  let hasEntry = false;
  for (const [key, chunk] of Object.entries(manifest)) {
    if (
      !isRelativeFile(key) ||
      !chunk ||
      !isRelativeFile(chunk.file) ||
      !['imports', 'dynamicImports', 'css', 'assets'].every(
        field => chunk[field] === undefined || (Array.isArray(chunk[field]) && chunk[field].every(isRelativeFile)),
      )
    ) {
      return ['Invalid production manifest paths or references.'];
    }
    const name = normalize(key);
    if (graph.has(name)) return ['Duplicate normalized manifest key.'];
    const file = normalize(chunk.file);
    hasEntry ||= chunk.isEntry === true && isJavaScript(file);
    for (const emitted of [file, ...(chunk.css ?? []), ...(chunk.assets ?? [])].map(normalize)) {
      if (!emittedFiles.has(emitted)) errors.push(`Missing emitted file: ${emitted}`);
    }
    graph.set(name, [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])].map(normalize));
  }
  if (!hasEntry) errors.push('Missing production JavaScript entry.');
  const visiting = new Set();
  const visited = new Set();
  function visit(key) {
    if (visiting.has(key)) {
      errors.push(`Chunk dependency cycle: ${key}`);
      return;
    }
    if (visited.has(key)) return;
    if (!graph.has(key)) {
      errors.push(`Missing manifest reference: ${key}`);
      return;
    }
    visiting.add(key);
    for (const dependency of graph.get(key)) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of graph.keys()) visit(key);
  return errors;
}

export function auditBundle(directory, budgets = BUNDLE_BUDGETS) {
  const emittedFiles = new Set();
  const errors = [];
  function walk(relative = '') {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) emittedFiles.add(file);
      else errors.push(`Unsupported production output entry: ${file}`);
    }
  }
  try {
    walk();
  } catch {
    throw new Error('Missing or unreadable production output.');
  }
  const files = [...emittedFiles]
    .filter(isJavaScript)
    .sort()
    .map(file => {
      const content = readFileSync(join(directory, file));
      const raw = content.length;
      const gzip = gzipSync(content, { level: 9 }).length;
      if (!raw) errors.push(`Empty JavaScript file: ${file}`);
      if (raw >= budgets.chunkRawExclusive) errors.push(`Chunk raw budget exceeded: ${file} (${raw} B)`);
      for (const marker of DEV_MARKERS) {
        if (content.includes(marker)) errors.push(`Production DEV bridge marker: ${marker} in ${file}`);
      }
      return { file, raw, gzip };
    });
  if (!files.length) errors.push('Missing or empty production JavaScript output.');
  const raw = files.reduce((sum, file) => sum + file.raw, 0);
  const gzip = files.reduce((sum, file) => sum + file.gzip, 0);
  if (raw > budgets.totalRaw) errors.push(`Total raw budget exceeded: ${raw} > ${budgets.totalRaw} B`);
  if (gzip > budgets.totalGzip) errors.push(`Total gzip budget exceeded: ${gzip} > ${budgets.totalGzip} B`);
  try {
    const manifest = JSON.parse(readFileSync(join(directory, '.vite', 'manifest.json'), 'utf8'));
    errors.push(...validateManifest(manifest, emittedFiles));
  } catch {
    errors.push('Missing or unreadable production manifest.');
  }
  return { files, raw, gzip, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = auditBundle(resolve('dist'));
    console.log('Production JavaScript (bytes; per-file gzip level 9):');
    for (const { file, raw, gzip } of report.files) console.log(`${file}: raw=${raw}, gzip=${gzip}`);
    console.log(`TOTAL: raw=${report.raw}, gzip=${report.gzip}`);
    console.log(
      `Budgets: each raw < ${BUNDLE_BUDGETS.chunkRawExclusive}, total raw <= ${BUNDLE_BUDGETS.totalRaw}, total gzip <= ${BUNDLE_BUDGETS.totalGzip}`,
    );
    if (report.errors.length) {
      for (const error of report.errors) console.error(error);
      process.exitCode = 1;
    } else {
      console.log('PASS: budgets, DEV bridge markers, manifest references and acyclic chunk graph.');
    }
  } catch {
    console.error('Bundle audit failed: missing or unreadable production output.');
    process.exitCode = 1;
  }
}
