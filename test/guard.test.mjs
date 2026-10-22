import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostAllowed } from '../lib/guard.mjs';

test('a loopback bind answers only loopback Host names; any other bind answers all', () => {
  assert.equal(hostAllowed('localhost:4317', '127.0.0.1'), true);
  assert.equal(hostAllowed('127.0.0.1:4317', '127.0.0.1'), true);
  assert.equal(hostAllowed('[::1]:4317', '::1'), true);
  assert.equal(hostAllowed('evil.example:4317', '127.0.0.1'), false);
  assert.equal(hostAllowed(undefined, '127.0.0.1'), false);
  assert.equal(hostAllowed('my-laptop.lan:4317', '0.0.0.0'), true);
});
