import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeProjectPath } from '../lib/scan.mjs';

const dirs = new Set(['/home', '/home/me', '/home/me/src', '/home/me/src/my-app', '/home/me/src/my-app/.claude', '/home/me/src/my-app/.claude/worktrees', '/home/me/src/my-app/.claude/worktrees/x-1', '/home/me/src/my']);
const isDir = (p) => dirs.has(p);

test('decodeProjectPath restores dashes in names and dot-directories from what exists on disk', () => {
  assert.equal(decodeProjectPath('-home-me-src-my-app', isDir), '/home/me/src/my-app');
  assert.equal(decodeProjectPath('-home-me-src-my-app--claude-worktrees-x-1', isDir), '/home/me/src/my-app/.claude/worktrees/x-1');
  assert.equal(decodeProjectPath('-home-me-src-my', isDir), '/home/me/src/my');
  assert.equal(decodeProjectPath('-home-me-deleted-project', isDir), null);
});
