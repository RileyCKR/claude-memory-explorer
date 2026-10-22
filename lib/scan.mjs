import { statSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { extractLinks, memoryType, parseFrontmatter } from './frontmatter.mjs';
import { buildResolver, lintProject, parseIndex } from './lint.mjs';

export const claudeHome = () => process.env.CLAUDE_HOME || join(homedir(), '.claude');

// Claude Code encodes a project's cwd by replacing `/` and `.` with `-`, which is
// lossy when directory names contain dashes. Decode by walking the filesystem,
// longest component first, and keep the first split whose directories all exist.
// An empty part marks a dot-directory: `/.claude` encodes as `--claude`.
export function decodeProjectPath(id, isDir = (p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false) {
  const parts = id.replace(/^-/, '').split('-');
  const walk = (base, i) => {
    if (i === parts.length) return base;
    const dot = parts[i] === '' ? 1 : 0;
    for (let j = parts.length; j > i + dot; j--) {
      const next = `${base}/${dot ? '.' : ''}${parts.slice(i + dot, j).join('-')}`;
      const found = isDir(next) && walk(next, j);
      if (found) return found;
    }
    return null;
  };
  return walk('', 0);
}

export function projectLabel(id, home = homedir()) {
  const path = decodeProjectPath(id);
  if (!path) return id;
  return path === home ? '~' : path.startsWith(home + '/') ? '~' + path.slice(home.length) : path;
}

const readOptional = (path) => readFile(path, 'utf8').catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e)));

async function scanProject(id, dir) {
  const names = (await readdir(dir)).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').sort();
  const memories = await Promise.all(
    names.map(async (file) => {
      const path = join(dir, file);
      const [text, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
      const { frontmatter, body, error } = parseFrontmatter(text);
      return {
        file,
        name: frontmatter?.name || null,
        description: frontmatter?.description || null,
        type: memoryType(frontmatter),
        frontmatter,
        parseError: error || null,
        body,
        mtime: st.mtime.toISOString(),
        modified: frontmatter?.metadata?.modified || st.mtime.toISOString(),
        links: extractLinks(body).map((target) => ({ target })),
      };
    }),
  );
  const resolve = buildResolver(memories);
  for (const m of memories) m.links = m.links.map((l) => ({ ...l, ...resolve(l.target) }));
  const index = parseIndex(await readOptional(join(dir, 'MEMORY.md')));
  return { id, label: projectLabel(id), dir, index, memories };
}

export async function scanAll({ root = join(claudeHome(), 'projects'), ignore = [] } = {}) {
  const ids = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const projects = [];
  for (const id of ids) {
    const dir = join(root, id, 'memory');
    const exists = await stat(dir).then((s) => s.isDirectory(), () => false);
    if (!exists) continue;
    const project = await scanProject(id, dir);
    if (project.memories.length || project.index) projects.push({ ...project, ignored: ignore.includes(id) });
  }
  const lint = projects.flatMap(lintProject);
  return { root, scannedAt: new Date().toISOString(), projects, lint };
}
