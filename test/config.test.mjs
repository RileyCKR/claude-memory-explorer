import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConfig } from '../lib/config.mjs';

test('parseConfig defaults a missing file, keeps unknown keys, and rejects a malformed ignore list', () => {
  assert.deepEqual(parseConfig(null), { ignore: [] });
  assert.deepEqual(parseConfig('{"other": 1}'), { other: 1, ignore: [] });
  assert.deepEqual(parseConfig('{"ignore": ["-home-a"]}'), { ignore: ['-home-a'] });
  assert.throws(() => parseConfig('{"ignore": "-home-a"}'), /array of project ids/);
  assert.throws(() => parseConfig('["-home-a"]'), /JSON object/);
});
