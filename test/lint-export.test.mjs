import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintReport } from '../public/lint-export.js';

test('lintReport groups findings by project label, then file, with a fix for each rule present', () => {
  const projects = new Map([
    ['-b', { label: '~/src/b', dir: '/h/.claude/projects/-b/memory' }],
    ['-a', { label: '~/src/a', dir: '/h/.claude/projects/-a/memory' }],
  ]);
  const findings = [
    { project: '-b', file: 'y.md', severity: 'warn', rule: 'not-indexed', message: 'not listed in MEMORY.md' },
    { project: '-a', file: 'x.md', severity: 'warn', rule: 'loose-link', message: '[[q]] matches q.md only by filename' },
    { project: '-a', file: 'x.md', severity: 'error', rule: 'broken-link', message: '[[z]] matches no memory' },
  ];
  assert.equal(
    lintReport(findings, projects),
    [
      "Fix these lint findings in Claude Code's memory files.",
      '',
      'Suggested fix for each rule:',
      "- `broken-link`: point the link at an existing memory's exact `name:`, or remove it.",
      "- `loose-link`: change the link to the target's exact `name:`.",
      '- `not-indexed`: add a `- [Title](file.md) — hook` line for the file to MEMORY.md.',
      '',
      '## ~/src/a',
      '',
      'Directory: `/h/.claude/projects/-a/memory`',
      '',
      '- `x.md`',
      '  - error `broken-link`: [[z]] matches no memory',
      '  - warn `loose-link`: [[q]] matches q.md only by filename',
      '',
      '## ~/src/b',
      '',
      'Directory: `/h/.claude/projects/-b/memory`',
      '',
      '- `y.md`',
      '  - warn `not-indexed`: not listed in MEMORY.md',
      '',
    ].join('\n'),
  );
  assert.equal(lintReport([], projects), '');
});
