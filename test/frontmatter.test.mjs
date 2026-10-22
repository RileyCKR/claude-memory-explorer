import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractLinks, memoryType, parseFrontmatter } from '../lib/frontmatter.mjs';

test('parses flat keys, quoted values and the nested metadata map', () => {
  const text = [
    '---',
    'name: feedback_pnpm',
    'description: "Use `pnpm view`, not \\"npm view\\""',
    'metadata: ',
    '  node_type: memory',
    '  type: feedback',
    "  note: 'it''s fine'",
    '---',
    'Body with [[other]].',
  ].join('\r\n');
  assert.deepEqual(parseFrontmatter(text), {
    frontmatter: {
      name: 'feedback_pnpm',
      description: 'Use `pnpm view`, not "npm view"',
      metadata: { node_type: 'memory', type: 'feedback', note: "it's fine" },
    },
    body: 'Body with [[other]].',
  });
});

test('reports a missing or unparseable block instead of throwing', () => {
  assert.equal(parseFrontmatter('# Just a heading\n').error, 'no frontmatter block');
  assert.match(parseFrontmatter('---\nname: x\n- list item\n---\n').error, /line 3/);
  assert.match(parseFrontmatter('---\n  orphan: x\n---\n').error, /outside a map/);
});

test('memoryType prefers metadata.type, ignores node_type, and falls back to a legacy top-level type', () => {
  assert.equal(memoryType({ type: 'project', metadata: { type: 'feedback' } }), 'feedback');
  assert.equal(memoryType({ metadata: { node_type: 'memory' } }), null);
  assert.equal(memoryType({ type: 'feedback' }), 'feedback');
  assert.equal(memoryType(null), null);
});

test('extractLinks trims targets and ignores links split across lines', () => {
  assert.deepEqual(extractLinks('See [[ a ]] and [[b-c]], not [[d\ne]].'), ['a', 'b-c']);
});
