// Parses the YAML subset Claude Code writes into memory files: flat `key: value`
// pairs plus indented maps such as `metadata:`. A full YAML parser would accept
// files Claude's own reader might not, which hides drift the lint should report.

const unquote = (v) => {
  const m = v.match(/^(["'])([\s\S]*)\1$/);
  if (!m) return v;
  return m[1] === '"' ? m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : m[2].replace(/''/g, "'");
};

export function parseFrontmatter(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!m) return { frontmatter: null, body: src, error: 'no frontmatter block' };

  const data = {};
  let map = null;
  for (const [i, line] of m[1].split('\n').entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const kv = line.match(/^(\s*)([\w.-]+):\s*(.*?)\s*$/);
    if (!kv) return { frontmatter: null, body: src.slice(m[0].length), error: `line ${i + 2}: cannot parse "${line}"` };
    const [, indent, key, value] = kv;
    if (!indent) {
      map = null;
      if (value === '') data[key] = map = {};
      else data[key] = unquote(value);
    } else if (map) {
      map[key] = unquote(value);
    } else {
      return { frontmatter: null, body: src.slice(m[0].length), error: `line ${i + 2}: indented key "${key}" outside a map` };
    }
  }
  return { frontmatter: data, body: src.slice(m[0].length) };
}

// Claude Code now writes the type under `metadata`; older files carry it at the top level.
export function memoryType(fm) {
  if (!fm) return null;
  if (fm.metadata && typeof fm.metadata === 'object' && fm.metadata.type) return fm.metadata.type;
  return typeof fm.type === 'string' && fm.type ? fm.type : null;
}

export function extractLinks(body) {
  return [...body.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((x) => x[1].trim());
}
