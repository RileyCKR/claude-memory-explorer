import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const configPath = () =>
  process.env.MEMORY_EXPLORER_CONFIG ||
  join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'claude-memory-explorer', 'config.json');

// A hand-edited file with the wrong shape fails loudly, rather than quietly
// showing every project as if nothing were ignored.
export function parseConfig(text) {
  if (text == null) return { ignore: [] };
  const raw = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('config must be a JSON object');
  const ignore = raw.ignore ?? [];
  if (!Array.isArray(ignore) || !ignore.every((x) => typeof x === 'string')) throw new Error('"ignore" must be an array of project ids');
  return { ...raw, ignore };
}

export async function readConfig(path = configPath()) {
  const text = await readFile(path, 'utf8').catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e)));
  try {
    return parseConfig(text);
  } catch (e) {
    throw new Error(`${path}: ${e.message}`);
  }
}

let queue = Promise.resolve();

// Writes run one at a time, so two quick toggles cannot both read the old list
// and drop each other's change. The rename keeps a crash from leaving half a file.
export function updateConfig(fn, path = configPath()) {
  queue = queue
    .catch(() => {})
    .then(async () => {
      const next = fn(await readConfig(path));
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2) + '\n');
      await rename(tmp, path);
      return next;
    });
  return queue;
}
