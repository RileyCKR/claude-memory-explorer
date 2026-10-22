const SEVERITIES = ['error', 'warn', 'info'];

const FIXES = {
  'no-frontmatter': 'add a frontmatter block with `name`, `description` and `metadata.type`.',
  'missing-name': 'add a `name:` to the frontmatter.',
  'missing-description': 'add a one-line `description:` to the frontmatter.',
  'broken-link': "point the link at an existing memory's exact `name:`, or remove it.",
  'loose-link': "change the link to the target's exact `name:`.",
  'name-mismatch': 'make `name:` and the filename agree, then update every `[[link]]` and MEMORY.md line that used the old spelling.',
  'legacy-type': 'move the top-level `type:` under `metadata:`.',
  'missing-type': 'set `metadata.type` to user, feedback, project or reference.',
  'unknown-type': 'set `metadata.type` to user, feedback, project or reference.',
  'duplicate-name': 'give one of the two memories a distinct `name:` and update the links to it.',
  'no-index': 'create MEMORY.md with one `- [Title](file.md) — hook` line per memory.',
  'index-missing-file': 'remove the line, or point it at the file it meant.',
  'not-indexed': 'add a `- [Title](file.md) — hook` line for the file to MEMORY.md.',
  isolated: 'link it from related memories if any exist; otherwise leave it.',
};

const groupBy = (items, key) => {
  const out = new Map();
  for (const x of items) {
    const k = key(x);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(x);
  }
  return out;
};

// Claude Code already knows the memory format, so the prompt carries only what
// it lacks: absolute memory directories and a fix for each rule present.
export function lintReport(findings, projects) {
  if (!findings.length) return '';
  const rules = [...new Set(findings.map((f) => f.rule))].sort();
  const lines = [
    "Fix these lint findings in Claude Code's memory files.",
    '',
    'Suggested fix for each rule:',
    ...rules.map((r) => `- \`${r}\`: ${FIXES[r] || 'see the message.'}`),
  ];
  const byProject = [...groupBy(findings, (f) => f.project)].sort(([a], [b]) => projects.get(a).label.localeCompare(projects.get(b).label));
  for (const [pid, fs] of byProject) {
    const p = projects.get(pid);
    lines.push('', `## ${p.label}`, '', `Directory: \`${p.dir}\``, '');
    for (const [file, ffs] of [...groupBy(fs, (f) => f.file)].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- \`${file}\``);
      ffs.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.rule.localeCompare(b.rule));
      for (const f of ffs) lines.push(`  - ${f.severity} \`${f.rule}\`: ${f.message}`);
    }
  }
  return lines.join('\n') + '\n';
}
