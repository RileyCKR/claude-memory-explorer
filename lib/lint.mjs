export const KNOWN_TYPES = ['user', 'feedback', 'project', 'reference'];

const stem = (file) => file.replace(/\.md$/, '');
const fold = (s) => s.toLowerCase().replace(/[-_\s]+/g, '-');

// Claude's recall matches on `name` alone. A link that matches only by filename
// or folded spelling still resolves, but lint flags it as loose.
export function buildResolver(memories) {
  const byName = new Map(), byStem = new Map(), byFold = new Map();
  for (const m of memories) {
    if (m.name && !byName.has(m.name)) byName.set(m.name, m.file);
    byStem.set(stem(m.file), m.file);
    for (const key of [m.name, stem(m.file)].filter(Boolean)) {
      if (!byFold.has(fold(key))) byFold.set(fold(key), m.file);
    }
  }
  return (target) => {
    if (byName.has(target)) return { resolved: byName.get(target), how: 'name' };
    const asFile = target.replace(/\.md$/, '');
    if (byStem.has(asFile)) return { resolved: byStem.get(asFile), how: 'file' };
    if (byFold.has(fold(target))) return { resolved: byFold.get(fold(target)), how: 'fuzzy' };
    return { resolved: null, how: null };
  };
}

// Any relative `.md` link in MEMORY.md counts as indexing that file, whether it
// sits in a `- [Title](file.md) — hook` line or in prose under a heading.
export function parseIndex(raw) {
  if (raw == null) return null;
  const entries = [];
  for (const [i, line] of raw.split('\n').entries()) {
    for (const x of line.matchAll(/\[([^\]]*)\]\(([^)\s]+\.md)\)/g)) {
      if (/^[a-z]+:/i.test(x[2])) continue;
      entries.push({ title: x[1], file: x[2].replace(/^\.\//, ''), line: i + 1 });
    }
  }
  return { raw, entries };
}

export function lintProject(project) {
  const out = [];
  const add = (severity, rule, file, message) => out.push({ project: project.id, file, severity, rule, message });
  const files = new Set(project.memories.map((m) => m.file));
  const inbound = new Map();

  for (const m of project.memories) {
    if (!m.frontmatter) {
      add('error', 'no-frontmatter', m.file, m.parseError || 'no frontmatter');
      continue;
    }
    if (!m.name) add('error', 'missing-name', m.file, 'frontmatter has no name');
    if (!m.description) add('error', 'missing-description', m.file, 'frontmatter has no description');
    if (m.name && m.name !== stem(m.file)) add('warn', 'name-mismatch', m.file, `name "${m.name}" differs from filename`);
    if (typeof m.frontmatter.type === 'string') add('warn', 'legacy-type', m.file, 'type is top-level instead of under metadata');
    if (!m.type) add('warn', 'missing-type', m.file, 'no type');
    else if (!KNOWN_TYPES.includes(m.type)) add('warn', 'unknown-type', m.file, `type "${m.type}" is not one of ${KNOWN_TYPES.join(', ')}`);

    for (const l of m.links) {
      if (!l.resolved) add('error', 'broken-link', m.file, `[[${l.target}]] matches no memory`);
      else {
        if (l.how !== 'name') add('warn', 'loose-link', m.file, `[[${l.target}]] matches ${l.resolved} only by ${l.how === 'file' ? 'filename' : 'folded spelling'}`);
        if (l.resolved !== m.file) inbound.set(l.resolved, (inbound.get(l.resolved) || 0) + 1);
      }
    }
  }

  const seen = new Map();
  for (const m of project.memories) {
    if (!m.name) continue;
    if (seen.has(m.name)) add('warn', 'duplicate-name', m.file, `name "${m.name}" also used by ${seen.get(m.name)}`);
    else seen.set(m.name, m.file);
  }

  if (!project.index) {
    add('warn', 'no-index', 'MEMORY.md', 'project has memories but no MEMORY.md');
  } else {
    const indexed = new Set(project.index.entries.map((e) => e.file));
    for (const e of project.index.entries) {
      if (!files.has(e.file)) add('warn', 'index-missing-file', 'MEMORY.md', `line ${e.line} points at ${e.file}, which does not exist`);
    }
    for (const f of files) {
      if (!indexed.has(f)) add('warn', 'not-indexed', f, 'not listed in MEMORY.md');
    }
  }

  for (const m of project.memories) {
    const outbound = m.links.some((l) => l.resolved && l.resolved !== m.file);
    if (m.frontmatter && !outbound && !inbound.get(m.file)) add('info', 'isolated', m.file, 'no links in or out');
  }
  return out;
}
