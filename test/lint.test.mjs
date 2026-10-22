import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildResolver, lintProject, parseIndex } from '../lib/lint.mjs';

const mem = (file, fm, links = []) => ({
  file,
  frontmatter: fm,
  name: fm?.name ?? null,
  description: fm?.description ?? null,
  type: fm?.metadata?.type ?? fm?.type ?? null,
  links,
});

test('resolver tries name, then filename (with or without .md), then folded spelling', () => {
  const resolve = buildResolver([
    mem('feedback_one.md', { name: 'feedback-one' }),
    mem('Project_Two.md', { name: 'Project_Two' }),
  ]);
  assert.deepEqual(resolve('feedback-one'), { resolved: 'feedback_one.md', how: 'name' });
  assert.deepEqual(resolve('feedback_one'), { resolved: 'feedback_one.md', how: 'file' });
  assert.deepEqual(resolve('feedback_one.md'), { resolved: 'feedback_one.md', how: 'file' });
  assert.deepEqual(resolve('project-two'), { resolved: 'Project_Two.md', how: 'fuzzy' });
  assert.deepEqual(resolve('nothing'), { resolved: null, how: null });
});

test('parseIndex takes every relative .md link, in list lines or prose, and skips URLs', () => {
  const raw = '# Memory\n- [A](a.md) — hook\n\nSee [plan](./plan.md) and [docs](https://x.dev/y.md).';
  assert.deepEqual(parseIndex(raw).entries, [
    { title: 'A', file: 'a.md', line: 2 },
    { title: 'plan', file: 'plan.md', line: 4 },
  ]);
  assert.equal(parseIndex(null), null);
});

test('lintProject reports each rule against the file that breaks it', () => {
  const ok = (name, extra = {}) => ({ name, description: 'd', metadata: { type: 'feedback' }, ...extra });
  const project = {
    id: 'p',
    index: parseIndex('- [a](a.md)\n- [b](b.md)\n- [gone](gone.md)\n- [legacy](legacy.md)\n- [raw](raw.md)\n- [dup](dup.md)'),
    memories: [
      mem('a.md', ok('a'), [
        { target: 'b', resolved: 'b.md', how: 'name' },
        { target: 'missing', resolved: null, how: null },
      ]),
      mem('b.md', ok('b'), [{ target: 'a.md', resolved: 'a.md', how: 'file' }]),
      mem('legacy.md', { name: 'legacy', description: 'd', type: 'feedback' }),
      mem('raw.md', null),
      mem('dup.md', ok('a', { metadata: { type: 'note' } })),
      mem('unindexed.md', { name: 'unindexed', description: '' }),
    ],
  };
  const got = lintProject(project).map((f) => `${f.severity} ${f.rule} ${f.file}`).sort();
  assert.deepEqual(got, [
    'error broken-link a.md',
    'error missing-description unindexed.md',
    'error no-frontmatter raw.md',
    'info isolated dup.md',
    'info isolated legacy.md',
    'info isolated unindexed.md',
    'warn duplicate-name dup.md',
    'warn index-missing-file MEMORY.md',
    'warn legacy-type legacy.md',
    'warn loose-link b.md',
    'warn missing-type unindexed.md',
    'warn name-mismatch dup.md',
    'warn not-indexed unindexed.md',
    'warn unknown-type dup.md',
  ]);
});

test('a project with memories but no MEMORY.md gets one no-index finding, not one per file', () => {
  const findings = lintProject({ id: 'p', index: null, memories: [mem('a.md', { name: 'a', description: 'd', metadata: { type: 'user' } })] });
  assert.deepEqual(findings.map((f) => f.rule), ['no-index', 'isolated']);
});
